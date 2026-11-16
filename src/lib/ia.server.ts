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

export const MODELO_POR_DEFECTO = "gemini-3.8-flash";
// Si un modelo ya no existe (HTTP 404), se prueba el siguiente: así, cuando Google retire un modelo, no se para.
// «gemini-flash-latest» es el nombre genérico que siempre apunta al Flash más reciente.
export const MODELOS_RESPALDO = ["gemini-flash-latest", "gemini-3.6-flash"];
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
  if (modelo.startsWith("gemini-3") || modelo.endsWith("-latest"))
    return [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }, null];
  return [null];
}
const etiqueta = (p: Record<string, unknown> | null) =>
  p ? String(p["thinkingLevel"] ?? `presupuesto ${String(p["thinkingBudget"])}`) : "normal";
const esTiempo = (e: unknown) =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

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
  const { texto, temas } = listaParaIA(candidatas);
  if (!temas.length) return { estado: "ok", modelo: elegido, clasificaciones: vacio, intentos };
  const pedir = opciones.pedir ?? fetch;
  const inicio = Date.now();
  const segundos = (desde: number) =>
    `${((Date.now() - desde) / 1000).toFixed(1).replace(".", ",")} s`;
  const error = (modelo: string, mensaje: string): ResultadoIA => ({
    estado: "error",
    modelo,
    mensaje,
    clasificaciones: vacio,
    intentos,
  });
  let ultimo = elegido;
  let todos404 = true;
  for (const modelo of modelos) {
    ultimo = modelo;
    let res: Response | null = null;
    for (const pensar of formasDePensar(modelo)) {
      const queda = PRESUPUESTO_MS - (Date.now() - inicio);
      if (queda < 3000) return error(modelo, "Gemini tardó demasiado en responder.");
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
              contents: [{ role: "user", parts: [{ text: texto }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4096,
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
          `${modelo} [${etiqueta(pensar)}] → ${esTiempo(e) ? "sin respuesta" : "fallo de red"} (${segundos(t)})`,
        );
        return error(
          modelo,
          esTiempo(e) ? "Gemini tardó demasiado en responder." : "No se pudo hablar con Gemini.",
        );
      }
      intentos.push(
        `${modelo} [${etiqueta(pensar)}] → ${res.ok ? "ok" : `HTTP ${res.status}`} (${segundos(t)})`,
      );
      if (res.status !== 400) break; // 400: el modelo no admite esa forma de «pensar poco»; se prueba la siguiente
    }
    if (!res || res.status === 404) continue; // ese modelo ya no existe: se prueba el siguiente
    todos404 = false;
    // Nunca se devuelve ni se registra el cuerpo de un error: podría repetir datos de la petición.
    if (!res.ok)
      return error(
        modelo,
        res.status === 429
          ? "Gemini: límite de uso alcanzado (HTTP 429)."
          : `Gemini respondió con HTTP ${res.status}.`,
      );
    try {
      const cuerpo = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const textoRespuesta = (cuerpo.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      const clasificaciones = leerRespuestaIA(JSON.parse(textoRespuesta || "null"), temas);
      if (!clasificaciones.size)
        return error(modelo, "Gemini devolvió una respuesta vacía o con otro formato.");
      return { estado: "ok", modelo, clasificaciones, intentos };
    } catch {
      return error(modelo, "Gemini devolvió una respuesta que no se entiende.");
    }
  }
  return error(
    ultimo,
    todos404
      ? `Ningún modelo de Gemini disponible (HTTP 404): ${modelos.join(", ")}.`
      : "Gemini no respondió.",
  );
}

/** Resumen para la respuesta de las tareas (se ve en net._http_response). */
export const informeIA = (r: ResultadoIA) => ({
  ia: r.estado,
  ia_modelo: r.modelo,
  ia_valoradas: r.clasificaciones.size,
  ...(r.mensaje ? { ia_mensaje: r.mensaje } : {}),
  ...(r.intentos.length ? { ia_intentos: r.intentos.join(" | ") } : {}),
});
