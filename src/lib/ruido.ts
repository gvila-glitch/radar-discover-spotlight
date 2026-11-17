// Motivo del ruido y «lo que no cubrimos». Lógica pura, para probarla aparte.
// Solo «no es nuestro tema» es un fallo del filtro editorial (la IA); los demás motivos son de otras partes del radar,
// así que solo ese ofrece añadir algo a Configuración.

export const MOTIVOS_RUIDO = [
  { id: "no_es_tema", label: "No es nuestro tema" },
  { id: "tarde", label: "Llegamos tarde" },
  { id: "ya_lo_teniamos", label: "Ya lo teníamos" },
  { id: "nombre_confundido", label: "Nombre confundido" },
] as const;
export type MotivoRuido = (typeof MOTIVOS_RUIDO)[number]["id"];

export const motivoValido = (v: unknown): MotivoRuido | null =>
  MOTIVOS_RUIDO.some((m) => m.id === v) ? (v as MotivoRuido) : null;

/** Texto que se propone para las excepciones de la IA; el administrador lo completa antes de guardarlo. */
export const sugerenciaNoCubrimos = (tema: string) =>
  `No cubrimos temas como «${tema.trim()}»: explica aquí por qué no nos interesan.`.slice(0, 300);
