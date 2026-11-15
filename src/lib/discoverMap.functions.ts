// Lectura del Discover Map desde el servidor. Los artículos de Snoop no son legibles desde el navegador (RLS sin
// políticas): esta función comprueba primero que quien pregunta es del equipo y solo entonces lee con el cliente
// privilegiado, que nunca sale del servidor. Solo lectura; no guarda nada.
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
    const hace24h = new Date(ahora.getTime() - 24 * 3_600_000).toISOString();
    const [arts, alertas] = await Promise.all([
      db
        .from("snoop_articulos")
        .select("id, url, medio, titular, recibido_en")
        .gte("recibido_en", desde)
        .order("recibido_en", { ascending: false })
        .limit(MAX_ARTICULOS),
      db.from("alertas").select("entidad").gte("creada_en", hace24h),
    ]);
    if (arts.error || alertas.error) throw new Error("No se pudieron leer los datos de Discover.");
    return construirDiscoverMap({
      articulos: arts.data ?? [],
      alertas: (alertas.data ?? []).map((a) => a.entidad),
      ahora,
      ventana: data.ventana,
    });
  });
