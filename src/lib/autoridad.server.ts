// Lectura de la tabla autoridad_discover (solo servidor). Solo la lee el equipo (RLS con es_equipo());
// la usa src/lib/autoridad.functions.ts después de comprobar que quien pregunta es del equipo.
// La tabla se carga a mano en el editor de SQL (ver supabase/autoridad-discover.sql) y todavía no está en los tipos
// generados de Supabase, por eso aquí se describe solo lo que se usa.
import type { FilaAutoridad } from "./autoridad";

export const TABLA_AUTORIDAD = "autoridad_discover";
const POR_PAGINA = 1000; // lo máximo que devuelve Supabase en cada petición
const MAX_FILAS = 20_000; // unos 20 meses de exportaciones mensuales

type Respuesta = PromiseLike<{ data: unknown[] | null; error: unknown }>;
export type LectorAutoridad = {
  from: (tabla: string) => {
    select: (columnas: string) => {
      order: (
        columna: string,
        opciones: { ascending: boolean },
      ) => { range: (desde: number, hasta: number) => Respuesta };
    };
  };
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function filaValida(x: unknown): FilaAutoridad | null {
  if (!x || typeof x !== "object") return null;
  const { url, clics, desde, hasta } = x as {
    url?: unknown;
    clics?: unknown;
    desde?: unknown;
    hasta?: unknown;
  };
  const n = Number(clics);
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  if (clics === null || clics === "" || !Number.isFinite(n) || n < 0) return null;
  if (
    typeof desde !== "string" ||
    typeof hasta !== "string" ||
    !FECHA.test(desde) ||
    !FECHA.test(hasta)
  )
    return null;
  return { url, clics: n, desde, hasta };
}

/** Todas las filas, de mil en mil. Si falla la lectura, lanza un error (el panel no enseña el bloque). */
export async function leerFilasAutoridad(db: LectorAutoridad): Promise<FilaAutoridad[]> {
  const filas: FilaAutoridad[] = [];
  for (let desde = 0; desde < MAX_FILAS; desde += POR_PAGINA) {
    const { data, error } = await db
      .from(TABLA_AUTORIDAD)
      .select("url, clics, desde, hasta")
      .order("id", { ascending: true })
      .range(desde, desde + POR_PAGINA - 1);
    if (error) throw new Error("No se pudo leer la autoridad en Discover.");
    for (const x of data ?? []) {
      const f = filaValida(x);
      if (f) filas.push(f);
    }
    if (!data || data.length < POR_PAGINA) break;
  }
  return filas;
}
