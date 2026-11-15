// Discover Map: qué nombres están entrando en Discover y cuántos medios los publican.
// Lógica pura (sin base de datos): recibe los artículos que envía Snoop y las alertas recientes, y devuelve los temas
// agrupados por relación. Sin IA: detecta los nombres propios de los titulares (palabras que empiezan por mayúscula),
// así que es una aproximación. Es la misma lógica que la consulta validada a mano (datos/discover-temas, v3).
import { claveEntidad, entidadesEquivalentes } from "./trendsAlertas";

export const VENTANAS = [1, 3, 6] as const;
export type Ventana = (typeof VENTANAS)[number];
export const ventanaValida = (v: unknown): Ventana =>
  VENTANAS.includes(v as Ventana) ? (v as Ventana) : 6;

export type ArticuloSnoop = {
  id: number;
  url: string;
  medio: string;
  titular: string | null;
  recibido_en: string | null;
};
export type TitularMedio = { medio: string; titular: string; url: string; recibido_en: string };
export type TemaMapa = {
  id: string;
  nombre: string;
  /** Otros nombres que salen siempre en los mismos artículos (la misma historia). */
  alias: string[];
  medios: number;
  mediosUltimaHora: number;
  subiendo: boolean;
  primeraVez: string;
  /** Medios en orden de llegada: el primero es el que lo publicó antes. */
  listaMedios: string[];
  /** Hasta 3 titulares recientes, de medios distintos. */
  titulares: TitularMedio[];
  /** Nombres que aparecen en los mismos titulares (hasta 3). */
  relacionados: { id: string; nombre: string }[];
  hayAlerta: boolean;
};
export type GrupoMapa = { id: string; nombre: string; temas: TemaMapa[] };
export type DiscoverMap = {
  grupos: GrupoMapa[];
  articulos: number;
  ventana: Ventana;
  generado: string;
};

/** «Solo lo que sube»: deja en cada grupo los temas que están subiendo y quita los grupos que se quedan vacíos. */
export function filtrarGrupos(grupos: GrupoMapa[], soloSube: boolean): GrupoMapa[] {
  if (!soloSube) return grupos;
  return grupos
    .map((g) => ({ ...g, temas: g.temas.filter((t) => t.subiendo) }))
    .filter((g) => g.temas.length > 0);
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
export const MIN_TITULARES_JUNTOS = 2;
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
type Valido = { id: number; url: string; medio: string; titular: string; ms: number };

const masFrecuente = (nombres: string[]): string => {
  const c = new Map<string, number>();
  for (const n of nombres) c.set(n, (c.get(n) ?? 0) + 1);
  return (
    [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ?? ""
  );
};

export function construirDiscoverMap(input: {
  articulos: ArticuloSnoop[];
  alertas: string[];
  ahora: Date;
  ventana: Ventana;
}): DiscoverMap {
  const fin = input.ahora.getTime();
  const inicio = fin - input.ventana * HORA;
  const validos: Valido[] = [];
  for (const a of input.articulos) {
    const ms = a.recibido_en ? Date.parse(a.recibido_en) : NaN;
    const titular = (a.titular ?? "").trim();
    if (!Number.isFinite(ms) || ms < inicio || ms > fin || !titular || REDES.has(a.medio)) continue;
    validos.push({ id: a.id, url: a.url, medio: a.medio, titular, ms });
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

  // 4) Cifras de cada tema (con los artículos del nombre principal).
  const temasTodos: (TemaMapa & { arts: Set<number> })[] = [];
  for (const raiz of grupos.filter((g) => raizDe.get(g.clave) === g.clave)) {
    const miembros = grupos.filter(
      (g) => g.clave !== raiz.clave && raizDe.get(g.clave) === raiz.clave,
    );
    const arts = [...raiz.arts.values()].sort((a, b) => a.ms - b.ms);
    const primeros = new Map<string, number>();
    for (const a of arts) if (!primeros.has(a.medio)) primeros.set(a.medio, a.ms);
    const recientes = new Set(arts.filter((a) => a.ms >= fin - HORA).map((a) => a.medio));
    const ultimoPorMedio = new Map<string, Valido>();
    for (const a of arts) ultimoPorMedio.set(a.medio, a);
    const medios = primeros.size;
    temasTodos.push({
      id: raiz.clave,
      nombre: raiz.nombre,
      alias: miembros
        .sort((x, y) => y.medios - x.medios || (x.nombre < y.nombre ? -1 : 1))
        .map((m) => m.nombre),
      medios,
      mediosUltimaHora: recientes.size,
      subiendo: recientes.size >= 2 && recientes.size * 2 >= medios,
      primeraVez: new Date(arts[0]!.ms).toISOString(),
      listaMedios: [...primeros.keys()],
      titulares: [...ultimoPorMedio.values()]
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 3)
        .map((a) => ({
          medio: a.medio,
          titular: a.titular,
          url: a.url,
          recibido_en: new Date(a.ms).toISOString(),
        })),
      relacionados: [],
      hayAlerta: input.alertas.some((al) => entidadesEquivalentes(al, raiz.nombre)),
      arts: new Set(raiz.arts.keys()),
    });
  }
  const visibles = temasTodos
    .filter((t) => t.medios >= MINIMO_MEDIOS || t.subiendo)
    .sort(
      (a, b) =>
        b.medios - a.medios ||
        b.mediosUltimaHora - a.mediosUltimaHora ||
        (a.nombre < b.nombre ? -1 : 1),
    )
    .slice(0, MAX_TEMAS);

  // 5) Relación entre temas: artículos en común. Dos temas van en el mismo grupo si salen juntos en al menos
  //    2 titulares (con uno solo puede ser casualidad). Provisional: se ajusta al ver los datos reales.
  const comunes = (a: Set<number>, b: Set<number>) => {
    let n = 0;
    for (const k of a) if (b.has(k)) n++;
    return n;
  };
  const vecinos = new Map<string, string[]>(visibles.map((t) => [t.id, []]));
  for (const t of visibles) {
    const rel = visibles
      .filter((o) => o.id !== t.id)
      .map((o) => ({ o, n: comunes(t.arts, o.arts) }))
      .filter((r) => r.n > 0);
    rel.sort((x, y) => y.n - x.n || y.o.medios - x.o.medios);
    t.relacionados = rel.slice(0, 3).map((r) => ({ id: r.o.id, nombre: r.o.nombre }));
    for (const r of rel) if (r.n >= MIN_TITULARES_JUNTOS) vecinos.get(t.id)!.push(r.o.id);
  }
  const visto = new Set<string>();
  const componentes: (typeof visibles)[] = [];
  for (const t of visibles) {
    if (visto.has(t.id)) continue;
    const comp: typeof visibles = [];
    const pila = [t.id];
    visto.add(t.id);
    while (pila.length) {
      const id = pila.pop()!;
      comp.push(visibles.find((v) => v.id === id)!);
      for (const v of vecinos.get(id) ?? [])
        if (!visto.has(v)) {
          visto.add(v);
          pila.push(v);
        }
    }
    componentes.push(comp);
  }
  const limpio = ({ arts: _arts, ...t }: TemaMapa & { arts: Set<number> }): TemaMapa => t;
  const orden = (l: typeof visibles) =>
    [...l].sort(
      (a, b) =>
        b.medios - a.medios ||
        b.mediosUltimaHora - a.mediosUltimaHora ||
        (a.nombre < b.nombre ? -1 : 1),
    );
  const salida: GrupoMapa[] = componentes
    .filter((c) => c.length > 1)
    .map((c) => {
      const temas = orden(c).map(limpio);
      // El grupo se nombra con sus tres temas más grandes («Pedro Sánchez · PSOE · Feijóo»).
      return {
        id: temas[0]!.id,
        nombre: temas
          .slice(0, 3)
          .map((t) => t.nombre)
          .join(" · "),
        temas,
      };
    });
  const sueltos = componentes.filter((c) => c.length === 1).flat();
  if (sueltos.length)
    salida.push({ id: "otros", nombre: "Otros temas", temas: orden(sueltos).map(limpio) });
  return {
    grupos: salida,
    articulos: validos.length,
    ventana: input.ventana,
    generado: input.ahora.toISOString(),
  };
}
