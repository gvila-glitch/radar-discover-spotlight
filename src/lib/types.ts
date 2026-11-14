export type Prioridad = "alta" | "media";
export type Estado = "pendiente" | "util" | "ruido" | "publicada";
export interface Alerta {
  id: number;
  creada_en: string;
  entidad: string;
  contexto: string;
  prioridad: Prioridad;
  x_posicion: number | null;
  x_desde: string | null;
  trends_activo: boolean;
  trends_crecimiento: string | null;
  wikipedia_visitas?: number | null;
  wikipedia_ratio?: number | null;
  medios_discover: number;
  medios_lista: string[];
  titulares_seo: { medio: string; titular: string }[];
  angulo: string;
  seccion_sugerida: string;
  motivo_afinidad: string;
  estado: Estado;
  pieza_url: string | null;
  estado_actualizado_en: string | null;
  estado_por: string | null;
}
export type CambiosValoracion = Pick<Alerta, "estado" | "pieza_url" | "estado_actualizado_en" | "estado_por">;
