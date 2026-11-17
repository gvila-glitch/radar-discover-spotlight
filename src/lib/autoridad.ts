// Autoridad en Discover: cuántas piezas nuestras sobre un tema han tenido tráfico de Discover, según las exportaciones
// de Search Console (Rendimiento → Discover → Páginas) que se cargan a mano en la tabla autoridad_discover.
// Solo lógica pura (sin red ni base de datos), para poder probarla. La lee src/lib/autoridad.functions.ts.
//
// Cómo se busca un tema: se compara con las palabras de la dirección de cada pieza (sin tildes ni mayúsculas y sin
// artículos ni preposiciones), y tienen que aparecer todas seguidas: «Pilar Bardem» no coincide con una pieza sobre
// «Javier Bardem», y «Almeida» no coincide con «almeidas».

export type FilaAutoridad = { url: string; clics: number; desde: string; hasta: string };
export type NivelAutoridad = "alta" | "media" | "nuevo";
export type PiezaAutoridad = {
  url: string;
  titulo: string;
  seccion: string;
  clics: number;
  /** Mes de la exportación mensual más reciente en la que salió ("2026-10"); null si solo hay exportaciones de varios meses. */
  mes: string | null;
};
export type ResultadoAutoridad = {
  nivel: NivelAutoridad;
  /** Piezas distintas que coinciden con el tema. */
  total: number;
  clics: number;
  /** Las de más clics primero, como mucho MAX_PIEZAS. */
  piezas: PiezaAutoridad[];
  ultimoMes: string | null;
  /** El tema es una sola palabra: puede haber piezas de otra persona con el mismo apellido. */
  unaPalabra: boolean;
};
export type Autoridad = {
  /** Fechas que cubren los datos cargados; null si la tabla está vacía (entonces no se enseña nada). */
  periodo: { desde: string; hasta: string } | null;
  /** Por nombre de alerta, tal cual llega. null si el nombre no sirve para buscar (vacío o demasiado corto). */
  temas: Record<string, ResultadoAutoridad | null>;
};

export const UMBRAL_AUTORIDAD_ALTA = 3;
export const MAX_PIEZAS = 20;
export const MAX_ENTIDADES = 1000;

const VACIAS = new Set(
  "a al con de del e el en la las lo los o para por que se sin su sus u un una unas unos y".split(
    " ",
  ),
);

function palabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !VACIAS.has(p));
}

/** Palabras del tema unidas por guiones ("yolanda-diaz"); "" si no sirve para buscar. */
export function patronTema(entidad: string): string {
  let t = entidad.replace(/^\[(SIN DISCOVER|PRUEBA)\]\s*/i, "").replace(/\([^)]*\)/g, " ");
  // Los hashtags juntan palabras con mayúsculas: #FelizLunes → feliz lunes.
  t = t.replace(/#(\S+)/g, (_, h: string) => h.replace(/([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])/g, "$1 $2"));
  const p = palabras(t);
  const patron = p.join("-");
  if (patron.replace(/-/g, "").length < 3) return "";
  if (p.length === 1 && /^\d+$/.test(p[0]!)) return "";
  return patron;
}

/** Última parte de la dirección, sin el número de la pieza ni ".html". */
export function slugDeUrl(url: string): string {
  let ruta = "";
  try {
    ruta = new URL(url).pathname;
  } catch {
    return "";
  }
  const ultima = ruta.split("/").filter(Boolean).pop() ?? "";
  return ultima.replace(/(_\d+)+\.html?$/i, "").replace(/\.html?$/i, "");
}

const TILDES: Record<string, string> = {
  politica: "política",
  economia: "economía",
  tecnologia: "tecnología",
  opinion: "opinión",
  andalucia: "andalucía",
  aragon: "aragón",
  leon: "león",
};
const MINUSCULAS = new Set(["y", "la", "de", "del", "el"]);
function rotulo(texto: string): string {
  return texto
    .split(/[-.]+/)
    .filter(Boolean)
    .map((p, i) => {
      const w = TILDES[p] ?? p;
      return i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

/** Sección de la pieza: la primera carpeta de la dirección o, si es un subdominio, el subdominio. */
export function seccionDeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const partes = host.split(".");
    if (partes.length > 2) return rotulo(partes[0]!);
    const carpetas = u.pathname.split("/").filter(Boolean);
    return carpetas.length > 1 ? rotulo(carpetas[0]!) : "";
  } catch {
    return "";
  }
}

export function tituloDeSlug(slug: string): string {
  const t = slug.replace(/-+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** "2026-10" si la exportación cubre un solo mes natural; null si cubre más. */
export function mesDePeriodo(desde: string, hasta: string): string | null {
  return FECHA.test(desde) && FECHA.test(hasta) && desde.slice(0, 7) === hasta.slice(0, 7)
    ? desde.slice(0, 7)
    : null;
}

const MESES =
  "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(
    " ",
  );
export function nombreMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}
export function mesCorto(mes: string): string {
  return nombreMes(mes).slice(0, 3);
}
const diaYMes = (f: string) => `${Number(f.slice(8, 10))} de ${nombreMes(f.slice(0, 7))}`;
/** "del 1 de septiembre al 15 de noviembre" (con el año si no es el mismo en las dos fechas). */
export function textoPeriodo(p: { desde: string; hasta: string }): string {
  const mismoAno = p.desde.slice(0, 4) === p.hasta.slice(0, 4);
  const año = (f: string) => (mismoAno ? "" : ` de ${f.slice(0, 4)}`);
  return `del ${diaYMes(p.desde)}${año(p.desde)} al ${diaYMes(p.hasta)}${año(p.hasta)}`;
}

/** Lista de nombres que llega del navegador: solo textos, recortados, sin repetir y con un máximo. */
export function entidadesValidas(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const vistas = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim().slice(0, 200);
    if (t) vistas.add(t);
    if (vistas.size >= MAX_ENTIDADES) break;
  }
  return [...vistas];
}

export function nivelAutoridad(total: number): NivelAutoridad {
  return total >= UMBRAL_AUTORIDAD_ALTA ? "alta" : total > 0 ? "media" : "nuevo";
}

type Pagina = { url: string; clics: number; mes: string | null; envuelto: string };

export function calcularAutoridad(filas: FilaAutoridad[], entidades: string[]): Autoridad {
  // Una misma pieza puede salir en varias exportaciones (meses): se suman sus clics y se guarda el mes más reciente.
  const porUrl = new Map<string, Pagina>();
  let desde = "";
  let hasta = "";
  for (const f of filas) {
    if (!desde || f.desde < desde) desde = f.desde;
    if (!hasta || f.hasta > hasta) hasta = f.hasta;
    const mes = mesDePeriodo(f.desde, f.hasta);
    const p = porUrl.get(f.url);
    if (p) {
      p.clics += f.clics;
      if (mes && (!p.mes || mes > p.mes)) p.mes = mes;
    } else {
      porUrl.set(f.url, {
        url: f.url,
        clics: f.clics,
        mes,
        envuelto: `-${palabras(slugDeUrl(f.url)).join("-")}-`,
      });
    }
  }
  const paginas = [...porUrl.values()];
  const temas: Record<string, ResultadoAutoridad | null> = {};
  for (const entidad of entidades) {
    const patron = patronTema(entidad);
    if (!patron) {
      temas[entidad] = null;
      continue;
    }
    const aguja = `-${patron}-`;
    const encontradas = paginas
      .filter((p) => p.envuelto.includes(aguja))
      .sort((a, b) => b.clics - a.clics);
    const meses = encontradas.map((p) => p.mes).filter((m): m is string => !!m);
    temas[entidad] = {
      nivel: nivelAutoridad(encontradas.length),
      total: encontradas.length,
      clics: encontradas.reduce((s, p) => s + p.clics, 0),
      piezas: encontradas.slice(0, MAX_PIEZAS).map((p) => ({
        url: p.url,
        titulo: tituloDeSlug(slugDeUrl(p.url)),
        seccion: seccionDeUrl(p.url),
        clics: p.clics,
        mes: p.mes,
      })),
      ultimoMes: meses.length ? meses.reduce((a, b) => (b > a ? b : a)) : null,
      unaPalabra: !patron.includes("-") && encontradas.length > 0,
    };
  }
  return { periodo: porUrl.size ? { desde, hasta } : null, temas };
}
