// Discover ahora: qué temas ya están en Discover, a qué ritmo entran, si estamos nosotros y si el radar avisó antes.
// Lógica pura (sin base de datos): recibe los artículos que envía Snoop, las alertas recientes, nuestro dominio y los
// medios de referencia, y devuelve la lista de temas. Sin IA: detecta los nombres propios de los titulares (palabras
// que empiezan por mayúscula), así que es una aproximación. Es la misma lógica que la consulta validada a mano
// (datos/discover-temas, v3).
import { claveEntidad, entidadesEquivalentes } from "./trendsAlertas";
import { limpiarDominio } from "./snoopReceptor";

export const VENTANAS = [1, 3, 6] as const;
export type Ventana = (typeof VENTANAS)[number];
export const VENTANA_INICIAL: Ventana = 3;
export const ventanaValida = (v: unknown): Ventana =>
  VENTANAS.includes(v as Ventana) ? (v as Ventana) : VENTANA_INICIAL;

export type ArticuloSnoop = {
  id: number;
  url: string;
  medio: string;
  titular: string | null;
  recibido_en: string | null;
  /** Nombre de la alerta de Snoop que lo envió: es la categoría («Política», «Economía»…). */
  alerta?: string | null;
};
export type AlertaReciente = { id: number; entidad: string; creada_en: string };
export type TitularMedio = { medio: string; titular: string; url: string; recibido_en: string };
export type TemaMapa = {
  id: string;
  nombre: string;
  /** Otros nombres que salen siempre en los mismos artículos (la misma historia). */
  alias: string[];
  /** Medios distintos que lo publican, sin contarnos a nosotros. */
  medios: number;
  /** De esos medios, cuántos lo publicaron por primera vez en la última hora. */
  mediosUltimaHora: number;
  subiendo: boolean;
  primeraVez: string;
  /** Todos los medios (también nosotros) en orden de llegada, con la hora de su primer artículo. */
  llegadas: { medio: string; hora: string }[];
  /** Hasta 3 titulares recientes de otros medios, de medios distintos. */
  titulares: TitularMedio[];
  /** Nuestra pieza, si estamos: puesto de llegada, titular y enlace. */
  nosotros: { puesto: number; titular: string; url: string; hora: string } | null;
  /** Categorías de Snoop de sus artículos, de la más frecuente a la menos. */
  categorias: string[];
  /** Nombres que aparecen en los mismos titulares (hasta 3). */
  relacionados: { id: string; nombre: string }[];
  /** Primera alerta del radar sobre el tema en las últimas 24 horas. */
  alerta: { id: number; creada_en: string } | null;
};
export type DiscoverMap = {
  temas: TemaMapa[];
  /** Categorías que han llegado en la ventana, de la más frecuente a la menos. */
  categorias: string[];
  /** Dominios de los medios de referencia (Configuración). */
  referencia: string[];
  /** Nuestro dominio, si está en Configuración. Sin él, no se sabe si estamos. */
  propio: string | null;
  articulos: number;
  ventana: Ventana;
  generado: string;
};

/** Dominio limpio a partir de lo que se escriba en Configuración («https://www.medio.es/», «medio.es»…). */
export function dominioDe(valor: string | null | undefined): string | null {
  const t = (valor ?? "").trim().toLowerCase();
  if (!t) return null;
  try {
    return limpiarDominio(new URL(t.includes("://") ? t : `https://${t}`).hostname);
  } catch {
    return null;
  }
}

// Pestañas de la sección. «Entrando ahora» es lo que sube y todavía no está saturado (como «justo» o mejor).
export const PESTANAS = [
  { id: "entrando", titulo: "Entrando ahora" },
  { id: "sin_nosotros", titulo: "Sin nosotros" },
  { id: "consolidados", titulo: "Consolidados" },
  { id: "todo", titulo: "Todo" },
] as const;
export type Pestana = (typeof PESTANAS)[number]["id"];
export const UMBRAL_CONSOLIDADO = 6;

export function enPestana(t: TemaMapa, p: Pestana): boolean {
  if (p === "entrando") return t.subiendo && t.medios < UMBRAL_CONSOLIDADO;
  if (p === "sin_nosotros") return !t.nosotros;
  if (p === "consolidados") return t.medios >= UMBRAL_CONSOLIDADO;
  return true;
}

const duracion = (ms: number) => {
  const min = Math.round(Math.abs(ms) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} días`;
};

/** «avisó 35 min antes» o «avisó 10 min después» de que el tema llegara a Discover. */
export function textoRadar(
  alertaCreada: string,
  primeraVez: string,
): { texto: string; antes: boolean } {
  const ms = Date.parse(primeraVez) - Date.parse(alertaCreada);
  return { texto: `avisó ${duracion(ms)} ${ms >= 0 ? "antes" : "después"}`, antes: ms >= 0 };
}

/** Webs que no son medios (publicaciones de redes que Discover también enseña): no cuentan. */
export const REDES = new Set([
  "x.com",
  "twitter.com",
  "youtube.com",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
]);
const GENERICOS = new Set([
  "gobierno",
  "espana",
  "estado",
  "congreso",
  "senado",
  "ejecutivo",
  "ultima hora",
  "hora",
  "directo",
  "video",
  "hoy",
  "ayer",
  "manana",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
  "ayuntamiento",
  "junta",
  "generalitat",
  "govern",
  "xunta",
  "consell",
  "diputacion",
  "cabildo",
  "interior",
  "hacienda",
  "sanidad",
  "guardia civil",
  "policia",
  "policia nacional",
  "policia local",
  "mossos",
  "ertzaintza",
  "meteorologia",
  "centro",
]);
const LUGARES = new Set([
  "andalucia",
  "aragon",
  "asturias",
  "baleares",
  "illes balears",
  "canarias",
  "cantabria",
  "castilla y leon",
  "castilla la mancha",
  "cataluna",
  "catalunya",
  "comunidad valenciana",
  "comunitat valenciana",
  "extremadura",
  "galicia",
  "madrid",
  "comunidad de madrid",
  "murcia",
  "region de murcia",
  "navarra",
  "pais vasco",
  "euskadi",
  "la rioja",
  "rioja",
  "ceuta",
  "melilla",
  "alava",
  "vitoria",
  "albacete",
  "alicante",
  "alacant",
  "almeria",
  "avila",
  "badajoz",
  "barcelona",
  "bilbao",
  "bizkaia",
  "vizcaya",
  "burgos",
  "caceres",
  "cadiz",
  "castellon",
  "castello",
  "ciudad real",
  "cordoba",
  "cuenca",
  "gipuzkoa",
  "guipuzcoa",
  "san sebastian",
  "donostia",
  "girona",
  "gerona",
  "granada",
  "guadalajara",
  "huelva",
  "huesca",
  "jaen",
  "leon",
  "lleida",
  "lerida",
  "logrono",
  "lugo",
  "malaga",
  "ourense",
  "orense",
  "oviedo",
  "gijon",
  "palencia",
  "palma",
  "mallorca",
  "ibiza",
  "menorca",
  "pamplona",
  "pontevedra",
  "vigo",
  "salamanca",
  "santander",
  "segovia",
  "sevilla",
  "soria",
  "tarragona",
  "teruel",
  "toledo",
  "valencia",
  "valladolid",
  "zamora",
  "zaragoza",
  "las palmas",
  "gran canaria",
  "tenerife",
  "santa cruz de tenerife",
  "a coruna",
  "la coruna",
  "coruna",
  "elche",
  "cartagena",
  "jerez",
  "marbella",
  "benidorm",
]);
export const MINIMO_MEDIOS = 3;
export const MAX_TEMAS = 40;
const HORA = 3_600_000;

// Secuencias de palabras que empiezan por mayúscula, con lo que hay justo delante (para saber si abren frase).
const NOMBRES = /(^|[:.?!¿¡«"“(]\s*|\s)(\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*)*)/gu;
const ABRE_FRASE = /[:.?!¿¡«"“(]/;

/** Nombres propios de un titular. Al abrir frase se quita la primera palabra si es una palabra corriente. */
export function nombresDelTitular(titular: string, corrientes: Set<string>): string[] {
  const salida: string[] = [];
  for (const m of titular.matchAll(NOMBRES)) {
    const antes = m[1] ?? "";
    let nombre = (m[2] ?? "").replace(/\s+/g, " ");
    const primera = nombre.split(" ")[0] ?? "";
    if (
      (antes === "" || ABRE_FRASE.test(antes)) &&
      corrientes.has(primera.toLocaleLowerCase("es-ES"))
    ) {
      nombre = nombre.slice(primera.length).trim();
    }
    if (nombre) salida.push(nombre);
  }
  return salida;
}

// Palabras que siempre son corrientes aunque hoy no salgan en minúscula en ningún titular.
const SIEMPRE_CORRIENTES = [
  "el",
  "la",
  "los",
  "las",
  "lo",
  "un",
  "una",
  "unos",
  "unas",
  "al",
  "del",
  "este",
  "esta",
  "estos",
  "estas",
  "ese",
  "esa",
  "esos",
  "esas",
  "así",
  "qué",
  "cómo",
  "cuándo",
  "dónde",
  "quién",
  "por",
  "para",
  "en",
  "con",
  "sin",
  "tras",
  "ante",
  "según",
  "sobre",
  "desde",
  "hasta",
  "más",
  "menos",
  "ya",
  "no",
  "sí",
  "también",
  "otro",
  "otra",
  "nuevo",
  "nueva",
];

/** Palabras corrientes: las que aparecen en minúscula en algún titular («muere», «así»…) y las de siempre. */
export function palabrasCorrientes(titulares: string[]): Set<string> {
  const s = new Set<string>(SIEMPRE_CORRIENTES);
  for (const t of titulares)
    for (const p of t.split(/[^\p{L}]+/u))
      if (/^\p{Ll}/u.test(p)) s.add(p.toLocaleLowerCase("es-ES"));
  return s;
}

type Mencion = { articulo: Valido; nombre: string; clave: string };
type Valido = {
  id: number;
  url: string;
  medio: string;
  titular: string;
  ms: number;
  categoria: string | null;
};

/** Valores de más frecuente a menos (a igualdad, por orden alfabético). */
const porFrecuencia = (valores: string[]): string[] => {
  const c = new Map<string, number>();
  for (const v of valores) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([v]) => v);
};

const masFrecuente = (nombres: string[]): string => {
  const c = new Map<string, number>();
  for (const n of nombres) c.set(n, (c.get(n) ?? 0) + 1);
  return (
    [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ?? ""
  );
};

export function construirDiscoverMap(input: {
  articulos: ArticuloSnoop[];
  alertas: AlertaReciente[];
  ahora: Date;
  ventana: Ventana;
  /** Nuestro dominio (Configuración); sin él, «nosotros» queda vacío. */
  propio?: string | null;
  referencia?: string[];
}): DiscoverMap {
  const fin = input.ahora.getTime();
  const inicio = fin - input.ventana * HORA;
  const propio = dominioDe(input.propio);
  const referencia = [
    ...new Set((input.referencia ?? []).map(dominioDe).filter((d): d is string => !!d)),
  ];
  const validos: Valido[] = [];
  for (const a of input.articulos) {
    const ms = a.recibido_en ? Date.parse(a.recibido_en) : NaN;
    const titular = (a.titular ?? "").trim();
    if (!Number.isFinite(ms) || ms < inicio || ms > fin || !titular || REDES.has(a.medio)) continue;
    const categoria = (a.alerta ?? "").trim() || null;
    validos.push({ id: a.id, url: a.url, medio: a.medio, titular, ms, categoria });
  }
  const corrientes = palabrasCorrientes(validos.map((v) => v.titular));

  // 1) Menciones (una por artículo y nombre), sin palabras genéricas ni lugares.
  const menciones: Mencion[] = [];
  for (const art of validos) {
    const vistas = new Set<string>();
    for (const nombre of nombresDelTitular(art.titular, corrientes)) {
      const clave = claveEntidad(nombre);
      if (clave.length < 3 || GENERICOS.has(clave) || LUGARES.has(clave) || vistas.has(clave))
        continue;
      vistas.add(clave);
      menciones.push({ articulo: art, nombre, clave });
    }
  }

  // 2) «Bustinduy» a secas se suma a «Pablo Bustinduy» si ese nombre completo también aparece.
  const largas = new Map<string, number>();
  for (const m of menciones)
    if (m.clave.includes(" ")) largas.set(m.clave, (largas.get(m.clave) ?? 0) + 1);
  const grupoDe = (clave: string): string => {
    if (clave.includes(" ") || clave.length < 5) return clave;
    const candidatas = [...largas].filter(([k]) => k.split(" ").at(-1) === clave);
    candidatas.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return candidatas[0]?.[0] ?? clave;
  };
  const porGrupo = new Map<string, { nombres: string[]; arts: Map<number, Valido> }>();
  for (const m of menciones) {
    const g = grupoDe(m.clave);
    const e = porGrupo.get(g) ?? { nombres: [] as string[], arts: new Map<number, Valido>() };
    if (m.clave === g) e.nombres.push(m.nombre);
    e.arts.set(m.articulo.id, m.articulo);
    porGrupo.set(g, e);
  }
  const grupos = [...porGrupo]
    .map(([clave, e]) => ({
      clave,
      nombre: masFrecuente(e.nombres),
      arts: e.arts,
      medios: new Set([...e.arts.values()].map((a) => a.medio)).size,
    }))
    .filter((g) => g.medios >= 2 && g.nombre);

  // 3) Si todos los artículos de un nombre también hablan de otro, es la misma historia: van juntos.
  const contiene = (grande: Map<number, Valido>, peque: Map<number, Valido>) =>
    [...peque.keys()].every((k) => grande.has(k));
  const raizDe = new Map<string, string>();
  for (const a of grupos) {
    const padres = grupos.filter(
      (b) =>
        b.clave !== a.clave &&
        contiene(b.arts, a.arts) &&
        (b.arts.size > a.arts.size || (b.arts.size === a.arts.size && b.clave < a.clave)),
    );
    padres.sort((x, y) => y.arts.size - x.arts.size || (x.clave < y.clave ? -1 : 1));
    raizDe.set(a.clave, padres[0]?.clave ?? a.clave);
  }

  // 4) Cifras de cada tema (con los artículos del nombre principal). Nosotros contamos para la llegada, pero no
  //    como competencia: «medios» y «ritmo» son de los demás.
  const temasTodos: (TemaMapa & { arts: Set<number>; total: number })[] = [];
  for (const raiz of grupos.filter((g) => raizDe.get(g.clave) === g.clave)) {
    const miembros = grupos.filter(
      (g) => g.clave !== raiz.clave && raizDe.get(g.clave) === raiz.clave,
    );
    const arts = [...raiz.arts.values()].sort((a, b) => a.ms - b.ms);
    const primeros = new Map<string, number>();
    for (const a of arts) if (!primeros.has(a.medio)) primeros.set(a.medio, a.ms);
    const ajenos = [...primeros].filter(([m]) => m !== propio);
    const recientes = ajenos.filter(([, ms]) => ms >= fin - HORA).length;
    const ultimoPorMedio = new Map<string, Valido>();
    for (const a of arts) if (a.medio !== propio) ultimoPorMedio.set(a.medio, a);
    const llegadas = [...primeros].map(([medio, ms]) => ({
      medio,
      hora: new Date(ms).toISOString(),
    }));
    const puesto = propio ? llegadas.findIndex((l) => l.medio === propio) : -1;
    const nuestra = puesto >= 0 ? arts.find((a) => a.medio === propio) : undefined;
    const alertas = input.alertas
      .filter((al) => entidadesEquivalentes(al.entidad, raiz.nombre))
      .sort((a, b) => Date.parse(a.creada_en) - Date.parse(b.creada_en));
    temasTodos.push({
      id: raiz.clave,
      nombre: raiz.nombre,
      alias: miembros
        .sort((x, y) => y.medios - x.medios || (x.nombre < y.nombre ? -1 : 1))
        .map((m) => m.nombre),
      medios: ajenos.length,
      mediosUltimaHora: recientes,
      subiendo: recientes >= 2 && recientes * 2 >= ajenos.length,
      primeraVez: new Date(arts[0]!.ms).toISOString(),
      llegadas,
      titulares: [...ultimoPorMedio.values()]
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 3)
        .map((a) => ({
          medio: a.medio,
          titular: a.titular,
          url: a.url,
          recibido_en: new Date(a.ms).toISOString(),
        })),
      nosotros: nuestra
        ? {
            puesto: puesto + 1,
            titular: nuestra.titular,
            url: nuestra.url,
            hora: new Date(nuestra.ms).toISOString(),
          }
        : null,
      categorias: porFrecuencia(arts.map((a) => a.categoria).filter((c): c is string => !!c)),
      relacionados: [],
      alerta: alertas[0] ? { id: alertas[0].id, creada_en: alertas[0].creada_en } : null,
      arts: new Set(raiz.arts.keys()),
      total: primeros.size,
    });
  }
  // Se enseña un tema con 3 medios o más (contándonos) o que esté subiendo. Primero, lo que más sube.
  const visibles = temasTodos
    .filter((t) => t.total >= MINIMO_MEDIOS || t.subiendo)
    .sort(
      (a, b) =>
        b.mediosUltimaHora - a.mediosUltimaHora ||
        b.medios - a.medios ||
        (a.nombre < b.nombre ? -1 : 1),
    )
    .slice(0, MAX_TEMAS);

  // 5) «Sale junto a»: los temas con los que comparte más titulares (hasta 3).
  const comunes = (a: Set<number>, b: Set<number>) => {
    let n = 0;
    for (const k of a) if (b.has(k)) n++;
    return n;
  };
  for (const t of visibles) {
    const rel = visibles
      .filter((o) => o.id !== t.id)
      .map((o) => ({ o, n: comunes(t.arts, o.arts) }))
      .filter((r) => r.n > 0);
    rel.sort((x, y) => y.n - x.n || y.o.medios - x.o.medios);
    t.relacionados = rel.slice(0, 3).map((r) => ({ id: r.o.id, nombre: r.o.nombre }));
  }
  return {
    temas: visibles.map(({ arts: _arts, total: _total, ...t }) => t),
    categorias: porFrecuencia(validos.map((v) => v.categoria).filter((c): c is string => !!c)),
    referencia,
    propio,
    articulos: validos.length,
    ventana: input.ventana,
    generado: input.ahora.toISOString(),
  };
}
