import { z } from "zod";
import { detalleX, type DatosX } from "./contexto";
import { puntuarAlerta } from "./prioridad";
import { volumenNumerico } from "./volumen";

export { volumenNumerico };

export type TendenciaAlerta = {
  id: number;
  termino: string | null;
  volumen: string | null;
  capturado_en: string;
  noticias: unknown;
};
export type TendenciaX = {
  id: number;
  nombre: string;
  posicion: number;
  capturado_en: string;
  categoria?: string | null;
  publicaciones?: number | null;
};
type XActual = {
  nombre: string;
  posicion: number;
  desde: string;
  categoria: string | null;
  publicaciones: number | null;
};
export type AlertaReciente = { entidad: string; creada_en: string };
export type NuevaAlertaTrends = {
  entidad: string;
  contexto: string;
  prioridad: "media";
  trends_activo: boolean;
  trends_crecimiento: string | null;
  x_posicion: number | null;
  x_desde: string | null;
  medios_discover: 0;
  medios_lista: string[];
  titulares_seo: [];
  angulo: string;
  seccion_sugerida: string;
  motivo_afinidad: string;
  estado: "pendiente";
};
export type MotivoDescarte =
  | "exclusion"
  | "reglas"
  | "ya_avisada"
  | "fuera_de_horario"
  | "tope_diario"
  | "limite_ejecucion"
  | "sin_termino";
export type Descarte = { termino: string; motivo: MotivoDescarte };
// ---- Filtro por reglas (sin IA): las listas viven en la tabla config (reglas_si, reglas_no y reglas_modo) ----
export type Regla = { texto: string; prefijo: boolean; seccion: string | null };
export type Reglas = { si: Regla[]; no: Regla[]; modo: "permisivo" | "estricto" };
export type ResultadoReglas = {
  decision: "descartar" | "afin" | "sin_clasificar";
  motivo: string;
  seccion: string | null;
};

export const MAX_REGLAS = 500;
export const MAX_LARGO_REGLA = 80;

// Minúsculas, sin tildes y con los símbolos convertidos en espacios (se conserva # para detectar hashtags).
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .trim();
}

// Una regla por línea o separadas por ";". Formato: «término», «término*» (empieza por) o «término => /sección/».
export function parsearReglas(valor: string | null | undefined): Regla[] {
  if (!valor) return [];
  const reglas: Regla[] = [];
  for (const bruto of valor.split(/[\n;]+/)) {
    const [izquierda = "", derecha] = bruto.split("=>");
    const prefijo = izquierda.trim().endsWith("*");
    const texto = normalizarTexto(izquierda).slice(0, MAX_LARGO_REGLA);
    if (!texto) continue;
    const ruta = derecha?.trim() ?? "";
    reglas.push({ texto, prefijo, seccion: /^\/[a-z0-9-]+\/?$/i.test(ruta) ? ruta : null });
    if (reglas.length >= MAX_REGLAS) break;
  }
  return reglas;
}

export function parsearModo(valor: string | null | undefined): "permisivo" | "estricto" {
  return valor?.trim().toLowerCase() === "estricto" ? "estricto" : "permisivo";
}

// Palabra completa por defecto; con "*" basta con que una palabra empiece así; en hashtags se busca dentro del texto.
function coincide(textoNormalizado: string, regla: Regla, dentroDelTexto: boolean): boolean {
  if (!textoNormalizado) return false;
  if (dentroDelTexto) return textoNormalizado.includes(regla.texto);
  const envuelto = ` ${textoNormalizado}`;
  return regla.prefijo
    ? envuelto.includes(` ${regla.texto}`)
    : `${envuelto} `.includes(` ${regla.texto} `);
}

// Descartar: solo se mira el término (para que un titular no tumbe una tendencia buena).
// Afín: se mira el término y también el titular de la noticia asociada.
export function clasificarPorReglas(
  termino: string,
  titular: string | null,
  reglas: Reglas,
): ResultadoReglas {
  const esHashtag = termino.trim().startsWith("#");
  const textoTermino = normalizarTexto(termino);
  const textoTitular = titular ? normalizarTexto(titular) : "";
  const no = reglas.no.find((regla) => coincide(textoTermino, regla, esHashtag));
  if (no)
    return { decision: "descartar", motivo: `Descartada por reglas: «${no.texto}»`, seccion: null };
  const si = reglas.si.find(
    (regla) => coincide(textoTermino, regla, esHashtag) || coincide(textoTitular, regla, false),
  );
  if (si)
    return { decision: "afin", motivo: `Encaja por reglas: «${si.texto}»`, seccion: si.seccion };
  return {
    decision: "sin_clasificar",
    motivo: "Sin clasificar: no coincide con ninguna regla",
    seccion: null,
  };
}

// ---- Tendencias de X como fuente de candidatas ----
const claveDe = (valor: string) => normalizarTexto(valor) || valor.trim().toLowerCase();

// De las capturas de X, devuelve lo que está en la última (si es reciente), con su puesto y desde cuándo
// aparece de forma continua (la captura más antigua de la racha actual dentro de los datos recibidos).
export function xActuales(
  filas: TendenciaX[],
  ahoraMs: number,
  frescuraMs = 90 * 60000,
): Map<string, XActual> {
  const porCaptura = new Map<string, Map<string, TendenciaX>>();
  for (const fila of filas) {
    const ms = Date.parse(fila.capturado_en);
    const nombre = fila.nombre.trim();
    if (!Number.isFinite(ms) || ms > ahoraMs || !nombre) continue;
    const clave = claveDe(nombre);
    let grupo = porCaptura.get(fila.capturado_en);
    if (!grupo) {
      grupo = new Map();
      porCaptura.set(fila.capturado_en, grupo);
    }
    if (!grupo.has(clave)) grupo.set(clave, fila);
  }
  const capturas = [...porCaptura.keys()].sort((a, b) => Date.parse(b) - Date.parse(a));
  const resultado = new Map<string, XActual>();
  const ultima = capturas[0];
  if (!ultima || ahoraMs - Date.parse(ultima) > frescuraMs) return resultado;
  const actual = porCaptura.get(ultima);
  if (!actual) return resultado;
  for (const [clave, fila] of actual) {
    let desde = ultima;
    for (const captura of capturas.slice(1)) {
      if (!porCaptura.get(captura)?.has(clave)) break;
      desde = captura;
    }
    resultado.set(clave, {
      nombre: fila.nombre.trim(),
      posicion: fila.posicion,
      categoria: fila.categoria?.trim() || null,
      publicaciones: fila.publicaciones ?? null,
      desde: new Date(desde).toISOString(),
    });
  }
  return resultado;
}

function contextoAlerta(titular: string | null, hayTrends: boolean, x: DatosX | null): string {
  if (hayTrends) {
    const base = titular ?? "Tendencia en Google España";
    return x
      ? `${base} · Fuentes: Google Trends y X (${detalleX(x)})`
      : `${base} · Fuente: Google Trends`;
  }
  return `En tendencia en X España (${detalleX(x ?? { posicion: 0 })}) · Fuente: X`;
}

const configSchema = z.object({
  max_alertas_dia: z.coerce.number().int().min(0).max(100000),
  hora_inicio: z.coerce.number().min(0).lt(24),
  hora_fin: z.coerce.number().gt(0).max(24),
});

function madridParts(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const { year, month, day, hour, minute, second } = z
    .object({
      year: z.number(),
      month: z.number(),
      day: z.number(),
      hour: z.number(),
      minute: z.number(),
      second: z.number(),
    })
    .parse(parts);
  return { year, month, day, hour, minute, second };
}

// Resolve local midnight itself, not the offset at "now": DST can change within a day.
export function inicioDiaMadrid(now: Date): Date {
  const p = madridParts(now);
  const target = Date.UTC(p["year"], p["month"] - 1, p["day"]);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const local = madridParts(new Date(guess));
    const wall = Date.UTC(
      local["year"],
      local["month"] - 1,
      local["day"],
      local["hour"],
      local["minute"],
      local["second"],
    );
    guess += target - wall;
  }
  return new Date(guess);
}

export function normalizarEntidad(value: string): string {
  return value
    .replace(/^\[(?:PRUEBA|SIN DISCOVER)\]\s*/i, "")
    .trim()
    .toLocaleLowerCase("es-ES");
}

// ---- Cuándo dos nombres son «lo mismo» (el SQL hace exactamente lo mismo: clave_entidad y entidades_equivalentes) ----
const ORIGEN =
  "ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝàáâãäåçèéêëìíîïðñòóôõöøùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİıĴĵĶķĹĺĻļĽľŁłŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DESTINO =
  "aaaaaaceeeeiiiidnoooooouuuuyaaaaaaceeeeiiiidnoooooouuuuyyaaaaaaccccccccddddeeeeeeeeeegggggggghhiiiiiiiiiijjkkllllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzzabcdefghijklmnopqrstuvwxyz";
const MAPA_LETRAS = new Map([...ORIGEN].map((c, i) => [c, DESTINO[i] ?? ""] as const));
const PALABRAS_VACIAS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "e",
  "en",
  "con",
  "por",
  "para",
  "al",
]);

/** Sin prefijo [SIN DISCOVER]/[PRUEBA], sin paréntesis «(cantante)», sin tildes ni mayúsculas. */
export function claveEntidad(valor: string): string {
  return [...valor.replace(/^\[(?:PRUEBA|SIN DISCOVER)\]\s*/i, "").replace(/\s*\([^)]*\)/g, "")]
    .map((c) => MAPA_LETRAS.get(c) ?? c)
    .join("")
    .replace(/[^a-z0-9#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palabrasClave(clave: string): string[] {
  return clave.split(" ").filter((t) => t.length >= 3 && !PALABRAS_VACIAS.has(t));
}

/** Lo que dicen los paréntesis de un nombre («cantante», «política»…), normalizado; vacío si no tiene. */
function parentesisEntidad(valor: string): string {
  return [...valor.matchAll(/\(([^)]*)\)/g)].map((m) => claveEntidad(m[1] ?? "")).join(" ");
}

/**
 * ¿Dos nombres son lo mismo?
 * - Si los dos llevan paréntesis y dicen cosas distintas («Marina Valverde (política)» y «(cantante)»): no.
 * - Iguales, o con las mismas palabras (sin artículos ni orden): sí.
 * - Si el corto es UNA palabra, debe ser la última del largo (el apellido: «abascal» en «santiago abascal», pero no
 *   «pedro» en «pedro sanchez») y tener al menos 5 letras.
 * - Si el corto tiene varias palabras, deben aparecer SEGUIDAS y en orden en el largo («isabel diaz» en
 *   «isabel diaz ayuso», pero no «juan valverde» en «juan carlos valverde»).
 */
export function entidadesEquivalentes(a: string, b: string): boolean {
  const ka = claveEntidad(a);
  const kb = claveEntidad(b);
  if (!ka || !kb) return false;
  const pa = parentesisEntidad(a);
  const pb = parentesisEntidad(b);
  if (pa !== "" && pb !== "" && pa !== pb) return false;
  if (ka === kb) return true;
  const oa = palabrasClave(ka);
  const ob = palabrasClave(kb);
  const ta = new Set(oa);
  const tb = new Set(ob);
  if (ta.size === 0 || tb.size === 0) return false;
  if (ta.size === tb.size && [...ta].every((t) => tb.has(t))) return true;
  const [cortoOrd, largoOrd] = ta.size <= tb.size ? ([oa, ob] as const) : ([ob, oa] as const);
  if (cortoOrd.join("").length < 5) return false;
  const n = cortoOrd.length;
  const m = largoOrd.length;
  if (n === 1) return cortoOrd[0] === largoOrd[m - 1];
  for (let i = 0; i + n <= m; i++) {
    if (cortoOrd.every((t, j) => largoOrd[i + j] === t)) return true;
  }
  return false;
}

export function planificarAlertasTrends(input: {
  now: Date;
  trends: TendenciaAlerta[];
  exclusiones: string[];
  alertas: AlertaReciente[];
  totalHoy: number;
  config: Record<string, string | null>;
  // Opcional. Sin reglas (o con las dos listas vacías) el comportamiento es el de siempre.
  reglas?: Reglas | undefined;
  // Opcional. Capturas recientes de x_tendencias (hasta 24 h). Sin ellas, solo hay candidatas de Trends.
  xTendencias?: TendenciaX[] | undefined;
}) {
  const config = configSchema.safeParse(input.config);
  if (
    !config.success ||
    Object.values(input.config).some((value) => value === null || value?.trim() === "")
  ) {
    throw new Error("Configuración de horario o máximo diario no válida.");
  }
  const reglas =
    input.reglas && (input.reglas.si.length > 0 || input.reglas.no.length > 0)
      ? input.reglas
      : undefined;
  const end = input.now.getTime();
  const window = input.trends.filter(
    (t) => Date.parse(t.capturado_en) >= end - 30 * 60000 && Date.parse(t.capturado_en) <= end,
  );
  const fallback = window.length === 0;
  const readings = (
    fallback
      ? input.trends.filter(
          (t) =>
            Date.parse(t.capturado_en) >= end - 2 * 3600000 && Date.parse(t.capturado_en) <= end,
        )
      : window
  )
    .slice()
    .sort((a, b) => Date.parse(b.capturado_en) - Date.parse(a.capturado_en) || b.id - a.id);
  const latest = new Map<string, TendenciaAlerta>();
  const descartadas: Descarte[] = [];
  for (const t of readings) {
    if (!t.termino?.trim()) {
      descartadas.push({ termino: "", motivo: "sin_termino" });
      continue;
    }
    if (!latest.has(t.termino)) latest.set(t.termino, t);
  }
  // Alertas de las últimas 24 h: si una candidata habla de lo mismo, se combina con ella en vez de crear otra.
  const recientes = input.alertas
    .filter((a) => Date.parse(a.creada_en) >= end - 24 * 3600000 && Date.parse(a.creada_en) <= end)
    .map((a) => a.entidad);
  const exclusions = input.exclusiones
    .map((e) => e.toLocaleLowerCase("es-ES"))
    .filter((e) => e.trim());
  const p = madridParts(input.now);
  const hour = p["hour"] + p["minute"] / 60 + p["second"] / 3600;
  const { hora_inicio: start, hora_fin: finish, max_alertas_dia: max } = config.data;
  const inHours = start <= finish ? hour >= start && hour < finish : hour >= start || hour < finish;
  const disponibles = Math.max(0, max - input.totalHoy);
  const nuevas: NuevaAlertaTrends[] = [];
  const fusiones: NuevaAlertaTrends[] = [];
  const planeadas: string[] = [];
  type Candidato = {
    termino: string;
    trend: TendenciaAlerta | null;
    x: XActual | null;
    titular: string | null;
  };
  const candidatosBase: Candidato[] = [...latest.values()].map((t) => {
    const termino = t.termino?.trim() ?? "";
    const first = Array.isArray(t.noticias) ? (t.noticias[0] as unknown) : null;
    const news = z.object({ titular: z.string() }).safeParse(first);
    const titular = news.success && news.data.titular.trim() ? news.data.titular : null;
    return { termino, trend: t, x: null, titular };
  });
  // X se cruza con Trends por el nombre normalizado: si coinciden, es una sola candidata con las dos señales.
  const actualesX = input.xTendencias
    ? xActuales(input.xTendencias, end)
    : new Map<string, XActual>();
  const indice = new Map<string, Candidato>();
  for (const c of candidatosBase)
    if (!indice.has(claveDe(c.termino))) indice.set(claveDe(c.termino), c);
  for (const [clave, xv] of actualesX) {
    const existente = indice.get(clave);
    if (existente) {
      existente.x = xv;
      existente.termino = xv.nombre;
    } else
      candidatosBase.push({
        termino: xv.nombre,
        trend: null,
        x: xv,
        titular: null,
      });
  }
  const candidatos = candidatosBase.map((c) => ({
    ...c,
    clasificacion: reglas ? clasificarPorReglas(c.termino, c.titular, reglas) : null,
  }));
  // Los huecos se llenan por puntos (la misma fórmula que decide la prioridad; aquí sin la parte de Discover, que
  // se conoce al guardar). A igualdad: lo que encaja, las dos señales juntas, X por puesto y Trends por volumen.
  const puntos = (c: (typeof candidatos)[number]) =>
    puntuarAlerta({
      entidad: "[SIN DISCOVER] " + c.termino,
      creada_en: input.now.toISOString(),
      x_posicion: c.x?.posicion ?? null,
      x_desde: c.x?.desde ?? null,
      trends_activo: c.trend !== null,
      trends_crecimiento: c.trend?.volumen ?? null,
      medios_discover: 0,
      motivo_afinidad: c.clasificacion?.motivo ?? "",
    }).puntos;
  const rango = (c: (typeof candidatos)[number]) => (c.clasificacion?.decision === "afin" ? 0 : 1);
  const fuerza = (c: (typeof candidatos)[number]) => (c.trend && c.x ? 0 : c.x ? 1 : 2);
  candidatos.sort(
    (a, b) =>
      puntos(b) - puntos(a) ||
      rango(a) - rango(b) ||
      fuerza(a) - fuerza(b) ||
      (a.x?.posicion ?? 999) - (b.x?.posicion ?? 999) ||
      volumenNumerico(b.trend?.volumen ?? null) - volumenNumerico(a.trend?.volumen ?? null) ||
      a.termino.localeCompare(b.termino, "es"),
  );
  const MAX_FUSIONES = 30;
  for (const { trend, x, termino, titular, clasificacion } of candidatos) {
    let motivo: MotivoDescarte | undefined;
    if (exclusions.some((e) => termino.toLocaleLowerCase("es-ES").includes(e)))
      motivo = "exclusion";
    else if (
      clasificacion &&
      (clasificacion.decision === "descartar" ||
        (clasificacion.decision === "sin_clasificar" && reglas?.modo === "estricto"))
    )
      motivo = "reglas";
    if (motivo) {
      descartadas.push({ termino, motivo });
      continue;
    }
    const alerta: NuevaAlertaTrends = {
      entidad: "[SIN DISCOVER] " + termino,
      contexto: contextoAlerta(titular, trend !== null, x),
      prioridad: "media",
      trends_activo: trend !== null,
      trends_crecimiento: trend?.volumen ?? null,
      x_posicion: x?.posicion ?? null,
      x_desde: x?.desde ?? null,
      medios_discover: 0,
      medios_lista: [],
      titulares_seo: [],
      angulo: "Pendiente: aún sin IA",
      seccion_sugerida: clasificacion?.seccion ?? "Sin sugerir",
      motivo_afinidad: clasificacion
        ? clasificacion.motivo
        : "Sin filtro editorial todavía (solo Trends)",
      estado: "pendiente",
    };
    // ¿Habla de lo mismo que una alerta reciente o que otra candidata de esta ejecución? Se envía para combinarla:
    // no crea alerta nueva, así que no cuenta para el horario, el tope diario ni el límite de la ejecución.
    if (
      recientes.some((r) => entidadesEquivalentes(r, termino)) ||
      planeadas.some((r) => entidadesEquivalentes(r, termino))
    ) {
      if (fusiones.length < MAX_FUSIONES) fusiones.push(alerta);
      continue;
    }
    if (!inHours) motivo = "fuera_de_horario";
    else if (nuevas.length >= disponibles) motivo = "tope_diario";
    else if (nuevas.length >= 3) motivo = "limite_ejecucion";
    if (motivo) {
      descartadas.push({ termino, motivo });
      continue;
    }
    nuevas.push(alerta);
    planeadas.push(termino);
  }
  return {
    nuevas,
    fusiones,
    descartadas,
    ventana_minutos: fallback ? 120 : 30,
    tendencias_unicas: latest.size,
    lecturas_repetidas:
      readings.length - latest.size - descartadas.filter((d) => d.motivo === "sin_termino").length,
    total_hoy_antes: input.totalHoy,
    max_alertas_dia: max,
    ...(input.xTendencias ? { candidatas_x: actualesX.size } : {}),
  };
}
