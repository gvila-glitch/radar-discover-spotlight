// Descartes de la IA: lo que la IA dejó fuera (fuera de línea o noticia de agencia) se guarda para revisarlo en el panel
// (Alertas → «Descartadas por la IA»). Aquí, las piezas puras: qué filas guardar, su fuerza y los textos de las
// excepciones. El guardado está en descartes.server.ts y las acciones del panel en descartes.functions.ts.
import type { Database } from "@/integrations/supabase/types";
import { detalleX } from "./contexto";
import { puntuarAlerta, type Puntuacion } from "./prioridad";
import {
  claveEntidad,
  type CandidataTrends,
  type ClasificacionIA,
  type Descarte as DescartePlan,
} from "./trendsAlertas";

export type Descarte = Database["public"]["Tables"]["descartes_ia"]["Row"];
export type FilaDescarte = Database["public"]["Tables"]["descartes_ia"]["Insert"];

/** Puntos de señal (sin línea editorial ni Discover) a partir de los que un descarte es «Señal fuerte» (en color). */
export const UMBRAL_FUERTE = 3;
export const DIAS_CONSERVAR = 30;
const MAX_TEXTO = 300;

/** Filtro «Señal» del panel: se ven todos (fuertes y con poca señal, distinguidos por color) o solo unos. */
export type FiltroSenal = "todas" | "fuertes" | "debiles";
export const OPCIONES_SENAL: { value: FiltroSenal; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "fuertes", label: "Fuerte" },
  { value: "debiles", label: "Poca señal" },
];
export const pasaSenal = (d: { fuerte: boolean }, f: FiltroSenal) =>
  f === "todas" || (f === "fuertes" ? d.fuerte : !d.fuerte);

/** Día en Madrid como «AAAA-MM-DD». */
export const diaMadrid = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);

/** Fuerza de la señal de un tema: la fórmula de prioridad sin la parte editorial ni la de Discover. */
export function fuerzaSenal(s: {
  creada_en: string;
  x_posicion?: number | null;
  x_desde?: string | null;
  trends_crecimiento?: string | null;
  wikipedia_ratio?: number | null;
}): Puntuacion {
  return puntuarAlerta({
    entidad: "[SIN DISCOVER] tema",
    creada_en: s.creada_en,
    x_posicion: s.x_posicion ?? null,
    x_desde: s.x_desde ?? null,
    trends_activo: s.trends_crecimiento != null,
    trends_crecimiento: s.trends_crecimiento ?? null,
    wikipedia_ratio: s.wikipedia_ratio ?? null,
    medios_discover: 0,
    motivo_afinidad: "",
  });
}

const datosIA = (ia: ClasificacionIA | undefined, modelo: string) => ({
  motivo_ia: (ia?.motivo ?? "").slice(0, MAX_TEXTO),
  seccion_ia: (ia?.seccion ?? "").slice(0, 60),
  agencia: ia?.agencia ?? false,
  modelo,
});

/** Filas de los descartes de X y Trends de una ejecución (un tema por día). */
export function filasDescartesTrends(input: {
  ahora: Date;
  candidatas: CandidataTrends[];
  ia: Map<string, ClasificacionIA>;
  descartadas: DescartePlan[];
  modelo: string;
}): FilaDescarte[] {
  const dia = diaMadrid(input.ahora);
  const filas = new Map<string, FilaDescarte>();
  for (const d of input.descartadas) {
    if (d.motivo !== "fuera_de_linea") continue;
    const c = input.candidatas.find((x) => x.termino === d.termino);
    const clave = claveEntidad(d.termino) || d.termino.trim().toLowerCase();
    if (!clave || filas.has(clave)) continue;
    const puntos = fuerzaSenal({
      creada_en: input.ahora.toISOString(),
      x_posicion: c?.x?.posicion ?? null,
      x_desde: c?.x?.desde ?? null,
      trends_crecimiento: c?.trend ? (c.trend.volumen ?? "") : null,
    }).puntos;
    filas.set(clave, {
      dia,
      clave,
      tema: d.termino,
      fuente: "x_trends",
      actualizada_en: input.ahora.toISOString(),
      puntos,
      fuerte: puntos >= UMBRAL_FUERTE,
      x_posicion: c?.x?.posicion ?? null,
      x_desde: c?.x?.desde ?? null,
      trends_crecimiento: c?.trend?.volumen ?? null,
      contexto: [c?.titular, c?.x ? `En tendencia en X España (${detalleX(c.x)})` : null]
        .filter(Boolean)
        .join(" · "),
      ...datosIA(input.ia.get(d.termino), input.modelo),
    });
  }
  return [...filas.values()];
}

/** Filas de los descartes de Wikipedia de una ejecución. */
export function filasDescartesWikipedia(input: {
  ahora: Date;
  picos: { articulo: string; visitas: number; ratio: number }[];
  ia: Map<string, ClasificacionIA>;
  descartadas: { termino: string; motivo: string }[];
  modelo: string;
}): FilaDescarte[] {
  const dia = diaMadrid(input.ahora);
  const filas = new Map<string, FilaDescarte>();
  for (const d of input.descartadas) {
    if (d.motivo !== "fuera_de_linea") continue;
    const p = input.picos.find((x) => x.articulo === d.termino);
    const clave = claveEntidad(d.termino) || d.termino.trim().toLowerCase();
    if (!clave || filas.has(clave)) continue;
    const ratio = p ? Number(p.ratio) : null;
    const puntos = fuerzaSenal({
      creada_en: input.ahora.toISOString(),
      wikipedia_ratio: ratio,
    }).puntos;
    filas.set(clave, {
      dia,
      clave,
      tema: d.termino,
      fuente: "wikipedia",
      actualizada_en: input.ahora.toISOString(),
      puntos,
      fuerte: puntos >= UMBRAL_FUERTE,
      wikipedia_ratio: ratio,
      wikipedia_visitas: p ? Number(p.visitas) : null,
      contexto: p
        ? `Pico en Wikipedia: ${Number(p.visitas).toLocaleString("es-ES")} visitas, ×${Number(p.ratio).toLocaleString("es-ES")} sobre su media`
        : "",
      ...datosIA(input.ia.get(d.termino), input.modelo),
    });
  }
  return [...filas.values()];
}

/** Borrador del criterio de excepción que se propone al administrador. */
export function sugerenciaExcepcion(tema: string, nota: string | null | undefined): string {
  const motivo = nota?.trim().replace(/\s+/g, " ");
  return `Temas como «${tema.trim()}»: ${motivo || "explica aquí cuándo nos interesan."}`.slice(
    0,
    MAX_TEXTO,
  );
}

/** Una línea segura para las reglas de «sí» (sin separadores de reglas ni de sección). */
export const lineaReglaSi = (tema: string) =>
  tema
    .replace(/=>|[;\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

/** Añade una línea a un texto de configuración si no estaba ya. */
export function anadirLinea(texto: string | null | undefined, linea: string): string {
  const actual = (texto ?? "").trimEnd();
  const lineas = actual.split(/\r?\n/).map((l) => l.trim().toLowerCase());
  if (lineas.includes(linea.trim().toLowerCase())) return actual;
  return actual ? `${actual}\n${linea}` : linea;
}

/** Texto de una excepción de tipo criterio, validado (entre 10 y 300 caracteres, en una línea). */
export function criterioValido(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length >= 10 && limpio.length <= MAX_TEXTO ? limpio : null;
}
