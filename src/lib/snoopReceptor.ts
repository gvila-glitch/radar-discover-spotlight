// Receptor de las alertas JSON push de Discover Snoop. Lógica pura (sin red ni base de datos): se prueba aparte de la ruta.

export const MAX_CUERPO_BYTES = 100_000;
export const MAX_ELEMENTOS = 200;

export type SnoopFila = {
  url: string;
  medio: string;
  titular: string | null;
  entradilla: string | null;
  alerta: string | null;
};

export type ResultadoSnoop = {
  status: number;
  cuerpo: Record<string, unknown>;
  log?: string;
};

type Objeto = Record<string, unknown>;

const PARAMETROS_SEGUIMIENTO = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);

// Deja solo el dominio del medio: sin "www." ni "amp.", en minúsculas.
// La tabla snoop_articulos rechaza dominios que empiecen por "www." o tengan "/", espacios o ":".
export function limpiarDominio(host: string): string | null {
  let actual = host.trim().toLowerCase().replace(/\.+$/, "");
  for (let anterior = ""; anterior !== actual;) {
    anterior = actual;
    actual = actual.replace(/^(www|amp)\./, "");
  }
  if (!actual.includes(".") || /[\s/:]/.test(actual)) return null;
  return actual;
}

// Acepta solo http(s), quita el fragmento (#...) y los parámetros de seguimiento (utm_*, fbclid...).
export function normalizarUrl(valor: unknown): URL | null {
  if (typeof valor !== "string" || valor.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.hash = "";
  for (const clave of [...url.searchParams.keys()]) {
    if (PARAMETROS_SEGUIMIENTO.test(clave)) url.searchParams.delete(clave);
  }
  return url;
}

function texto(valor: unknown, maximo: number): string | null {
  if (typeof valor !== "string") return null;
  // eslint-disable-next-line no-control-regex -- se eliminan a propósito los caracteres de control de los titulares
  const limpio = valor.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

// Snoop manda (según su ayuda) un artículo por envío, pero el formato exacto no está confirmado:
// se admite un objeto, una lista de objetos, o un objeto con una lista dentro.
export function extraerElementos(json: unknown): Objeto[] {
  if (Array.isArray(json)) return json.filter(esObjeto);
  if (!esObjeto(json)) return [];
  if ("Element_URL" in json) return [json];
  for (const valor of Object.values(json)) {
    if (Array.isArray(valor) && valor.some(esObjeto)) return valor.filter(esObjeto);
  }
  return [];
}

// Solo se leen estos cuatro campos. Customer_* (correo y nombre de la cuenta) y Element_Image
// no se leen, no se guardan y no se registran nunca.
export function aFilas(elementos: Objeto[]): { filas: SnoopFila[]; descartados: number } {
  const vistas = new Set<string>();
  const filas: SnoopFila[] = [];
  let descartados = 0;
  for (const elemento of elementos) {
    const url = normalizarUrl(elemento["Element_URL"]);
    const medio = url ? limpiarDominio(url.hostname) : null;
    if (!url || !medio) {
      descartados += 1;
      continue;
    }
    const direccion = url.toString();
    if (vistas.has(direccion)) continue;
    vistas.add(direccion);
    filas.push({
      url: direccion,
      medio,
      titular: texto(elemento["Element_Title"], 1000),
      entradilla: texto(elemento["Element_Headline"], 2000),
      alerta: texto(elemento["Alert_Name"], 200),
    });
  }
  return { filas, descartados };
}

const nombreSeguro = (clave: string) => clave.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 40);
const claves = (objeto: Objeto) =>
  Object.keys(objeto).slice(0, 20).map(nombreSeguro).join(", ") || "ninguno";

// Para diagnosticar un formato inesperado: solo NOMBRES de campos, nunca valores.
export function describirForma(json: unknown): string {
  if (Array.isArray(json)) {
    const primero = json.find(esObjeto);
    return `lista de ${json.length}; campos del primero: ${primero ? claves(primero) : "ninguno"}`;
  }
  if (esObjeto(json)) return `objeto; campos: ${claves(json)}`;
  return `tipo ${typeof json}`;
}

// Compara el token con huellas de igual longitud y en tiempo constante.
export async function tokenValido(
  recibido: string | null,
  esperado: string | undefined,
): Promise<boolean> {
  if (!esperado || !recibido) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const huella = (valor: string) => createHash("sha256").update(valor, "utf8").digest();
  return timingSafeEqual(huella(recibido), huella(esperado));
}

export async function procesarEnvioSnoop(deps: {
  token: string | null;
  secreto: string | undefined;
  metodo: string;
  contentLength: number | null;
  leerTexto: () => Promise<string>;
  guardar: (filas: SnoopFila[]) => Promise<number>;
}): Promise<ResultadoSnoop> {
  // Sin secreto configurado se rechaza todo.
  if (!deps.secreto) return { status: 500, cuerpo: { error: "Server configuration error" } };
  if (!(await tokenValido(deps.token, deps.secreto)))
    return { status: 401, cuerpo: { error: "Unauthorized" } };
  if (deps.metodo !== "POST" && deps.metodo !== "PUT") {
    return {
      status: 405,
      cuerpo: { error: "Método no admitido" },
      log: `Método no admitido: ${deps.metodo.slice(0, 10)}`,
    };
  }
  if (deps.contentLength !== null && deps.contentLength > MAX_CUERPO_BYTES) {
    return {
      status: 413,
      cuerpo: { error: "Envío demasiado grande" },
      log: "Envío rechazado por tamaño.",
    };
  }
  const cuerpo = await deps.leerTexto();
  if (cuerpo.length > MAX_CUERPO_BYTES) {
    return {
      status: 413,
      cuerpo: { error: "Envío demasiado grande" },
      log: "Envío rechazado por tamaño.",
    };
  }
  // Desde aquí el envío está autorizado. Si no se puede usar se responde 200 y se anota,
  // porque Snoop reintenta sin fin mientras no reciba un 200.
  let json: unknown;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    return {
      status: 200,
      cuerpo: { guardados: 0, motivo: "json_no_valido" },
      log: "Envío ignorado: JSON no válido.",
    };
  }
  const elementos = extraerElementos(json).slice(0, MAX_ELEMENTOS);
  const { filas, descartados } = aFilas(elementos);
  if (filas.length === 0) {
    return {
      status: 200,
      cuerpo: {
        guardados: 0,
        recibidos: elementos.length,
        descartados,
        motivo: "sin_filas_validas",
      },
      log: `Envío ignorado: sin filas válidas (${describirForma(json)}).`,
    };
  }
  try {
    const guardados = await deps.guardar(filas);
    return {
      status: 200,
      cuerpo: { guardados, recibidos: elementos.length, descartados },
      log: `${guardados} guardados de ${filas.length} válidos.`,
    };
  } catch {
    // 502: error pasajero de la base de datos; Snoop reintentará.
    return {
      status: 502,
      cuerpo: { error: "No se pudo guardar el envío." },
      log: "Error al guardar en la base de datos.",
    };
  }
}
