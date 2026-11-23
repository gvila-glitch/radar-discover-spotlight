// Autoridad en Discover para las alertas del panel. Esta función del servidor comprueba que quien pregunta es del
// equipo (para dar un error claro) y lee con la sesión del propio usuario: la base de datos decide el acceso
// (RLS con es_equipo() y permiso solo de lectura sobre las columnas necesarias). Sin cliente privilegiado.
// Al navegador le llega el resultado por tema, no la tabla entera.
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
    const { leerFilasAutoridad } = await import("./autoridad.server");
    const filas = await leerFilasAutoridad(context.supabase as unknown as LectorAutoridad);
    return calcularAutoridad(filas, data.entidades);
  });
