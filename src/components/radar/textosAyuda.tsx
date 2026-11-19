import { HORAS_SEGUIMIENTO } from "@/lib/metricas";
import { Etiqueta } from "./ui";

// Textos de las ⓘ de Alertas, todos aquí para revisarlos de una vez. Una o dos frases; si hay escala, con sus colores.

export function AyudaMedios() {
  return (
    <>
      <p>
        <b>Medios que ya están en Discover</b> con este tema, sin contarnos.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Etiqueta punto="bg-ok">0–2 · a tiempo</Etiqueta>
        <Etiqueta punto="bg-warn">3–5 · justo</Etiqueta>
        <Etiqueta punto="bg-bad">6 o más · tarde</Etiqueta>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Se mide en las {HORAS_SEGUIMIENTO} h siguientes al aviso.
      </p>
    </>
  );
}

export function AyudaAutoridad() {
  return (
    <>
      <p>
        <b>Piezas nuestras con tráfico de Discover</b> sobre el tema, según Search Console.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Etiqueta punto="bg-ok">3 o más · alta</Etiqueta>
        <Etiqueta punto="bg-warn">1–2 · media</Etiqueta>
        <Etiqueta punto="bg-muted-foreground/40">ninguna · tema nuevo</Etiqueta>
      </div>
    </>
  );
}

export const AYUDA_INTERESA =
  "Lo decide la IA con el perfil editorial de Configuración. Si la IA no responde, deciden las reglas.";
export const AYUDA_POR_QUE_AHORA =
  "Dónde sube el tema ahora: X, Google y Wikipedia. En gris, las fuentes sin señal.";
export const AYUDA_COMPETENCIA =
  "Medios que ya están en Discover con el tema y sus titulares, según Discover Snoop.";
export const AYUDA_HISTORIAL =
  "Piezas nuestras de antes sobre el tema, con su tráfico de Discover. No son resultado de esta alerta.";
export const AYUDA_KPI_MEDIOS =
  "Lo grande que se hizo el tema: la mediana de medios en Discover en las 24 h tras cada aviso. No dice si avisamos antes; por eso no tiene objetivo.";

export function AyudaValoracion() {
  return (
    <>
      <ul className="space-y-1">
        <li>
          <b>Sí, útil:</b> merecía el aviso.
        </li>
        <li>
          <b>No, es ruido:</b> no aportaba. Sale de la lista; la verás en Estado › Ruido.
        </li>
        <li>
          <b>La publicamos:</b> hicimos pieza.
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Así medimos si el radar acierta.</p>
    </>
  );
}
