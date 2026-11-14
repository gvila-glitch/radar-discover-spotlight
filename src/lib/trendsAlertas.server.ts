import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { guardarAlertasTrends, leerAlertasParaTrends } from "./alertasRepo";
import {
  inicioDiaMadrid,
  parsearModo,
  parsearReglas,
  planificarAlertasTrends,
  type Reglas,
  type TendenciaAlerta,
} from "./trendsAlertas";
import { conBloqueoRadar } from "./jobLock.server";

export async function convertirTrendsEnAlertas(client: SupabaseClient<Database>, now = new Date()) {
  return conBloqueoRadar(client, "trends-a-alertas", () => ejecutarConversion(client, now));
}

async function ejecutarConversion(client: SupabaseClient<Database>, now: Date) {
  const trends: TendenciaAlerta[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("trends")
      .select("id,termino,volumen,capturado_en,noticias")
      .gte("capturado_en", new Date(now.getTime() - 2 * 3600000).toISOString())
      .lte("capturado_en", now.toISOString())
      .order("capturado_en", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 999);
    if (error) throw new Error("No se pudieron leer las tendencias.");
    for (const row of data ?? []) {
      if (row.capturado_en !== null) trends.push({ ...row, capturado_en: row.capturado_en });
    }
    if (!data || data.length < 1000) break;
  }
  const exclusions: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("exclusiones")
      .select("valor")
      .eq("tipo", "tema")
      .eq("activo", true)
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error("No se pudieron leer las exclusiones.");
    exclusions.push(...(data ?? []).map((e) => e.valor));
    if (!data || data.length < 1000) break;
  }
  const { data: settings, error } = await client
    .from("config")
    .select("clave,valor")
    .in("clave", ["max_alertas_dia", "hora_inicio", "hora_fin"]);
  if (error) throw new Error("No se pudo leer la configuración.");
  // Las reglas del filtro se leen aparte: un valor vacío aquí no debe invalidar la configuración de horario.
  const { data: reglasConfig, error: reglasError } = await client
    .from("config")
    .select("clave,valor")
    .in("clave", ["reglas_si", "reglas_no", "reglas_modo"]);
  if (reglasError) throw new Error("No se pudieron leer las reglas del filtro.");
  const reglasMapa = Object.fromEntries((reglasConfig ?? []).map((c) => [c.clave, c.valor]));
  const reglas: Reglas = {
    si: parsearReglas(reglasMapa["reglas_si"]),
    no: parsearReglas(reglasMapa["reglas_no"]),
    modo: parsearModo(reglasMapa["reglas_modo"]),
  };
  const today = inicioDiaMadrid(now);
  const since = new Date(Math.min(today.getTime(), now.getTime() - 24 * 3600000));
  const alertas = await leerAlertasParaTrends(client, since, now);
  const plan = planificarAlertasTrends({
    now,
    trends,
    exclusiones: exclusions,
    alertas,
    totalHoy: alertas.filter((a) => Date.parse(a.creada_en) >= today.getTime()).length,
    config: Object.fromEntries((settings ?? []).map((c) => [c.clave, c.valor])),
    reglas,
  });
  const guardado = await guardarAlertasTrends(client, plan.nuevas);
  const { nuevas: _nuevas, ...report } = plan;
  const descartadas = [...plan.descartadas, ...guardado.descartadas];
  return {
    ...report,
    ...guardado,
    descartadas,
    alertas_creadas: guardado.creadas.length,
    tendencias_descartadas: descartadas.length,
  };
}
