// Llamadas a internet para dar contexto a las alertas. Nunca hacen fallar la creación de alertas: ante cualquier
// error o si tardan más de 3 segundos, devuelven null y la alerta se guarda con el contexto de siempre.
import {
  elegirNoticia,
  leerNoticiasGoogle,
  leerResumenWikipedia,
  textoDeBusqueda,
  type Noticia,
  type ResumenWikipedia,
} from "./contexto";

/** Identificación genérica para los servicios externos (sin nombre del proyecto ni datos personales). */
export const AGENTE = "PanelEditorial/1.0 (herramienta interna)";
const ESPERA_MS = 3000;

/** Descripción corta y primera frase del artículo en Wikipedia en español. */
export async function buscarResumenWikipedia(
  titulo: string,
  pedir: typeof fetch = fetch,
): Promise<ResumenWikipedia | null> {
  try {
    const res = await pedir(
      `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo.trim().replace(/ /g, "_"))}`,
      {
        headers: { "User-Agent": AGENTE, Accept: "application/json" },
        signal: AbortSignal.timeout(ESPERA_MS),
      },
    );
    if (!res.ok) return null;
    return leerResumenWikipedia(await res.json());
  } catch {
    return null;
  }
}

/** Último titular que habla del tema en Google Noticias (España, últimas 24 h); nada si ninguno encaja. */
export async function buscarNoticiaGoogle(
  tema: string,
  pedir: typeof fetch = fetch,
): Promise<Noticia | null> {
  const consulta = `${textoDeBusqueda(tema)} when:1d`;
  try {
    const res = await pedir(
      `https://news.google.com/rss/search?q=${encodeURIComponent(consulta)}&hl=es&gl=ES&ceid=ES:es`,
      {
        headers: { "User-Agent": AGENTE, Accept: "application/rss+xml, application/xml" },
        signal: AbortSignal.timeout(ESPERA_MS),
      },
    );
    if (!res.ok) return null;
    return elegirNoticia(leerNoticiasGoogle((await res.text()).slice(0, 500_000)), tema);
  } catch {
    return null;
  }
}
