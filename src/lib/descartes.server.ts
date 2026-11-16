// Guardado de los descartes de la IA (lo llaman las tareas que crean alertas). Nunca hace fallar la creación de alertas:
// si no se puede guardar, lo cuenta en la respuesta de la tarea y sigue.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DIAS_CONSERVAR, diaMadrid, type FilaDescarte } from "./descartes";

export async function guardarDescartes(
  client: SupabaseClient<Database>,
  filas: FilaDescarte[],
  ahora = new Date(),
): Promise<{ descartes_guardados: number; descartes_error?: string }> {
  if (!filas.length) return { descartes_guardados: 0 };
  // Si el tema ya estaba hoy, se actualizan sus datos; la revisión (veredicto, nota, excepción) no se toca.
  const { error } = await client.from("descartes_ia").upsert(filas, { onConflict: "dia,clave" });
  if (error)
    return { descartes_guardados: 0, descartes_error: "No se pudieron guardar los descartes." };
  const limite = diaMadrid(new Date(ahora.getTime() - DIAS_CONSERVAR * 86_400_000));
  await client.from("descartes_ia").delete().lt("dia", limite);
  return { descartes_guardados: filas.length };
}
