import { Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { horaOFecha } from "@/lib/fechas";
import { llegada, nombreVisible } from "@/lib/metricas";
import type { Alerta } from "@/lib/types";
import { EstadoTag, LlegadaTag, PrioridadTag } from "./ui";
import { AutoridadLista } from "./Autoridad";

/**
 * Contenido de una fila de alerta (hora, nombre y etiquetas; el contexto va en la ficha). Se usa en «Alertas» y en «Todas».
 * Como en el correo sin leer: las pendientes, con el nombre en negrita; las ya valoradas, en letra normal y gris.
 * La llegada («4.º · justo», «7.º · tarde») solo sale cuando avisa de algo: «a tiempo» es lo normal y no se repite.
 */
export function ContenidoAlerta({ a }: { a: Alerta }) {
  const medios = `En Discover: ${a.medios_discover} ${a.medios_discover === 1 ? "medio" : "medios"}`;
  const pendiente = a.estado === "pendiente";
  return (
    <>
      <span className="w-12 shrink-0 pt-0.5 tabular-nums text-xs text-muted-foreground">
        {horaOFecha(a.creada_en)}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "flex items-center gap-1.5 tracking-tight",
            pendiente ? "font-semibold" : "font-normal text-foreground/70",
          )}
        >
          <span className="truncate">{nombreVisible(a.entidad)}</span>
          {a.medios_discover > 0 && (
            <Radar aria-label={medios} className="size-3.5 shrink-0 text-primary">
              <title>{medios}</title>
            </Radar>
          )}
        </div>
        <AutoridadLista entidad={a.entidad} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PrioridadTag p={a.prioridad} />
        {llegada(a.medios_discover).nivel !== "ok" && <LlegadaTag a={a} />}
        <EstadoTag e={a.estado} />
      </div>
    </>
  );
}
