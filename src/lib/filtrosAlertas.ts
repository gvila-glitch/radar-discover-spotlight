// Filtros de la lista de Alertas que no son un simple «igual a»: estado sin ruido, fuente y autoridad en Discover.
// Lógica pura, para probarla aparte de la página.
import type { Alerta, Estado } from "./types";
import type { NivelAutoridad } from "./autoridad";

export type FiltroEstado = "todos" | "sin_ruido" | Estado;
export const OPCIONES_ESTADO: { value: FiltroEstado; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "sin_ruido", label: "Todos menos ruido" },
  { value: "pendiente", label: "Pendiente" },
  { value: "util", label: "Útil" },
  { value: "ruido", label: "Ruido" },
  { value: "publicada", label: "Publicada" },
];
export const pasaEstado = (e: Estado, f: FiltroEstado) =>
  f === "todos" || (f === "sin_ruido" ? e !== "ruido" : e === f);

export type Fuente = "x" | "google" | "wikipedia";
/** Fuentes con señal de una alerta (una alerta combinada puede tener varias). */
export function fuentesDe(
  a: Pick<Alerta, "x_posicion" | "trends_activo" | "trends_crecimiento" | "wikipedia_ratio">,
): Fuente[] {
  const f: Fuente[] = [];
  if (a.x_posicion) f.push("x");
  if (a.trends_activo && a.trends_crecimiento) f.push("google");
  if (a.wikipedia_ratio) f.push("wikipedia");
  return f;
}

export type FiltroFuente = "todas" | Fuente | "varias";
export const OPCIONES_FUENTE: { value: FiltroFuente; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "x", label: "X" },
  { value: "google", label: "Google" },
  { value: "wikipedia", label: "Wikipedia" },
  { value: "varias", label: "Varias fuentes" },
];
/** «X» es «tiene señal en X» (sola o con otras); «Varias fuentes», dos o más. */
export function pasaFuente(a: Parameters<typeof fuentesDe>[0], f: FiltroFuente): boolean {
  if (f === "todas") return true;
  const fuentes = fuentesDe(a);
  return f === "varias" ? fuentes.length >= 2 : fuentes.includes(f);
}

export type FiltroAutoridad = "todas" | "con" | "alta" | "nuevo";
export const OPCIONES_AUTORIDAD: { value: FiltroAutoridad; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "con", label: "Con autoridad (alta o media)" },
  { value: "alta", label: "Solo alta" },
  { value: "nuevo", label: "Tema nuevo" },
];
/** Sin nivel (nombre que no sirve para buscar o sin datos) solo pasa con «Todas». */
export function pasaAutoridad(nivel: NivelAutoridad | undefined, f: FiltroAutoridad): boolean {
  if (f === "todas") return true;
  if (!nivel) return false;
  if (f === "con") return nivel === "alta" || nivel === "media";
  return nivel === f;
}
