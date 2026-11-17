import { Radar } from "lucide-react";
import { horaOFecha } from "@/lib/fechas";
import { nombreVisible } from "@/lib/metricas";
import type { Alerta } from "@/lib/types";
import { EstadoTag, LlegadaTag, PrioridadTag } from "./ui";
import { AutoridadLista } from "./Autoridad";

/** Contenido de una fila de alerta (hora, nombre, contexto y etiquetas). Se usa en «Alertas» y en «Todas». */
export function ContenidoAlerta({ a }: { a: Alerta }) {
  const medios = `En Discover: ${a.medios_discover} ${a.medios_discover === 1 ? "medio" : "medios"}`;
  return (
    <>
      <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
        {horaOFecha(a.creada_en)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-semibold tracking-tight">
          <span className="truncate">{nombreVisible(a.entidad)}</span>
          {a.medios_discover > 0 && (
            <Radar aria-label={medios} className="size-3.5 shrink-0 text-primary">
              <title>{medios}</title>
            </Radar>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.contexto}</p>
        <AutoridadLista entidad={a.entidad} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PrioridadTag p={a.prioridad} />
        <LlegadaTag a={a} />
        <EstadoTag e={a.estado} />
      </div>
    </>
  );
}
