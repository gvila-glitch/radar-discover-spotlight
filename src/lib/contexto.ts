// Contexto de las alertas: piezas puras (sin red) para leer el resumen de Wikipedia y el titular de Google Noticias,
// y para montar la frase de contexto que se ve en el panel. Las llamadas a internet están en contexto.server.ts.
import { z } from "zod";

export type ResumenWikipedia = { descripcion: string | null; frase: string | null };
export type Noticia = { titular: string; medio: string | null };
export type DatosX = { posicion: number; categoria?: string | null; publicaciones?: number | null };

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};
export function decodificar(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(?:amp|quot|#39|apos|lt|gt|nbsp);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/&#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

const mayuscula = (t: string) => (t ? t[0]!.toLocaleUpperCase("es-ES") + t.slice(1) : t);

// Palabras tras las que un punto no cierra la frase (abreviaturas). Las iniciales (F. C., EE. UU.) se detectan aparte.
const ABREVIATURAS = new Set([
  "sr",
  "sra",
  "srta",
  "dr",
  "dra",
  "st",
  "sto",
  "sta",
  "av",
  "avda",
  "núm",
  "pág",
  "etc",
  "vs",
]);

/** Primera frase de un texto (hasta el primer punto seguido de mayúscula), recortada a «max» caracteres. */
export function primeraFrase(texto: string, max = 220): string | null {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  let fin = limpio.length;
  for (const m of limpio.matchAll(/[.!?](?=\s+[A-ZÁÉÍÓÚÑ«"(¿¡])/g)) {
    const palabra = (/(\S+)$/.exec(limpio.slice(0, m.index))?.[1] ?? "").replace(/[^\p{L}]/gu, "");
    const esInicial =
      m[0] === "." && /^\p{L}{1,2}$/u.test(palabra) && palabra === palabra.toUpperCase();
    if (m[0] === "." && (esInicial || ABREVIATURAS.has(palabra.toLowerCase()))) continue;
    fin = m.index + 1;
    break;
  }
  const frase = limpio.slice(0, fin);
  return frase.length <= max ? frase : frase.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

const resumenSchema = z.object({
  type: z.string().optional(),
  description: z.string().optional(),
  extract: z.string().optional(),
});
/** Resumen de un artículo de Wikipedia (servicio /page/summary). Nada si es una página de desambiguación. */
export function leerResumenWikipedia(json: unknown): ResumenWikipedia | null {
  const r = resumenSchema.safeParse(json);
  if (!r.success || r.data.type === "disambiguation") return null;
  const descripcion = r.data.description?.trim() ? mayuscula(r.data.description.trim()) : null;
  const frase = r.data.extract ? primeraFrase(r.data.extract) : null;
  return descripcion || frase ? { descripcion, frase } : null;
}

/** Noticias de un RSS de búsqueda de Google Noticias («Titular - Medio»), en el orden en que vienen (máx. 10). */
export function leerNoticiasGoogle(xml: string): Noticia[] {
  const noticias: Noticia[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1] ?? "";
    const crudo = /<title>([\s\S]*?)<\/title>/.exec(item)?.[1];
    if (!crudo) continue;
    let titular = decodificar(crudo);
    const fuente = /<source[^>]*>([\s\S]*?)<\/source>/.exec(item)?.[1];
    const medio = fuente ? decodificar(fuente) || null : null;
    if (medio && titular.endsWith(` - ${medio}`))
      titular = titular.slice(0, -(medio.length + 3)).trim();
    if (titular) noticias.push({ titular, medio });
    if (noticias.length >= 10) break;
  }
  return noticias;
}

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Primera noticia que de verdad habla del tema: el titular tiene que contener todas sus palabras de 4 letras o más
 * (así #FelizLunes no se queda con «Cocinar para ser feliz»). Si el tema no tiene palabras así, vale cualquier titular
 * que lo contenga entero.
 */
export function elegirNoticia(noticias: Noticia[], tema: string): Noticia | null {
  const busqueda = normalizar(textoDeBusqueda(tema));
  const palabras = busqueda.split(/[^\p{L}\p{N}]+/u).filter((p) => p.length >= 4);
  return (
    noticias.find((n) => {
      const titular = normalizar(n.titular);
      return palabras.length
        ? palabras.every((p) => titular.includes(p))
        : titular.includes(busqueda.trim());
    }) ?? null
  );
}

/** Texto de búsqueda para un tema: los hashtags se separan en palabras (#SanchezFueraDeControl → Sanchez Fuera De Control). */
export function textoDeBusqueda(tema: string): string {
  const t = tema.trim();
  if (!t.startsWith("#")) return t;
  return t
    .slice(1)
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .trim();
}

/** «puesto 4 · Política · 12.300 publicaciones» */
export function detalleX(x: DatosX): string {
  const partes = [`puesto ${x.posicion}`];
  if (x.categoria?.trim()) partes.push(x.categoria.trim());
  if (x.publicaciones && x.publicaciones > 0)
    partes.push(`${x.publicaciones.toLocaleString("es-ES")} publicaciones`);
  return partes.join(" · ");
}

export const conNoticia = (contexto: string, n: Noticia) =>
  `Se habla de: «${n.titular}»${n.medio ? ` (${n.medio})` : ""} · ${contexto}`;

export function conResumen(contexto: string, r: ResumenWikipedia): string {
  const partes = [r.descripcion, r.frase ? `«${r.frase}»` : null].filter(Boolean);
  return partes.length ? `${partes.join(" · ")} · ${contexto}` : contexto;
}

/** Las partes del contexto de una alerta, para enseñarlas por separado en la ficha. */
export type ContextoLeido = {
  /** Descripción corta de Wikipedia («Narcotraficante gallego»). */
  queEs: string | null;
  /** Primera frase del artículo de Wikipedia. */
  frase: string | null;
  /** Titular del que se habla (de Google Noticias o de Google Trends). */
  seHabla: Noticia | null;
  /** Categoría y publicaciones de X, si las hay. */
  x: { categoria: string | null; publicaciones: string | null } | null;
  /** Lo que no se reconoce, tal cual, para no perder nada. */
  resto: string | null;
};

const TAMBIEN = / · También en [^·]*/g;
const FUENTE = / · Fuentes?: [^()·]*?(?: \(([^()]*)\))?$/;
const TENDENCIA_X = /(?:^| · )En tendencia en X España \(([^()]*)\)/;
const PICO_WIKIPEDIA = /(?:^| · )Pico en Wikipedia: [^·]*/;
const SE_HABLA = /^Se habla de: «(.*)»(?: \(([^()]*)\))?$/;
const RESUMEN = /^(?:(.+?) · )?«(.*)»$/;

/** «puesto 4 · Política · 12.300 publicaciones» → categoría y publicaciones (el puesto ya está en su campo). */
function leerDetalleX(detalle: string): ContextoLeido["x"] {
  let categoria: string | null = null;
  let publicaciones: string | null = null;
  for (const parte of detalle.split(" · ")) {
    const p = parte.trim();
    if (!p || /^puesto \d+$/.test(p)) continue;
    if (/publicaciones$/.test(p)) publicaciones = p;
    else categoria = p;
  }
  return categoria || publicaciones ? { categoria, publicaciones } : null;
}

/**
 * Separa el contexto que montan conNoticia, conResumen, detalleX, las alertas de Trends y Wikipedia y la combinación
 * de alertas («· También en …»). Quita lo que la ficha ya enseña con sus propios datos (fuentes, pico de Wikipedia).
 * Qué es el texto del principio depende de la fuente que creó la alerta, que dice su «Fuente: …»: al combinarla con
 * otra, trends_activo o wikipedia_ratio pueden cambiar, pero ese texto no. Sin «Fuente: …», se usan esos campos.
 */
export function leerContexto(a: {
  contexto: string;
  trends_activo: boolean;
  wikipedia_ratio?: number | null;
}): ContextoLeido {
  const r: ContextoLeido = { queEs: null, frase: null, seHabla: null, x: null, resto: null };
  let detalle: string | null = null;
  let s = (a.contexto ?? "").trim().replace(TAMBIEN, "");
  let deTrends = a.trends_activo;
  let deWikipedia = a.wikipedia_ratio != null;
  const fuente = FUENTE.exec(s);
  if (fuente) {
    detalle = fuente[1] ?? null;
    deTrends = /Google Trends/.test(fuente[0]);
    deWikipedia = /^ · Fuente: Wikipedia$/.test(fuente[0]);
    s = s.slice(0, fuente.index);
  }
  const tendencia = TENDENCIA_X.exec(s);
  if (tendencia) {
    detalle = tendencia[1] ?? null;
    s = s.replace(TENDENCIA_X, "");
  }
  s = s
    .replace(PICO_WIKIPEDIA, "")
    .replace(/^ · | · $/g, "")
    .trim();
  if (detalle) r.x = leerDetalleX(detalle);
  const noticia = SE_HABLA.exec(s);
  if (noticia) {
    r.seHabla = { titular: noticia[1]!, medio: noticia[2] ?? null };
    s = "";
  } else if (s === "Tendencia en Google España") {
    s = "";
  } else if (deTrends && s) {
    r.seHabla = { titular: s, medio: null };
    s = "";
  } else if (deWikipedia && s) {
    const resumen = RESUMEN.exec(s);
    if (resumen) {
      r.queEs = resumen[1] ?? null;
      r.frase = resumen[2] || null;
    } else r.queEs = s;
    s = "";
  }
  r.resto = s || null;
  return r;
}

/** Enlace a la búsqueda del tema en X. */
export const enlaceX = (tema: string) =>
  `https://x.com/search?q=${encodeURIComponent(tema.trim())}`;

/** Nombre de la entidad sin los prefijos internos ([SIN DISCOVER], [PRUEBA]). */
export const sinPrefijo = (entidad: string) =>
  entidad.replace(/^\[(?:PRUEBA|SIN DISCOVER)\]\s*/i, "").trim();
