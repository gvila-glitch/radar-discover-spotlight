import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { conBloqueoRadar } from "./jobLock.server";
import { guardarAlertasWikipedia, leerAlertasParaTrends } from "./alertasRepo";
import { leerReglas } from "./reglasRepo";
import { calcularPicos, diasUTC, planificarAlertasWikipedia, topSchema, type Top } from "./wikipediaPicos";

const API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/top/es.wikipedia/all-access/";

async function leerTop(dia: string): Promise<Top | null> {
  const res = await fetch(API + dia.replace(/-/g, "/"), {
    headers: { "User-Agent": "RadarDiscover/1.0 (panel editorial interno)", Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia respondió con HTTP ${res.status}.`);
  const parsed = topSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error("Wikipedia devolvió un formato inesperado.");
  return parsed.data.items[0]!.articles;
}

export async function wikipediaAAlertas(client: SupabaseClient<Database>, now = new Date()) {
  return conBloqueoRadar(client, "wikipedia-a-alertas", () => ejecutar(client, now));
}

async function ejecutar(client: SupabaseClient<Database>, now: Date) {
  const [dia, ...previos] = diasUTC(now, 8);
  const { count, error: countError } = await client.from("wikipedia_picos").select("id", { count: "exact", head: true }).eq("dia", dia!);
  if (countError) throw new Error("No se pudieron leer los picos de Wikipedia.");
  let picosGuardados = 0;
  if (!count) {
    const top = await leerTop(dia!);
    if (!top) return { saltada: true, motivo: "sin_datos", mensaje: `Wikipedia aún no ha publicado el día ${dia}.`, alertas_creadas: 0 };
    const tops = (await Promise.all(previos.map(leerTop))).filter((t): t is Top => t !== null);
    const picos = calcularPicos(top, tops);
    if (picos.length) {
      const { error } = await client.from("wikipedia_picos").upsert(picos.map((p) => ({ ...p, dia: dia! })), { onConflict: "dia,articulo", ignoreDuplicates: true });
      if (error) throw new Error("No se pudieron guardar los picos de Wikipedia.");
    }
    picosGuardados = picos.length;
  }
  const { data: picos, error } = await client.from("wikipedia_picos").select("articulo,visitas,media_previa,ratio").eq("dia", dia!);
  if (error) throw new Error("No se pudieron leer los picos de Wikipedia.");
  const { data: excl, error: exclError } = await client.from("exclusiones").select("valor").eq("tipo", "tema").eq("activo", true).limit(1000);
  if (exclError) throw new Error("No se pudieron leer las exclusiones.");
  const reglas = await leerReglas(client);
  // 24 h: la misma ventana que usa la base de datos para combinar alertas sobre lo mismo.
  const recientes = await leerAlertasParaTrends(client, new Date(now.getTime() - 24 * 3600000), now);
  const plan = planificarAlertasWikipedia({ picos: picos ?? [], exclusiones: (excl ?? []).map((e) => e.valor), entidadesRecientes: recientes.map((a) => a.entidad), reglas });
  const guardado = await guardarAlertasWikipedia(client, [...plan.nuevas, ...plan.fusiones]);
  return { dia, picos_guardados: picosGuardados, picos_del_dia: picos?.length ?? 0, ...guardado, descartadas: [...plan.descartadas, ...guardado.descartadas], alertas_creadas: guardado.creadas.length };
}
