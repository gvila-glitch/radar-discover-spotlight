import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { guardarAlertasTrends, leerAlertasParaTrends } from "./alertasRepo";
import {
  candidatasTrends,
  inicioDiaMadrid,
  parsearModo,
  parsearReglas,
  planificarAlertasTrends,
  type Reglas,
  type TendenciaAlerta,
  type TendenciaX,
} from "./trendsAlertas";
import { conBloqueoRadar } from "./jobLock.server";
import { conNoticia, sinPrefijo } from "./contexto";
import { buscarNoticiaGoogle } from "./contexto.server";
import { clasificarConIA, informeIA, leerPerfilIA } from "./ia.server";
import { filasDescartesTrends } from "./descartes";
import { guardarDescartes } from "./descartes.server";

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
  // Capturas de X de las últimas 24 h (unas 30 filas por hora): sirven para saber el puesto y desde cuándo está en tendencia.
  const xTendencias: TendenciaX[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("x_tendencias")
      .select("id,nombre,posicion,capturado_en,categoria,publicaciones")
      .gte("capturado_en", new Date(now.getTime() - 24 * 3600000).toISOString())
      .lte("capturado_en", now.toISOString())
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error("No se pudieron leer las tendencias de X.");
    for (const row of data ?? []) {
      if (row.capturado_en !== null && row.nombre !== null && row.posicion !== null) {
        xTendencias.push({
          id: row.id,
          nombre: row.nombre,
          posicion: row.posicion,
          capturado_en: row.capturado_en,
          categoria: row.categoria,
          publicaciones: row.publicaciones,
        });
      }
    }
    if (!data || data.length < 1000) break;
  }
  const today = inicioDiaMadrid(now);
  const since = new Date(Math.min(today.getTime(), now.getTime() - 24 * 3600000));
  const alertas = await leerAlertasParaTrends(client, since, now);
  // Criterio editorial con IA: una sola llamada con todas las candidatas. Si falla, deciden las reglas.
  const candidatas = candidatasTrends({ now, trends, xTendencias });
  const ia = await clasificarConIA(
    candidatas.map((c) => ({
      tema: c.termino,
      fuentes: [
        c.x
          ? `X España, puesto ${c.x.posicion}${c.x.categoria ? ` (${c.x.categoria})` : ""}`
          : null,
        c.trend
          ? `Google Trends España, ${c.trend.volumen ?? "volumen desconocido"} búsquedas`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      titular: c.titular,
    })),
    await leerPerfilIA(client),
  );
  const plan = planificarAlertasTrends({
    now,
    trends,
    exclusiones: exclusions,
    alertas,
    totalHoy: alertas.filter((a) => Date.parse(a.creada_en) >= today.getTime()).length,
    config: Object.fromEntries((settings ?? []).map((c) => [c.clave, c.valor])),
    reglas,
    xTendencias,
    ia: ia.clasificaciones,
  });
  // Las que vienen solo de X no traen titular: se busca el último en Google Noticias para saber de qué se habla
  // (como mucho 3 búsquedas a la vez y 3 s; si falla, la alerta se guarda con el contexto de siempre).
  const nuevas = await Promise.all(
    plan.nuevas.map(async (a) => {
      if (a.trends_activo || a.x_posicion == null) return a;
      const noticia = await buscarNoticiaGoogle(sinPrefijo(a.entidad));
      return noticia ? { ...a, contexto: conNoticia(a.contexto, noticia) } : a;
    }),
  );
  const contextoNoticias = nuevas.filter((a, i) => a !== plan.nuevas[i]).length;
  // Primero las alertas nuevas y después las que se combinan: así una candidata puede unirse a otra recién creada.
  const guardado = await guardarAlertasTrends(client, [...nuevas, ...plan.fusiones]);
  const { nuevas: _nuevas, fusiones: _fusiones, ...report } = plan;
  const descartadas = [...plan.descartadas, ...guardado.descartadas];
  // Lo que la IA dejó fuera se guarda para revisarlo en el panel (Alertas → «Descartadas por la IA»).
  const revision = await guardarDescartes(
    client,
    filasDescartesTrends({
      ahora: now,
      candidatas,
      ia: ia.clasificaciones,
      descartadas: plan.descartadas,
      modelo: ia.modelo,
    }),
    now,
  );
  return {
    ...report,
    ...guardado,
    descartadas,
    alertas_creadas: guardado.creadas.length,
    ...informeIA(ia),
    ...revision,
    contexto_noticias: contextoNoticias,
    tendencias_descartadas: descartadas.length,
  };
}
