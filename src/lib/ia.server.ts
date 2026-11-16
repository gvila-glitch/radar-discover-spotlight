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

// Gemini 3.8 Flash es el modelo disponible en el nivel gratuito de nuestra clave. Con 30 temas en una sola petición
// tardaba más de 45 s: por eso los temas van en grupos pequeños pedidos a la vez. Si el modelo no existe (404), no está
// permitido (403) o se pasa del límite (429), se prueban los Flash-Lite, más rápidos («-latest» = el más reciente).
export const MODELO_POR_DEFECTO = "gemini-3.8-flash";
export const MODELOS_RESPALDO = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite"];
/** Temas por petición: se piden varios grupos a la vez, que tardan menos que uno grande. */
export const TEMAS_POR_GRUPO = 8;
const ESPERA_MS = 45_000; // por petición
const PRESUPUESTO_MS = 55_000; // en total, contando reintentos (la tarea de X/Trends espera hasta 120 s)

export type ResultadoIA = {
  estado: "ok" | "sin_clave" | "error";
  modelo: string;
  mensaje?: string;
  clasificaciones: Map<string, ClasificacionIA>;
  /** Qué se intentó, con su resultado y lo que tardó (para diagnosticar; sin datos de la petición). */
  intentos: string[];
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

type Grupo = { texto: string; temas: string[] };
type RespuestaGrupo = {
  estado: "ok" | "no_disponible" | "tiempo" | "error";
  status?: number;
  clasificaciones?: Map<string, ClasificacionIA>;
};

export async function clasificarConIA(
  candidatas: CandidataIA[],
  perfil: PerfilIA,
  opciones: { clave?: string | undefined; modelo?: string | undefined; pedir?: typeof fetch } = {},
): Promise<ResultadoIA> {
  const elegido =
    (opciones.modelo ?? process.env["GEMINI_MODEL"] ?? "").trim() || MODELO_POR_DEFECTO;
  const modelos = [elegido, ...MODELOS_RESPALDO.filter((m) => m !== elegido)];
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
    if ([403, 404, 429].includes(res.status))
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

  let ultimo = elegido;
  let ultimaFalta: RespuestaGrupo | null = null;
  for (const modelo of modelos) {
    if (finEn - Date.now() < 3000) break;
    ultimo = modelo;
    const respuestas = await Promise.all(grupos.map((g, i) => pedirGrupo(modelo, g, i + 1)));
    const buenas = respuestas.filter((r) => r.estado === "ok");
    if (buenas.length) {
      const clasificaciones = new Map<string, ClasificacionIA>();
      for (const r of buenas) for (const [k, v] of r.clasificaciones!) clasificaciones.set(k, v);
      return {
        estado: "ok",
        modelo,
        clasificaciones,
        intentos,
        ...(buenas.length < grupos.length
          ? { mensaje: `Gemini respondió a ${buenas.length} de ${grupos.length} grupos.` }
          : {}),
      };
    }
    ultimaFalta = respuestas.find((r) => r.estado !== "no_disponible") ?? respuestas[0] ?? null;
    // Solo se prueba otro modelo si este no existe, no está permitido o se pasó del límite.
    if (!respuestas.every((r) => r.estado === "no_disponible")) break;
  }
  const mensaje = !ultimaFalta
    ? "Gemini tardó demasiado en responder."
    : ultimaFalta.estado === "no_disponible"
      ? ultimaFalta.status === 429
        ? `Gemini: límite de uso alcanzado en todos los modelos (HTTP 429): ${modelos.join(", ")}.`
        : `Ningún modelo de Gemini disponible (HTTP ${ultimaFalta.status}): ${modelos.join(", ")}.`
      : ultimaFalta.estado === "tiempo"
        ? "Gemini tardó demasiado en responder."
        : ultimaFalta.status
          ? `Gemini respondió con HTTP ${ultimaFalta.status}.`
          : "Gemini devolvió una respuesta vacía o que no se entiende.";
  return { estado: "error", modelo: ultimo, mensaje, clasificaciones: vacio, intentos };
}

/** Resumen para la respuesta de las tareas (se ve en net._http_response). */
export const informeIA = (r: ResultadoIA) => ({
  ia: r.estado,
  ia_modelo: r.modelo,
  ia_valoradas: r.clasificaciones.size,
  ...(r.mensaje ? { ia_mensaje: r.mensaje } : {}),
  ...(r.intentos.length ? { ia_intentos: r.intentos.join(" | ") } : {}),
});
