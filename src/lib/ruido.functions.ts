// «Añadir a lo que no cubrimos» (solo administradores): desde una alerta marcada como ruido porque no es nuestro tema,
// añade un criterio a las excepciones que lee la IA o el nombre a las reglas de «no». Es lo simétrico de «Añadir como
// excepción» en los descartes. La función comprueba primero es_admin() y solo entonces usa el cliente privilegiado,
// que nunca sale del servidor. Se aplica desde la siguiente tanda y queda anotado en la alerta quién lo añadió.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { anadirLinea, criterioValido, lineaReglaSi } from "./descartes";
import { nombreVisible } from "./metricas";

type Ctx = {
  supabase: { rpc: (f: "es_admin") => PromiseLike<{ data: unknown; error: unknown }> };
  claims: { email?: unknown };
};
// Las columnas no_cubrimos* aún no están en los tipos generados (supabase/motivo-ruido.sql): se escriben con este tipo.
type TablaAlertas = {
  update: (v: Record<string, string>) => {
    eq: (c: "id", v: number) => PromiseLike<{ error: unknown }>;
  };
};
export type NoCubrimos = { no_cubrimos: string; no_cubrimos_por: string; no_cubrimos_en: string };

export const anadirNoCubrimos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: unknown; tipo?: unknown; texto?: unknown }) => {
    const n = Number(d?.id);
    if (!Number.isInteger(n) || n <= 0) throw new Error("Alerta no válida.");
    return {
      id: n,
      tipo: d?.tipo === "nombre" ? "nombre" : "criterio",
      texto: typeof d?.texto === "string" ? d.texto : "",
    } as const;
  })
  .handler(async ({ data, context }): Promise<NoCubrimos> => {
    const c = context as unknown as Ctx;
    const { data: admin, error } = await c.supabase.rpc("es_admin");
    if (error || admin !== true) throw new Error("Sin permiso");
    const email = String(c.claims.email ?? "").toLowerCase();
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: alerta, error: e1 } = await db
      .from("alertas")
      .select("id, entidad")
      .eq("id", data.id)
      .single();
    if (e1 || !alerta) throw new Error("No se encontró la alerta.");
    const clave = data.tipo === "nombre" ? "reglas_no" : "excepciones";
    const linea =
      data.tipo === "nombre"
        ? lineaReglaSi(nombreVisible(alerta.entidad))
        : criterioValido(data.texto);
    if (!linea) throw new Error("El criterio debe tener entre 10 y 300 caracteres.");
    const { data: actual } = await db
      .from("config")
      .select("valor")
      .eq("clave", clave)
      .maybeSingle();
    const ahora = new Date().toISOString();
    const valor = anadirLinea(actual?.valor, data.tipo === "nombre" ? linea : `- ${linea}`);
    const { error: e2 } = await db
      .from("config")
      .upsert({ clave, valor, actualizado_en: ahora }, { onConflict: "clave" });
    if (e2) throw new Error("No se pudo guardar en Configuración.");
    const anotada =
      data.tipo === "nombre" ? `No avisar nunca de «${linea}» (regla de «no»)` : linea;
    const nota: NoCubrimos = {
      no_cubrimos: anotada,
      no_cubrimos_por: email,
      no_cubrimos_en: ahora,
    };
    const { error: e3 } = await (db.from("alertas") as unknown as TablaAlertas)
      .update(nota)
      .eq("id", data.id);
    if (e3) throw new Error("Se guardó en Configuración, pero no se pudo anotar en la alerta.");
    return nota;
  });
