// Llamada a la IA (Gemini, nivel gratuito, con la clave propia GEMINI_API_KEY guardada en los secretos de Lovable).
// Es una excepción deliberada a la pasarela de IA de Lovable, que gasta créditos. Nunca hace fallar la creación de
// alertas: sin clave, con error, con límite de uso o si tarda más de 25 s, devuelve «sin opinión» y deciden las reglas.
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

export const MODELO_POR_DEFECTO = "gemini-2.5-flash";
const ESPERA_MS = 25_000;

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

export async function clasificarConIA(
  candidatas: CandidataIA[],
  perfil: PerfilIA,
  opciones: { clave?: string | undefined; modelo?: string | undefined; pedir?: typeof fetch } = {},
): Promise<ResultadoIA> {
  const modelo =
    (opciones.modelo ?? process.env["GEMINI_MODEL"] ?? "").trim() || MODELO_POR_DEFECTO;
  const clave = (opciones.clave ?? process.env["GEMINI_API_KEY"] ?? "").trim();
  const vacio = new Map<string, ClasificacionIA>();
  if (!clave) return { estado: "sin_clave", modelo, clasificaciones: vacio };
  const { texto, temas } = listaParaIA(candidatas);
  if (!temas.length) return { estado: "ok", modelo, clasificaciones: vacio };
  const pedir = opciones.pedir ?? fetch;
  try {
    const res = await pedir(
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
            // En los modelos 2.5, sin «pensar»: más rápido y suficiente para clasificar.
            ...(modelo.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
        signal: AbortSignal.timeout(ESPERA_MS),
      },
    );
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
  } catch (e) {
    const tiempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      estado: "error",
      modelo,
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
