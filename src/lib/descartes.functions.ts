// Acciones del panel sobre los descartes de la IA. La tabla no es accesible desde el navegador: estas funciones del
// servidor comprueban primero que quien pregunta es del equipo (o administrador, para añadir excepciones) y solo
// entonces usan el cliente privilegiado, que nunca sale del servidor.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { anadirLinea, criterioValido, lineaReglaSi, type Descarte } from "./descartes";

type Ctx = {
  supabase: {
    rpc: (f: "es_equipo" | "es_admin") => PromiseLike<{ data: unknown; error: unknown }>;
  };
  claims: { email?: unknown };
};
async function exigir(context: unknown, permiso: "es_equipo" | "es_admin") {
  const c = context as Ctx;
  const { data, error } = await c.supabase.rpc(permiso);
  if (error || data !== true) throw new Error("Sin permiso");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { db: supabaseAdmin, email: String(c.claims.email ?? "").toLowerCase() };
}
const fecha = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const id = (v: unknown) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Descarte no válido.");
  return n;
};

/** Descartes desde un día (por defecto, solo los fuertes), los de más puntos primero. */
export const listarDescartes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { desde?: unknown; todos?: unknown }) => ({
    desde: fecha(d?.desde),
    todos: d?.todos === true,
  }))
  .handler(async ({ data, context }): Promise<Descarte[]> => {
    const { db } = await exigir(context, "es_equipo");
    let q = db.from("descartes_ia").select("*");
    if (data.desde) q = q.gte("dia", data.desde);
    if (!data.todos) q = q.eq("fuerte", true);
    const { data: filas, error } = await q
      .order("dia", { ascending: false })
      .order("puntos", { ascending: false })
      .order("creada_en", { ascending: false })
      .limit(1000);
    if (error) throw new Error("No se pudieron leer los descartes.");
    return filas ?? [];
  });

/** «Debería haber pasado» (o quitar la marca). Cualquiera del equipo; queda quién y cuándo. */
export const marcarDescarte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: unknown; marcar?: unknown; nota?: unknown }) => ({
    id: id(d?.id),
    marcar: d?.marcar === true,
    nota:
      typeof d?.nota === "string" ? d.nota.replace(/\s+/g, " ").trim().slice(0, 500) || null : null,
  }))
  .handler(async ({ data, context }): Promise<Descarte> => {
    const { db, email } = await exigir(context, "es_equipo");
    const cambios = data.marcar
      ? {
          veredicto: "deberia_pasar",
          veredicto_por: email,
          veredicto_en: new Date().toISOString(),
          nota: data.nota,
        }
      : { veredicto: null, veredicto_por: null, veredicto_en: null, nota: null };
    const { data: fila, error } = await db
      .from("descartes_ia")
      .update(cambios)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error || !fila) throw new Error("No se pudo guardar la revisión.");
    return fila;
  });

/**
 * Añadir como excepción (solo administradores): un criterio a las excepciones que lee la IA, o el nombre a las reglas de
 * «sí». Se aplica desde la siguiente tanda y queda registrado en el descarte quién lo añadió.
 */
export const anadirExcepcion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: unknown; tipo?: unknown; texto?: unknown }) => {
    const tipo = d?.tipo === "nombre" ? "nombre" : "criterio";
    const texto = typeof d?.texto === "string" ? d.texto : "";
    return { id: id(d?.id), tipo, texto } as const;
  })
  .handler(async ({ data, context }): Promise<Descarte> => {
    const { db, email } = await exigir(context, "es_admin");
    const { data: descarte, error: e1 } = await db
      .from("descartes_ia")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1 || !descarte) throw new Error("No se encontró el descarte.");
    const clave = data.tipo === "nombre" ? "reglas_si" : "excepciones";
    const linea = data.tipo === "nombre" ? lineaReglaSi(descarte.tema) : criterioValido(data.texto);
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
    if (e2) throw new Error("No se pudo guardar la excepción.");
    const { data: fila, error: e3 } = await db
      .from("descartes_ia")
      .update({
        excepcion: linea,
        excepcion_tipo: data.tipo,
        excepcion_por: email,
        excepcion_en: ahora,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (e3 || !fila)
      throw new Error("La excepción se guardó, pero no se pudo anotar en el descarte.");
    return fila;
  });
