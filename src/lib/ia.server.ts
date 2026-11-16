// Llamada a la IA (Gemini, nivel gratuito, con la clave propia GEMINI_API_KEY guardada en los secretos de Lovable).
// Es una excepción deliberada a la pasarela de IA de Lovable, que gasta créditos. Nunca hace fallar la creación de
// alertas: sin clave, con error, con límite de uso o si tarda demasiado, devuelve «sin opinión» y deciden las reglas.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ClasificacionIA } from "./trendsAlertas";
import {
  ESQUEMA_RESPUESTA,
  instrucciones,
  leerRespuestaIA,
  listaParaIA,
  type CandidataIA,
  type PerfilIA,
} from "./ia";

// Normalmente se pregunta a Google qué modelos tiene la clave y se usan primero los Flash-Lite (los más rápidos; el
// 16 nov, gemini-3.5-flash-lite, unos 2 s por grupo). Esta lista fija solo se usa si Google no da la suya. Los temas van
// en grupos pequeños pedidos a la vez; un grupo que recibe «no existe» (404), «no permitido» (403), «límite» (429),
// «saturado» (503) o tarda demasiado se repite con el siguiente modelo («-latest» = el más reciente).
export const MODELO_POR_DEFECTO = "gemini-3.8-flash";
export const MODELOS_RESPALDO = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite"];
/** Temas por petición: se piden varios grupos a la vez, que tardan menos que uno grande. */
export const TEMAS_POR_GRUPO = 8;
const ESPERA_MS = 25_000; // por petición: si un modelo tarda, queda tiempo para probar otro
const PRESUPUESTO_MS = 55_000; // en total, contando reintentos (la tarea de X/Trends espera hasta 120 s)

export type ResultadoIA = {
  estado: "ok" | "sin_clave" | "error";
  modelo: string;
  mensaje?: string;
  clasificaciones: Map<string, ClasificacionIA>;
  /** Qué se intentó, con su resultado y lo que tardó (para diagnosticar; sin datos de la petición). */
  intentos: string[];
  /** Modelos que Google dice que puede usar la clave (si se pudo preguntar). */
  disponibles?: string[];
};

/** Perfil, ámbito y excepciones de Configuración (lo que se edita en el panel). */
export async function leerPerfilIA(client: SupabaseClient<Database>): Promise<PerfilIA> {
  const { data, error } = await client
    .from("config")
    .select("clave,valor")
    .in("clave", ["perfil_editorial", "ambito", "excepciones"]);
  if (error) return { perfil: "", ambito: "", excepciones: "" };
  const m = Object.fromEntries((data ?? []).map((c) => [c.clave, c.valor ?? ""]));
  return {
    perfil: m["perfil_editorial"] ?? "",
    ambito: m["ambito"] ?? "",
    excepciones: m["excepciones"] ?? "",
  };
}

/**
 * Formas de pedir que «piense» poco (más rápido; basta para clasificar), de la más rápida a ninguna. Si el modelo no
 * admite una (HTTP 400), se prueba la siguiente.
 */
function formasDePensar(modelo: string): (Record<string, unknown> | null)[] {
  if (modelo.startsWith("gemini-2.5")) return [{ thinkingBudget: 0 }, null];
  // Los Flash-Lite admiten «minimal»; Gemini 3.8 Flash no (responde 400), así que a ese se le pide «low» directamente.
  if (modelo.includes("flash-lite"))
    return [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }, null];
  if (modelo.startsWith("gemini-3") || modelo.endsWith("-latest"))
    return [{ thinkingLevel: "low" }, null];
  return [null];
}
const etiqueta = (p: Record<string, unknown> | null) =>
  p ? String(p["thinkingLevel"] ?? `presupuesto ${String(p["thinkingBudget"])}`) : "normal";
const esTiempo = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

// ---- Qué modelos puede usar la clave: se pregunta a Google (lista de modelos) y se guarda una hora ----
const cacheModelos = new Map<string, { lista: string[]; en: number }>();
const EXCLUIR = /(image|tts|audio|live|embedding|exp|vision|robotics|computer)/;
const version = (m: string) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(m)?.[1] ?? 0);

/** Ordena los modelos Flash: primero los Flash-Lite (más rápidos y menos saturados), de más nuevo a más viejo. */
export function ordenarModelos(nombres: string[]): string[] {
  const flash = [...new Set(nombres.map((n) => n.replace(/^models\//, "")))].filter(
    (n) => n.startsWith("gemini-") && n.includes("flash") && !EXCLUIR.test(n),
  );
  const clave = (n: string) =>
    [n.includes("flash-lite") ? 0 : 1, n.endsWith("-latest") ? 1 : 0, -version(n)] as const;
  return flash
    .sort((a, b) => {
      const x = clave(a);
      const y = clave(b);
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || (a < b ? -1 : 1);
    })
    .slice(0, 4);
}

export async function descubrirModelos(
  pedir: typeof fetch,
  clave: string,
): Promise<string[] | null> {
  const guardado = cacheModelos.get(clave);
  if (guardado && Date.now() - guardado.en < 3_600_000) return guardado.lista;
  try {
    const res = await pedir(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      {
        headers: { "x-goog-api-key": clave },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const cuerpo = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const nombres = (cuerpo.models ?? [])
      .filter(
        (m) =>
          typeof m.name === "string" &&
          (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m) => m.name!);
    const lista = ordenarModelos(nombres);
    if (!lista.length) return null;
    cacheModelos.set(clave, { lista, en: Date.now() });
    return lista;
  } catch {
    return null;
  }
}

/** Solo para pruebas: olvida la lista guardada. */
export const olvidarModelos = () => cacheModelos.clear();

type Grupo = { texto: string; temas: string[] };
type RespuestaGrupo = {
  estado: "ok" | "no_disponible" | "tiempo" | "error";
  status?: number;
  clasificaciones?: Map<string, ClasificacionIA>;
};

export async function clasificarConIA(
  candidatas: CandidataIA[],
  perfil: PerfilIA,
  opciones: {
    clave?: string | undefined;
    modelo?: string | undefined;
    pedir?: typeof fetch;
    /** Preguntar a Google qué modelos hay (por defecto, sí, salvo que se haya fijado uno). */
    descubrir?: boolean;
  } = {},
): Promise<ResultadoIA> {
  const fijado = (opciones.modelo ?? process.env["GEMINI_MODEL"] ?? "").trim();
  const elegido = fijado || MODELO_POR_DEFECTO;
  let modelos = [elegido, ...MODELOS_RESPALDO.filter((m) => m !== elegido)];
  const clave = (opciones.clave ?? process.env["GEMINI_API_KEY"] ?? "").trim();
  const intentos: string[] = [];
  const vacio = new Map<string, ClasificacionIA>();
  if (!clave) return { estado: "sin_clave", modelo: elegido, clasificaciones: vacio, intentos };
  // Lista sin repetidos y con el máximo de temas; después, en grupos (cada uno con sus propios números de id).
  const { temas: todos } = listaParaIA(candidatas);
  if (!todos.length) return { estado: "ok", modelo: elegido, clasificaciones: vacio, intentos };
  const porTema = new Map(candidatas.map((c) => [c.tema.trim(), c]));
  const grupos: Grupo[] = [];
  for (let i = 0; i < todos.length; i += TEMAS_POR_GRUPO)
    grupos.push(listaParaIA(todos.slice(i, i + TEMAS_POR_GRUPO).map((t) => porTema.get(t)!)));
  const pedir = opciones.pedir ?? fetch;
  // Sin modelo fijado, se pregunta a Google cuáles hay y se prueban en orden (Flash-Lite primero).
  let disponibles: string[] | undefined;
  if (!fijado && opciones.descubrir !== false) {
    const lista = await descubrirModelos(pedir, clave);
    if (lista) {
      disponibles = lista;
      modelos = lista;
    }
  }
  const finEn = Date.now() + PRESUPUESTO_MS;
  const segundos = (desde: number) =>
    `${((Date.now() - desde) / 1000).toFixed(1).replace(".", ",")} s`;

  async function pedirGrupo(modelo: string, g: Grupo, n: number): Promise<RespuestaGrupo> {
    const pre = grupos.length > 1 ? `grupo ${n}: ` : "";
    let res: Response | null = null;
    for (const pensar of formasDePensar(modelo)) {
      const queda = finEn - Date.now();
      if (queda < 3000) return { estado: "tiempo" };
      const t = Date.now();
      try {
        res = await pedir(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
          {
            method: "POST",
            // La clave va en una cabecera, no en la dirección (así no queda en registros de URLs).
            headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: instrucciones(perfil) }] },
              contents: [{ role: "user", parts: [{ text: g.texto }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
                responseSchema: ESQUEMA_RESPUESTA,
                ...(pensar ? { thinkingConfig: pensar } : {}),
              },
            }),
            signal: AbortSignal.timeout(Math.min(ESPERA_MS, queda)),
          },
        );
      } catch (e) {
        intentos.push(
          `${pre}${modelo} [${etiqueta(pensar)}] → ${esTiempo(e) ? "sin respuesta" : "fallo de red"} (${segundos(t)})`,
        );
        return { estado: esTiempo(e) ? "tiempo" : "error" };
      }
      intentos.push(
        `${pre}${modelo} [${etiqueta(pensar)}] → ${res.ok ? "ok" : `HTTP ${res.status}`} (${segundos(t)})`,
      );
      if (res.status !== 400) break; // 400: el modelo no admite esa forma de «pensar poco»; se prueba la siguiente
    }
    if (!res) return { estado: "tiempo" };
    // Nunca se devuelve ni se registra el cuerpo de un error: podría repetir datos de la petición.
    // 403 no permitido, 404 no existe, 429 límite, 503 saturado: se probará otro modelo.
    if ([403, 404, 429, 503].includes(res.status))
      return { estado: "no_disponible", status: res.status };
    if (!res.ok) return { estado: "error", status: res.status };
    try {
      const cuerpo = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const texto = (cuerpo.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      const clasificaciones = leerRespuestaIA(JSON.parse(texto || "null"), g.temas);
      return clasificaciones.size ? { estado: "ok", clasificaciones } : { estado: "error" };
    } catch {
      return { estado: "error" };
    }
  }

  // Cada modelo recibe solo los grupos que siguen sin respuesta: si un grupo falla porque el modelo no existe, no está
  // permitido, se pasó del límite, está saturado o tarda, se repite con el siguiente modelo de la lista. Un error de
  // otro tipo no lo arregla cambiar de modelo: ese grupo se queda sin opinión y lo deciden las reglas.
  const clasificaciones = new Map<string, ClasificacionIA>();
  const usados: string[] = [];
  let respondidos = 0;
  let pendientes = grupos.map((g, i) => ({ g, n: i + 1 }));
  let ultimo = elegido;
  let ultimaFalta: RespuestaGrupo | null = null;
  for (const modelo of modelos) {
    if (!pendientes.length || finEn - Date.now() < 5000) break;
    ultimo = modelo;
    const respuestas = await Promise.all(pendientes.map((p) => pedirGrupo(modelo, p.g, p.n)));
    const buenas = respuestas.filter((r) => r.estado === "ok");
    if (buenas.length) usados.push(modelo);
    respondidos += buenas.length;
    for (const r of buenas) for (const [k, v] of r.clasificaciones!) clasificaciones.set(k, v);
    const fallos = respuestas.filter((r) => r.estado !== "ok");
    ultimaFalta =
      fallos.find((r) => r.estado === "error") ??
      fallos.find((r) => r.estado === "tiempo") ??
      fallos[0] ??
      ultimaFalta;
    pendientes = pendientes.filter(
      (_, i) => respuestas[i]!.estado === "no_disponible" || respuestas[i]!.estado === "tiempo",
    );
  }
  if (respondidos)
    return {
      estado: "ok",
      // Si respondieron varios modelos (porque se repitieron grupos), se anotan todos, en el orden en que se usaron.
      modelo: usados.join(" + "),
      clasificaciones,
      intentos,
      ...(disponibles ? { disponibles } : {}),
      ...(respondidos < grupos.length
        ? { mensaje: `Gemini respondió a ${respondidos} de ${grupos.length} grupos.` }
        : {}),
    };
  const mensaje = !ultimaFalta
    ? "Gemini tardó demasiado en responder."
    : ultimaFalta.estado === "no_disponible"
      ? ultimaFalta.status === 429
        ? `Gemini: límite de uso alcanzado en todos los modelos (HTTP 429): ${modelos.join(", ")}.`
        : ultimaFalta.status === 503
          ? `Gemini saturado (HTTP 503) en los modelos probados: ${modelos.join(", ")}.`
          : `Ningún modelo de Gemini disponible (HTTP ${ultimaFalta.status}): ${modelos.join(", ")}.`
      : ultimaFalta.estado === "tiempo"
        ? "Gemini tardó demasiado en responder."
        : ultimaFalta.status
          ? `Gemini respondió con HTTP ${ultimaFalta.status}.`
          : "Gemini devolvió una respuesta vacía o que no se entiende.";
  return {
    estado: "error",
    modelo: ultimo,
    mensaje,
    clasificaciones: vacio,
    intentos,
    ...(disponibles ? { disponibles } : {}),
  };
}

/** Resumen para la respuesta de las tareas (se ve en net._http_response). */
export const informeIA = (r: ResultadoIA) => ({
  ia: r.estado,
  ia_modelo: r.modelo,
  ia_valoradas: r.clasificaciones.size,
  ...(r.mensaje ? { ia_mensaje: r.mensaje } : {}),
  ...(r.intentos.length ? { ia_intentos: r.intentos.join(" | ") } : {}),
  ...(r.disponibles?.length ? { ia_disponibles: r.disponibles.join(", ") } : {}),
});
