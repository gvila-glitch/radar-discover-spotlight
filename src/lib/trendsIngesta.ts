import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
export const TRENDS_RSS_URL = 'https://trends.google.com/trending/rss?geo=ES';
export const GOOGLE_TIMEOUT_MS = 10_000;
const newsSchema = z.object({
  'ht:news_item_title': z.string().default(''),
  'ht:news_item_url': z.string().default(''),
  'ht:news_item_source': z.string().default(''),
});
const itemSchema = z.object({
  title: z.string().optional(), 'ht:approx_traffic': z.string().default(''),
  pubDate: z.string().optional(), 'ht:news_item': z.array(newsSchema).default([]),
});
const feedSchema = z.object({ rss: z.object({ channel: z.object({ item: z.array(itemSchema).default([]) }) }) });
export type TrendLectura = { termino: string; volumen: string; empezo_en: string | null; noticias: { titular: string; url: string; medio: string }[] };
export function parseTrendsRss(xml: string): TrendLectura[] {
  if (XMLValidator.validate(xml) !== true || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Google Trends devolvió un RSS no válido.');
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: false,
    isArray: (_name, path) => path === 'rss.channel.item' || path === 'rss.channel.item.ht:news_item' });
  const result = feedSchema.safeParse(parser.parse(xml));
  if (!result.success) throw new Error('Google Trends devolvió un RSS con estructura no válida.');
  const rows = result.data.rss.channel.item.filter(item => item.title?.trim()).map(item => {
    const date = item.pubDate ? new Date(item.pubDate.trim()) : null;
    if (date && Number.isNaN(date.getTime())) throw new Error('Google Trends devolvió una fecha no válida.');
    return { termino: item.title?.trim() ?? '', volumen: item['ht:approx_traffic'], empezo_en: date?.toISOString() ?? null,
      noticias: item['ht:news_item'].map(news => ({ titular: news['ht:news_item_title'], url: news['ht:news_item_url'], medio: news['ht:news_item_source'] })) };
  });
  if (!rows.length) throw new Error('Google Trends no contiene ninguna tendencia con título.');
  return rows;
}
export async function ingestTrends(save: (rows: TrendLectura[]) => Promise<void>, fetchRss: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  let xml: string;
  try {
    const response = await fetchRss(TRENDS_RSS_URL, { headers: { 'User-Agent': 'rss-reader/1.0' }, signal: controller.signal });
    if (!response.ok) throw new Error(`Google Trends respondió con HTTP ${response.status}.`);
    xml = await response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Google Trends excedió el tiempo de espera de 10 segundos.');
    if (error instanceof Error && error.message.startsWith('Google Trends respondió')) throw error;
    throw new Error('No se pudo leer el RSS de Google Trends.');
  } finally { clearTimeout(timer); }
  const rows = parseTrendsRss(xml);
  const ejemplo = rows[0];
  if (!ejemplo) throw new Error('Google Trends no contiene ninguna tendencia con título.');
  await save(rows);
  return { filas_guardadas: rows.length, ejemplo };
}
