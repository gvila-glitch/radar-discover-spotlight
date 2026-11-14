// Pure rules for Wikipedia (es) pageview spikes. No I/O: tested in isolation.
import { z } from "zod";
import {
  clasificarPorReglas,
  entidadesEquivalentes,
  normalizarEntidad,
  type Reglas,
} from "./trendsAlertas";

export const UMBRAL_VISITAS = 5000;
export const UMBRAL_RATIO = 3;
export const MAX_PICOS_DIA = 20;
const DIAS_PREVIOS = 7;

const ESPACIOS = [
  "Wikipedia",
  "Especial",
  "Special",
  "Archivo",
  "File",
  "Categoría",
  "Category",
  "Usuario",
  "User",
  "Plantilla",
  "Template",
  "Ayuda",
  "Help",
  "Portal",
  "Anexo",
  "Discusión",
  "Talk",
  "MediaWiki",
  "Módulo",
  "Wikiproyecto",
];

export function articuloValido(titulo: string): boolean {
  if (!titulo || titulo === "-" || titulo === "Main_Page") return false;
  const pref = titulo.split(":")[0] ?? "";
  if (titulo.includes(":") && ESPACIOS.some((e) => e.toLowerCase() === pref.toLowerCase()))
    return false;
  if (/^Usuario_discusión|_discusión:/i.test(titulo)) return false;
  return true;
}

export const topSchema = z.object({
  items: z
    .array(
      z.object({
        articles: z.array(z.object({ article: z.string(), views: z.number().int().nonnegative() })),
      }),
    )
    .min(1),
});
export type Top = { article: string; views: number }[];

export type Pico = { articulo: string; visitas: number; media_previa: number; ratio: number };

/** Prior days missing an article count at that day's list minimum: an upper bound, so the ratio is conservative. */
export function calcularPicos(dia: Top, previos: Top[]): Pico[] {
  const mapas = previos
    .slice(0, DIAS_PREVIOS)
    .map((t) => ({
      m: new Map(t.map((a) => [a.article, a.views])),
      min: t.length ? Math.min(...t.map((a) => a.views)) : 0,
    }));
  const picos: Pico[] = [];
  for (const a of dia) {
    if (!articuloValido(a.article) || a.views < UMBRAL_VISITAS) continue;
    const media = mapas.length
      ? mapas.reduce((s, p) => s + (p.m.get(a.article) ?? p.min), 0) / mapas.length
      : 0;
    const ratio = a.views / Math.max(media, 1);
    if (mapas.length === 0 || ratio < UMBRAL_RATIO) continue;
    picos.push({
      articulo: a.article.replace(/_/g, " "),
      visitas: a.views,
      media_previa: Math.round(media),
      ratio: Math.round(ratio * 10) / 10,
    });
  }
  return picos.sort((a, b) => b.ratio - a.ratio || b.visitas - a.visitas).slice(0, MAX_PICOS_DIA);
}

export type NuevaAlertaWikipedia = {
  entidad: string;
  contexto: string;
  wikipedia_visitas: number;
  wikipedia_ratio: number;
  angulo: string;
  seccion_sugerida: string;
  motivo_afinidad: string;
};

export function planificarAlertasWikipedia(input: {
  picos: Pico[];
  exclusiones: string[];
  entidadesRecientes: string[];
  // Opcional. Sin reglas (o con las dos listas vacías) no se filtra por línea editorial.
  reglas?: Reglas | undefined;
}) {
  const excl = input.exclusiones.map((e) => e.trim().toLocaleLowerCase("es-ES")).filter(Boolean);
  const reglas =
    input.reglas && (input.reglas.si.length > 0 || input.reglas.no.length > 0)
      ? input.reglas
      : undefined;
  const nuevas: NuevaAlertaWikipedia[] = [];
  // Hablan de lo mismo que una alerta reciente (o que otra candidata de esta ejecución): se envían para combinarlas.
  const fusiones: NuevaAlertaWikipedia[] = [];
  const planeadas: string[] = [];
  const descartadas: { termino: string; motivo: "exclusion" | "reglas" | "limite_ejecucion" }[] =
    [];
  const candidatos = input.picos.map((p) => ({
    p,
    clasificacion: reglas ? clasificarPorReglas(p.articulo, null, reglas) : null,
  }));
  // Con reglas, lo que encaja va primero; después, el mayor salto de visitas.
  const rango = (c: (typeof candidatos)[number]) => (c.clasificacion?.decision === "afin" ? 0 : 1);
  candidatos.sort((a, b) => rango(a) - rango(b) || b.p.ratio - a.p.ratio);
  for (const { p, clasificacion } of candidatos) {
    const n = normalizarEntidad(p.articulo);
    if (excl.some((e) => n.includes(e))) {
      descartadas.push({ termino: p.articulo, motivo: "exclusion" });
      continue;
    }
    if (
      clasificacion &&
      (clasificacion.decision === "descartar" ||
        (clasificacion.decision === "sin_clasificar" && reglas?.modo === "estricto"))
    ) {
      descartadas.push({ termino: p.articulo, motivo: "reglas" });
      continue;
    }
    const alerta: NuevaAlertaWikipedia = {
      entidad: "[SIN DISCOVER] " + p.articulo,
      contexto: `Pico en Wikipedia: ${p.visitas.toLocaleString("es-ES")} visitas, ×${p.ratio.toLocaleString("es-ES")} sobre su media de 7 días · Fuente: Wikipedia`,
      wikipedia_visitas: p.visitas,
      wikipedia_ratio: p.ratio,
      angulo: "Pendiente: aún sin IA",
      seccion_sugerida: clasificacion?.seccion ?? "Sin sugerir",
      motivo_afinidad: clasificacion
        ? clasificacion.motivo
        : "Sin filtro editorial todavía (solo Wikipedia)",
    };
    if (
      input.entidadesRecientes.some((r) => entidadesEquivalentes(r, p.articulo)) ||
      planeadas.some((r) => entidadesEquivalentes(r, p.articulo))
    ) {
      if (fusiones.length < 30) fusiones.push(alerta);
      continue;
    }
    if (nuevas.length >= 3) {
      descartadas.push({ termino: p.articulo, motivo: "limite_ejecucion" });
      continue;
    }
    nuevas.push(alerta);
    planeadas.push(p.articulo);
  }
  return { nuevas, fusiones, descartadas };
}

/** Wikimedia publishes full UTC days; the newest complete one is yesterday. */
export function diasUTC(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1 - i))
      .toISOString()
      .slice(0, 10),
  );
}
