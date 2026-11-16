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
const ESPERA_MS = 20_000;
const PRESUPUESTO_MS = 40_000; // tiempo total máximo contando reintentos (la tarea espera hasta 60 s)

export type ResultadoIA = {
  estado: "ok" | "sin_clave" | "error";
  modelo: string;
  mensaje?: string;
  clasificaciones: Map<string, ClasificacionIA>;
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

/** Cómo pedir que «piense» poco (más rápido; basta para clasificar), según la familia del modelo. */
function pensarPoco(modelo: string): Record<string, unknown> | null {
  if (modelo.startsWith("gemini-2.5")) return { thinkingBudget: 0 };
  if (modelo.startsWith("gemini-3") || modelo.endsWith("-latest")) return { thinkingLevel: "low" };
  return null;
}

export async function clasificarConIA(
  candidatas: CandidataIA[],
  perfil: PerfilIA,
  opciones: { clave?: string | undefined; modelo?: string | undefined; pedir?: typeof fetch } = {},
): Promise<ResultadoIA> {
  const elegido =
    (opciones.modelo ?? process.env["GEMINI_MODEL"] ?? "").trim() || MODELO_POR_DEFECTO;
  const modelos = [elegido, ...MODELOS_RESPALDO.filter((m) => m !== elegido)];
  const clave = (opciones.clave ?? process.env["GEMINI_API_KEY"] ?? "").trim();
  const vacio = new Map<string, ClasificacionIA>();
  if (!clave) return { estado: "sin_clave", modelo: elegido, clasificaciones: vacio };
  const { texto, temas } = listaParaIA(candidatas);
  if (!temas.length) return { estado: "ok", modelo: elegido, clasificaciones: vacio };
  const pedir = opciones.pedir ?? fetch;
  const inicio = Date.now();
  const llamar = (modelo: string, pensar: Record<string, unknown> | null) =>
    pedir(
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
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: ESQUEMA_RESPUESTA,
            ...(pensar ? { thinkingConfig: pensar } : {}),
          },
        }),
        signal: AbortSignal.timeout(
          Math.max(1000, Math.min(ESPERA_MS, PRESUPUESTO_MS - (Date.now() - inicio))),
        ),
      },
    );
  let ultimo = elegido;
  let no404 = false;
  try {
    for (const modelo of modelos) {
      if (Date.now() - inicio > PRESUPUESTO_MS) break;
      ultimo = modelo;
      let pensar = pensarPoco(modelo);
      let res = await llamar(modelo, pensar);
      // Si el modelo no admite la forma de «pensar poco», se repite una vez sin ella.
      if (res.status === 400 && pensar) {
        pensar = null;
        res = await llamar(modelo, null);
      }
      if (res.status === 404) continue; // ese modelo ya no existe: se prueba el siguiente
      no404 = true;
      // Nunca se devuelve ni se registra el cuerpo de un error: podría repetir datos de la petición.
      if (!res.ok)
        return {
          estado: "error",
          modelo,
          mensaje:
            res.status === 429
              ? "Gemini: límite de uso alcanzado (HTTP 429)."
              : `Gemini respondió con HTTP ${res.status}.`,
          clasificaciones: vacio,
        };
      const cuerpo = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const textoRespuesta = (cuerpo.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("");
      const clasificaciones = leerRespuestaIA(JSON.parse(textoRespuesta || "null"), temas);
      if (!clasificaciones.size)
        return {
          estado: "error",
          modelo,
          mensaje: "Gemini devolvió una respuesta vacía o con otro formato.",
          clasificaciones,
        };
      return { estado: "ok", modelo, clasificaciones };
    }
    return {
      estado: "error",
      modelo: ultimo,
      mensaje: no404
        ? "Gemini tardó demasiado en responder."
        : `Ningún modelo de Gemini disponible (HTTP 404): ${modelos.join(", ")}.`,
      clasificaciones: vacio,
    };
  } catch (e) {
    const tiempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      estado: "error",
      modelo: ultimo,
      mensaje: tiempo
        ? "Gemini tardó demasiado en responder."
        : "No se pudo hablar con Gemini o la respuesta no se entendió.",
      clasificaciones: vacio,
    };
  }
}

/** Resumen para la respuesta de las tareas (se ve en net._http_response). */
export const informeIA = (r: ResultadoIA) => ({
  ia: r.estado,
  ia_modelo: r.modelo,
  ia_valoradas: r.clasificaciones.size,
  ...(r.mensaje ? { ia_mensaje: r.mensaje } : {}),
});
