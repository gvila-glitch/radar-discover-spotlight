// Lectura de «Discover ahora» desde el servidor. Los artículos de Snoop no son legibles desde el navegador (RLS sin
// políticas): esta función comprueba primero que quien pregunta es del equipo y solo entonces lee con el cliente
// privilegiado, que nunca sale del servidor. Solo lectura; no guarda nada.
// Nuestro dominio no está en el código (el repositorio es público): se lee de la tabla config, clave «dominio_propio».
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { construirDiscoverMap, ventanaValida, type DiscoverMap } from "./discoverMap";

const MAX_ARTICULOS = 5000;
type Ctx = {
  supabase: { rpc: (f: "es_equipo") => PromiseLike<{ data: unknown; error: unknown }> };
};

export const leerDiscoverMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ventana?: unknown }) => ({ ventana: ventanaValida(d?.ventana) }))
  .handler(async ({ data, context }): Promise<DiscoverMap> => {
    const { data: equipo, error } = await (context as unknown as Ctx).supabase.rpc("es_equipo");
    if (error || equipo !== true) throw new Error("Sin permiso");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const ahora = new Date();
    const desde = new Date(ahora.getTime() - data.ventana * 3_600_000).toISOString();
    // Alertas de los últimos 7 días (lo mismo que enseña Alertas por defecto): las de hace más de un día salen como
    // «alerta anterior».
    const hace7d = new Date(ahora.getTime() - 7 * 24 * 3_600_000).toISOString();
    const [arts, alertas, propio, referencia] = await Promise.all([
      db
        .from("snoop_articulos")
        .select("id, url, medio, titular, recibido_en, alerta")
        .gte("recibido_en", desde)
        .order("recibido_en", { ascending: false })
        .limit(MAX_ARTICULOS),
      db.from("alertas").select("id, entidad, creada_en").gte("creada_en", hace7d),
      db.from("config").select("valor").eq("clave", "dominio_propio").maybeSingle(),
      db.from("medios_referencia").select("dominio").eq("activo", true),
    ]);
    if (arts.error || alertas.error) throw new Error("No se pudieron leer los datos de Discover.");
    return construirDiscoverMap({
      articulos: arts.data ?? [],
      alertas: (alertas.data ?? []).filter(
        (a): a is { id: number; entidad: string; creada_en: string } => !!a.creada_en,
      ),
      ahora,
      ventana: data.ventana,
      // Si fallan estas dos lecturas, la sección funciona igual, sin «Nosotros» ni estrellas.
      propio: propio.error ? null : (propio.data?.valor ?? null),
      referencia: referencia.error ? [] : (referencia.data ?? []).map((m) => m.dominio),
    });
  });
