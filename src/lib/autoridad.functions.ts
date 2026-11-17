// Autoridad en Discover para las alertas del panel. La tabla no es accesible desde el navegador: esta función del
// servidor comprueba primero que quien pregunta es del equipo y solo entonces lee con el cliente privilegiado, que
// nunca sale del servidor. Solo lectura. Al navegador le llega el resultado por tema, no la tabla entera.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calcularAutoridad, entidadesValidas, type Autoridad } from "./autoridad";
import type { LectorAutoridad } from "./autoridad.server";

type Ctx = {
  supabase: { rpc: (f: "es_equipo") => PromiseLike<{ data: unknown; error: unknown }> };
};

export const leerAutoridad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { entidades?: unknown }) => ({ entidades: entidadesValidas(d?.entidades) }))
  .handler(async ({ data, context }): Promise<Autoridad> => {
    const { data: equipo, error } = await (context as unknown as Ctx).supabase.rpc("es_equipo");
    if (error || equipo !== true) throw new Error("Sin permiso");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { leerFilasAutoridad } = await import("./autoridad.server");
    const filas = await leerFilasAutoridad(supabaseAdmin as unknown as LectorAutoridad);
    return calcularAutoridad(filas, data.entidades);
  });
