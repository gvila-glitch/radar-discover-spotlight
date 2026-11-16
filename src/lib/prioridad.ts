// Prioridad por puntos. La misma fórmula está en la base de datos (supabase/prioridad-puntos.sql), que es la que
// decide la prioridad guardada; aquí se usa para enseñar el desglose en el panel y para ordenar las candidatas.
// Si se cambia algo, hay que cambiarlo en los dos sitios (hay una prueba que compara ambos).
import { volumenNumerico } from "./volumen";
import type { Alerta, Prioridad } from "./types";

export const UMBRAL_ALTA = 5;

export type DatosPuntuacion = Pick<
  Alerta,
  | "entidad"
  | "creada_en"
  | "x_posicion"
  | "x_desde"
  | "trends_activo"
  | "trends_crecimiento"
  | "medios_discover"
  | "motivo_afinidad"
> & { wikipedia_ratio?: number | string | null };
export type Parte = { texto: string; puntos: number };
export type Puntuacion = { puntos: number; partes: Parte[]; prioridad: Prioridad };

const SIN_DISCOVER = /^\[SIN DISCOVER\]/i;
const PREFIJO = /^\[(?:PRUEBA|SIN DISCOVER)\]\s*/i;
// Lo que deja el filtro en motivo_afinidad: reglas de «sí» o la IA con encaje alto suman +3; la IA con encaje medio, +1.
const AFIN = ["Encaja por reglas", "Encaja (IA, alto)"];
const MEDIO = "Encaja (IA, medio)";

/**
 * Puntos de una alerta:
 * - X: puesto 1–5 +3, 6–15 +2, 16 o más +1; +1 si entró en X como mucho 90 min antes de crearse la alerta.
 * - Google Trends: 20.000+ búsquedas +3, 5.000+ +2, 1.000+ +1.
 * - Wikipedia: ×10 sobre su media +3, ×5 +2, ×3 +1.
 * - Varias fuentes a la vez: dos +1, tres +2.
 * - Discover (si hay datos): 0–2 medios +1; 3 o más −2 (ya llegamos tarde).
 * - Encaja con la línea editorial (regla de «sí» o IA «alto») +3; IA «medio» +1; un hashtag que no encaja −1.
 * Alta: 5 puntos o más Y (encaja con la línea editorial —no vale «medio»— O viene de 2 fuentes o más) Y no hay ya 3 o más medios
 * en Discover (alta significa «aún llegamos a tiempo»).
 */
export function puntuarAlerta(a: DatosPuntuacion): Puntuacion {
  const partes: Parte[] = [];
  const pos = a.x_posicion;
  if (pos != null) {
    partes.push({ texto: `X, puesto ${pos}`, puntos: pos <= 5 ? 3 : pos <= 15 ? 2 : 1 });
    if (a.x_desde && Date.parse(a.x_desde) >= Date.parse(a.creada_en) - 90 * 60_000)
      partes.push({ texto: "acaba de entrar en X", puntos: 1 });
  }
  const volumen = a.trends_activo ? volumenNumerico(a.trends_crecimiento) : 0;
  if (volumen >= 1000)
    partes.push({
      texto: `Google ${a.trends_crecimiento ?? ""}`.trim(),
      puntos: volumen >= 20000 ? 3 : volumen >= 5000 ? 2 : 1,
    });
  const ratio = a.wikipedia_ratio == null ? null : Number(a.wikipedia_ratio);
  if (ratio != null && ratio >= 3)
    partes.push({
      texto: `Wikipedia ×${ratio.toLocaleString("es-ES")}`,
      puntos: ratio >= 10 ? 3 : ratio >= 5 ? 2 : 1,
    });
  const fuentes = (pos != null ? 1 : 0) + (a.trends_activo ? 1 : 0) + (ratio != null ? 1 : 0);
  if (fuentes >= 2) partes.push({ texto: `${fuentes} fuentes a la vez`, puntos: fuentes - 1 });
  const tarde = !SIN_DISCOVER.test(a.entidad) && a.medios_discover > 2;
  if (!SIN_DISCOVER.test(a.entidad)) {
    const n = a.medios_discover;
    partes.push(
      n <= 2
        ? {
            texto:
              n === 0
                ? "nadie en Discover todavía"
                : `${n} ${n === 1 ? "medio" : "medios"} en Discover`,
            puntos: 1,
          }
        : { texto: `ya ${n} medios en Discover`, puntos: -2 },
    );
  }
  const afin = AFIN.some((prefijo) => a.motivo_afinidad.startsWith(prefijo));
  const medio = !afin && a.motivo_afinidad.startsWith(MEDIO);
  if (afin) partes.push({ texto: "encaja con la línea editorial", puntos: 3 });
  else if (medio) partes.push({ texto: "encaja a medias con la línea", puntos: 1 });
  else if (a.entidad.replace(PREFIJO, "").trim().startsWith("#"))
    partes.push({ texto: "hashtag sin relación con la línea", puntos: -1 });
  const puntos = partes.reduce((s, p) => s + p.puntos, 0);
  const prioridad: Prioridad =
    puntos >= UMBRAL_ALTA && (afin || fuentes >= 2) && !tarde ? "alta" : "media";
  return { puntos, partes, prioridad };
}

/** «7 puntos: X, puesto 3 +3 · nadie en Discover todavía +1 · encaja con la línea editorial +3» */
export const describirPuntos = (p: Puntuacion) =>
  `${p.puntos} ${Math.abs(p.puntos) === 1 ? "punto" : "puntos"}` +
  (p.partes.length
    ? ": " +
      p.partes.map((x) => `${x.texto} ${x.puntos > 0 ? "+" : "−"}${Math.abs(x.puntos)}`).join(" · ")
    : "");
