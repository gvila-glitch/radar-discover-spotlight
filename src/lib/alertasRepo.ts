// Único acceso a alertas: el panel aplica RLS; los trabajos verificados reciben su cliente privilegiado.
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import type { Alerta, CambiosValoracion } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AlertaReciente, NuevaAlertaTrends } from "./trendsAlertas";
import type { NuevaAlertaWikipedia } from "./wikipediaPicos";
const rowSchema = z
  .object({
    prioridad: z.enum(["alta", "media"]),
    estado: z.enum(["pendiente", "util", "ruido", "publicada"]),
    titulares_seo: z.array(z.object({ medio: z.string(), titular: z.string() })),
  })
  .passthrough();
function alerta(row: unknown): Alerta {
  return rowSchema.parse(row) as unknown as Alerta;
}
export async function listAlertas(desde: Date | null): Promise<Alerta[]> {
  const rows: Alerta[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase
      .from("alertas")
      .select("*")
      .order("creada_en", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    if (desde) query = query.gte("creada_en", desde.toISOString());
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []).map(alerta));
    if (!data || data.length < 1000) return rows;
  }
}
export async function valorar(id: number, cambios: CambiosValoracion): Promise<Alerta> {
  const { data: identity, error: authError } = await supabase.auth.getUser();
  if (authError || !identity.user?.email) throw new Error("Sesión no válida");
  const { data, error } = await supabase
    .from("alertas")
    .update({
      estado: cambios.estado,
      pieza_url: cambios.estado === "publicada" ? cambios.pieza_url : null,
      estado_actualizado_en: cambios.estado_actualizado_en,
      estado_por: identity.user.email,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return alerta(data);
}

// Only call with the admin client after cron authentication at the HTTP boundary.
export async function leerAlertasParaTrends(
  client: SupabaseClient<Database>,
  since: Date,
  until: Date,
): Promise<AlertaReciente[]> {
  const rows: AlertaReciente[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("alertas")
      .select("entidad,creada_en")
      .gte("creada_en", since.toISOString())
      .lte("creada_en", until.toISOString())
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error("No se pudieron leer las alertas recientes.");
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

const guardadoSchema = z
    .object({
      creadas: z.array(z.object({ id: z.number(), entidad: z.string(), contexto: z.string() })),
      descartadas: z.array(
        z.object({
          termino: z.string(),
          motivo: z.enum(["ya_avisada", "tope_diario", "fuera_de_horario", "sin_termino"]),
        }),
      ),
      total_hoy_antes: z.number().int(),
      total_hoy_despues: z.number().int(),
      max_alertas_dia: z.number().int(),
    });

export async function guardarAlertasTrends(client: SupabaseClient<Database>, rows: NuevaAlertaTrends[]) {
  const { data, error } = await client.rpc("guardar_alertas_trends_atomicas", { candidatas: rows });
  if (error) throw new Error("No se pudieron guardar las alertas de Trends.");
  return guardadoSchema.parse(data);
}

// Shares the Trends transaction lock, daily cap and 24-hour deduplication.
export async function guardarAlertasWikipedia(client: SupabaseClient<Database>, rows: NuevaAlertaWikipedia[]) {
  if (rows.length === 0) return { creadas: [], descartadas: [], total_hoy_antes: 0, total_hoy_despues: 0, max_alertas_dia: 0 };
  const { data, error } = await client.rpc("guardar_alertas_wikipedia_atomicas", { candidatas: rows });
  if (error) throw new Error("No se pudieron guardar las alertas de Wikipedia.");
  return guardadoSchema.parse(data);
}
