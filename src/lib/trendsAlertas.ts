import { z } from 'zod';

export type TendenciaAlerta = { id: number; termino: string | null; volumen: string | null; capturado_en: string; noticias: unknown };
export type AlertaReciente = { entidad: string; creada_en: string };
export type NuevaAlertaTrends = {
  entidad: string; contexto: string; prioridad: 'media'; trends_activo: true; trends_crecimiento: string | null;
  x_posicion: null; x_desde: null; medios_discover: 0; medios_lista: string[]; titulares_seo: [];
  angulo: string; seccion_sugerida: string; motivo_afinidad: string; estado: 'pendiente';
};
export type MotivoDescarte = 'exclusion' | 'ya_avisada' | 'fuera_de_horario' | 'tope_diario' | 'limite_ejecucion' | 'sin_termino';
export type Descarte = { termino: string; motivo: MotivoDescarte };
const configSchema = z.object({
  max_alertas_dia: z.coerce.number().int().min(0).max(100000),
  hora_inicio: z.coerce.number().min(0).lt(24),
  hora_fin: z.coerce.number().gt(0).max(24),
});

function madridParts(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, Number(p.value)]));
  const { year, month, day, hour, minute, second } = z.object({
    year: z.number(), month: z.number(), day: z.number(), hour: z.number(), minute: z.number(), second: z.number(),
  }).parse(parts);
  return { year, month, day, hour, minute, second };
}

// Resolve local midnight itself, not the offset at "now": DST can change within a day.
export function inicioDiaMadrid(now: Date): Date {
  const p = madridParts(now);
  const target = Date.UTC(p['year'], p['month'] - 1, p['day']);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const local = madridParts(new Date(guess));
    const wall = Date.UTC(local['year'], local['month'] - 1, local['day'], local['hour'], local['minute'], local['second']);
    guess += target - wall;
  }
  return new Date(guess);
}

export function normalizarEntidad(value: string): string {
  return value.replace(/^\[PRUEBA\]\s*/i, '').trim().toLocaleLowerCase('es-ES');
}

export function volumenNumerico(value: string | null): number {
  const match = /^\s*([\d.,]+)\s*([KMB]?)\s*\+?\s*$/i.exec(value ?? '');
  if (!match?.[1]) return 0;
  const suffix = match[2]?.toUpperCase();
  const number = suffix ? Number(match[1].replace(',', '.')) : Number(match[1].replace(/[.,]/g, ''));
  return Number.isFinite(number) ? number * (suffix === 'K' ? 1000 : suffix === 'M' ? 1000000 : suffix === 'B' ? 1000000000 : 1) : 0;
}

export function planificarAlertasTrends(input: {
  now: Date; trends: TendenciaAlerta[]; exclusiones: string[];
  alertas: AlertaReciente[]; totalHoy: number; config: Record<string, string | null>;
}) {
  const config = configSchema.safeParse(input.config);
  if (!config.success || Object.values(input.config).some(value => value === null || value?.trim() === '')) {
    throw new Error('Configuración de horario o máximo diario no válida.');
  }
  const end = input.now.getTime();
  const window = input.trends.filter(t => Date.parse(t.capturado_en) >= end - 30 * 60000 && Date.parse(t.capturado_en) <= end);
  const fallback = window.length === 0;
  const readings = (fallback ? input.trends.filter(t => Date.parse(t.capturado_en) >= end - 2 * 3600000 && Date.parse(t.capturado_en) <= end) : window)
    .slice().sort((a, b) => Date.parse(b.capturado_en) - Date.parse(a.capturado_en) || b.id - a.id);
  const latest = new Map<string, TendenciaAlerta>();
  const descartadas: Descarte[] = [];
  for (const t of readings) {
    if (!t.termino?.trim()) { descartadas.push({ termino: '', motivo: 'sin_termino' }); continue; }
    if (!latest.has(t.termino)) latest.set(t.termino, t);
  }
  const previous = new Set(input.alertas.filter(a => Date.parse(a.creada_en) >= end - 24 * 3600000 && Date.parse(a.creada_en) <= end).map(a => normalizarEntidad(a.entidad)));
  const exclusions = input.exclusiones.map(e => e.toLocaleLowerCase('es-ES')).filter(e => e.trim());
  const p = madridParts(input.now);
  const hour = p['hour'] + p['minute'] / 60 + p['second'] / 3600;
  const { hora_inicio: start, hora_fin: finish, max_alertas_dia: max } = config.data;
  const inHours = start <= finish ? hour >= start && hour < finish : hour >= start || hour < finish;
  const disponibles = Math.max(0, max - input.totalHoy);
  const nuevas: NuevaAlertaTrends[] = [];
  for (const t of [...latest.values()].sort((a, b) => volumenNumerico(b.volumen) - volumenNumerico(a.volumen) || (a.termino ?? '').localeCompare(b.termino ?? '', 'es'))) {
    const termino = t.termino?.trim() ?? '';
    const normalized = normalizarEntidad(termino);
    let motivo: MotivoDescarte | undefined;
    if (exclusions.some(e => termino.toLocaleLowerCase('es-ES').includes(e))) motivo = 'exclusion';
    else if (previous.has(normalized)) motivo = 'ya_avisada';
    else if (!inHours) motivo = 'fuera_de_horario';
    else if (nuevas.length >= disponibles) motivo = 'tope_diario';
    else if (nuevas.length >= 3) motivo = 'limite_ejecucion';
    if (motivo) { descartadas.push({ termino, motivo }); continue; }
    const first = Array.isArray(t.noticias) ? t.noticias[0] as unknown : null;
    const news = z.object({ titular: z.string() }).safeParse(first);
    nuevas.push({
      entidad: '[PRUEBA] ' + termino,
      contexto: (news.success && news.data.titular.trim() ? news.data.titular : 'Tendencia en Google España') + ' · Fuente: Google Trends',
      prioridad: 'media', trends_activo: true, trends_crecimiento: t.volumen,
      x_posicion: null, x_desde: null, medios_discover: 0, medios_lista: [], titulares_seo: [],
      angulo: 'Pendiente: aún sin IA', seccion_sugerida: 'Sin sugerir',
      motivo_afinidad: 'Sin filtro editorial todavía (solo Trends)', estado: 'pendiente',
    });
    previous.add(normalized);
  }
  return { nuevas, descartadas, ventana_minutos: fallback ? 120 : 30, tendencias_unicas: latest.size, lecturas_repetidas: readings.length - latest.size - descartadas.filter(d => d.motivo === 'sin_termino').length, total_hoy_antes: input.totalHoy, max_alertas_dia: max };
}