// Pure rules for Wikipedia (es) pageview spikes. No I/O: tested in isolation.
import { z } from "zod";
import { normalizarEntidad } from "./trendsAlertas";

export const UMBRAL_VISITAS = 5000;
export const UMBRAL_RATIO = 3;
export const MAX_PICOS_DIA = 20;
const DIAS_PREVIOS = 7;

const ESPACIOS = ["Wikipedia", "Especial", "Special", "Archivo", "File", "Categoría", "Category", "Usuario", "User", "Plantilla", "Template", "Ayuda", "Help", "Portal", "Anexo", "Discusión", "Talk", "MediaWiki", "Módulo", "Wikiproyecto"];

export function articuloValido(titulo: string): boolean {
  if (!titulo || titulo === "-" || titulo === "Main_Page") return false;
  const pref = titulo.split(":")[0] ?? "";
  if (titulo.includes(":") && ESPACIOS.some((e) => e.toLowerCase() === pref.toLowerCase())) return false;
  if (/^Usuario_discusión|_discusión:/i.test(titulo)) return false;
  return true;
}

export const topSchema = z.object({
  items: z.array(z.object({ articles: z.array(z.object({ article: z.string(), views: z.number().int().nonnegative() })) })).min(1),
});
export type Top = { article: string; views: number }[];

export type Pico = { articulo: string; visitas: number; media_previa: number; ratio: number };

/** Prior days missing an article count at that day's list minimum: an upper bound, so the ratio is conservative. */
export function calcularPicos(dia: Top, previos: Top[]): Pico[] {
  const mapas = previos.slice(0, DIAS_PREVIOS).map((t) => ({ m: new Map(t.map((a) => [a.article, a.views])), min: t.length ? Math.min(...t.map((a) => a.views)) : 0 }));
  const picos: Pico[] = [];
  for (const a of dia) {
    if (!articuloValido(a.article) || a.views < UMBRAL_VISITAS) continue;
    const media = mapas.length ? mapas.reduce((s, p) => s + (p.m.get(a.article) ?? p.min), 0) / mapas.length : 0;
    const ratio = a.views / Math.max(media, 1);
    if (mapas.length === 0 || ratio < UMBRAL_RATIO) continue;
    picos.push({ articulo: a.article.replace(/_/g, " "), visitas: a.views, media_previa: Math.round(media), ratio: Math.round(ratio * 10) / 10 });
  }
  return picos.sort((a, b) => b.ratio - a.ratio || b.visitas - a.visitas).slice(0, MAX_PICOS_DIA);
}

export type NuevaAlertaWikipedia = {
  entidad: string; contexto: string; wikipedia_visitas: number; wikipedia_ratio: number;
  angulo: string; seccion_sugerida: string; motivo_afinidad: string;
};

export function planificarAlertasWikipedia(input: { picos: Pico[]; exclusiones: string[]; entidadesRecientes: string[] }) {
  const previas = new Set(input.entidadesRecientes.map(normalizarEntidad));
  const excl = input.exclusiones.map((e) => e.trim().toLocaleLowerCase("es-ES")).filter(Boolean);
  const nuevas: NuevaAlertaWikipedia[] = [];
  const descartadas: { termino: string; motivo: "exclusion" | "ya_avisada" | "limite_ejecucion" }[] = [];
  for (const p of [...input.picos].sort((a, b) => b.ratio - a.ratio)) {
    const n = normalizarEntidad(p.articulo);
    if (excl.some((e) => n.includes(e))) { descartadas.push({ termino: p.articulo, motivo: "exclusion" }); continue; }
    if (previas.has(n)) { descartadas.push({ termino: p.articulo, motivo: "ya_avisada" }); continue; }
    if (nuevas.length >= 3) { descartadas.push({ termino: p.articulo, motivo: "limite_ejecucion" }); continue; }
    previas.add(n);
    nuevas.push({
      entidad: "[SIN DISCOVER] " + p.articulo,
      contexto: `Pico en Wikipedia: ${p.visitas.toLocaleString("es-ES")} visitas, ×${p.ratio.toLocaleString("es-ES")} sobre su media de 7 días · Fuente: Wikipedia`,
      wikipedia_visitas: p.visitas, wikipedia_ratio: p.ratio,
      angulo: "Pendiente: aún sin IA", seccion_sugerida: "Sin sugerir", motivo_afinidad: "Sin filtro editorial todavía (solo Wikipedia)",
    });
  }
  return { nuevas, descartadas };
}

/** Wikimedia publishes full UTC days; the newest complete one is yesterday. */
export function diasUTC(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1 - i)).toISOString().slice(0, 10));
}
