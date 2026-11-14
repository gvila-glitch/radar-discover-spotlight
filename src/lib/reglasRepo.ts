import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { parsearModo, parsearReglas, type Reglas } from "./trendsAlertas";

/** Lee de config las reglas del filtro editorial (reglas_si, reglas_no y reglas_modo). Solo para código de servidor. */
export async function leerReglas(client: SupabaseClient<Database>): Promise<Reglas> {
  const { data, error } = await client
    .from("config")
    .select("clave,valor")
    .in("clave", ["reglas_si", "reglas_no", "reglas_modo"]);
  if (error) throw new Error("No se pudieron leer las reglas del filtro.");
  const mapa = Object.fromEntries((data ?? []).map((c) => [c.clave, c.valor]));
  return {
    si: parsearReglas(mapa["reglas_si"]),
    no: parsearReglas(mapa["reglas_no"]),
    modo: parsearModo(mapa["reglas_modo"]),
  };
}
