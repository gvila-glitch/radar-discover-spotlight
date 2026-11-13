import { z } from 'zod';
import { inicioDiaMadrid } from './trendsAlertas';

export const APIFY_X_URL = 'https://api.apify.com/v2/acts/feedminer~x-trends-scraper/run-sync-get-dataset-items';
export const APIFY_TIMEOUT_MS = 120_000;
export const APIFY_X_INPUT = { locations: ['ES'], maxTrendsPerLocation: 30 };
export type XLectura = { posicion: number; nombre: string; categoria: string | null; publicaciones: number };
const rowsSchema = z.array(z.object({
  rank: z.number().int().min(1).max(30), name: z.string().trim().min(1).max(500),
  category: z.string().max(500).nullish(), postCount: z.number().int().nonnegative().max(2147483647).nullish(),
})).min(1).max(30);
export function parseXTendencias(value: unknown): XLectura[] {
  const result = rowsSchema.safeParse(value);
  if (!result.success) throw new Error('Apify devolvió una lista vacía o tendencias no válidas. No se guardó nada.');
  if (new Set(result.data.map(row => row.rank)).size !== result.data.length) throw new Error('Apify devolvió posiciones repetidas. No se guardó nada.');
  return result.data.map(row => ({ posicion: row.rank, nombre: row.name, categoria: row.category ?? null, publicaciones: row.postCount ?? 0 }));
}
export function frenoX(input: { now: Date; capturas: string[]; config: Record<string, string | null>; ignorarHorario?: boolean }) {
  const { now, capturas } = input;
  const end = now.getTime();
  if (capturas.some(value => Date.parse(value) > end - 45 * 60_000 && Date.parse(value) <= end)) return { motivo: 'captura_reciente', mensaje: 'Lectura saltada: ya existe una captura de hace menos de 45 minutos.' };
  const start = inicioDiaMadrid(now).getTime();
  const today = new Set(capturas.filter(value => Date.parse(value) >= start && Date.parse(value) <= end));
  if (today.size >= 20) return { motivo: 'tope_diario', mensaje: 'Lectura saltada: ya hay 20 capturas distintas hoy en Madrid.' };
  if (!input.ignorarHorario) {
    const settings = z.object({ hora_inicio: z.coerce.number().min(0).lt(24), hora_fin: z.coerce.number().gt(0).max(24) }).safeParse(input.config);
    if (!settings.success || ['hora_inicio', 'hora_fin'].some(key => input.config[key] == null || input.config[key]?.trim() === '')) throw new Error('No se pudo validar el horario configurado. No se llamó a Apify.');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    const hour = Number(parts['hour']) + Number(parts['minute']) / 60 + Number(parts['second']) / 3600;
    const { hora_inicio: first, hora_fin: last } = settings.data;
    if (!(first <= last ? hour >= first && hour < last : hour >= first || hour < last)) return { motivo: 'fuera_de_horario', mensaje: 'Lectura saltada: fuera del horario configurado de Madrid.' };
  }
  return null;
}
export async function leerApifyX(token: string, fetchApify: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);
  try {
    const response = await fetchApify(APIFY_X_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(APIFY_X_INPUT), signal: controller.signal });
    // Never log or return provider bodies: they may echo credentials.
    if (!response.ok) throw new Error(`Apify respondió con HTTP ${response.status}. No se guardó nada.`);
    return parseXTendencias(await response.json());
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Apify excedió el tiempo de espera de 120 segundos. No se guardó nada.');
    if (error instanceof Error && /^(Apify respondió con HTTP \d+\.|Apify devolvió)/.test(error.message)) throw error;
    throw new Error('No se pudo obtener una respuesta válida de Apify. No se guardó nada.');
  } finally { clearTimeout(timer); }
}
export async function ingestX(deps: { now: Date; config: Record<string, string | null>; capturas: string[]; ignorarHorario?: boolean; token: () => string | undefined; save: (rows: XLectura[]) => Promise<void>; fetchApify?: typeof fetch }) {
  const skipped = frenoX(deps);
  if (skipped) return { saltada: true, filas_guardadas: 0, ...skipped } as const;
  const token = deps.token();
  if (!token) throw new Error('No se pudo iniciar la lectura: falta configurar APIFY_TOKEN.');
  const rows = await leerApifyX(token, deps.fetchApify);
  await deps.save(rows);
  return { saltada: false, filas_guardadas: rows.length, ejemplos: rows.slice(0, 3).map(({ posicion, nombre, categoria }) => ({ posicion, nombre, categoria })) } as const;
}