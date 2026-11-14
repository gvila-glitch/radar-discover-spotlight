export const APARTADOS = [
  { id: "perfil", label: "Perfil editorial" },
  { id: "ambito", label: "Ámbito y excepciones" },
  { id: "limites", label: "Límites y umbrales" },
  { id: "medios", label: "Medios de referencia" },
  { id: "usuarios", label: "Usuarios" },
] as const;
export type Apartado = (typeof APARTADOS)[number]["id"];
export function apartadoValido(v: unknown): Apartado {
  return APARTADOS.some((a) => a.id === v) ? (v as Apartado) : "perfil";
}
