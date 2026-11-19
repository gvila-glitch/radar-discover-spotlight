import { useState } from "react";
import { cn } from "@/lib/utils";
import { MOTIVOS_RUIDO, type MotivoRuido } from "@/lib/ruido";

export type PropsAvisoRuido = {
  nombre: string;
  /** Con el filtro de Estado por defecto («Todos menos ruido»), la alerta deja de verse. */
  saleDeLista: boolean;
  onDeshacer: () => void;
  onMotivo: (m: MotivoRuido | null) => void;
};

/** Aviso tras marcar una alerta como ruido: «Deshacer» y, si se quiere, por qué (un clic; otro clic lo quita). */
export function AvisoRuido({ nombre, saleDeLista, onDeshacer, onMotivo }: PropsAvisoRuido) {
  const [motivo, setMotivo] = useState<MotivoRuido | null>(null);
  return (
    <div
      role="status"
      className="w-[380px] max-w-[calc(100vw_-_2rem)] rounded-lg border bg-card p-4 text-sm text-foreground shadow-lg"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1">
          <b>«{nombre}»</b> marcada como ruido.{saleDeLista && " Ya no sale en la lista."}
        </p>
        <button
          type="button"
          onClick={onDeshacer}
          className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          Deshacer
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">¿Por qué? (opcional, un clic)</p>
      <div role="group" aria-label="Por qué es ruido" className="mt-1.5 flex flex-wrap gap-1.5">
        {MOTIVOS_RUIDO.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={motivo === m.id}
            onClick={() => {
              const nuevo = motivo === m.id ? null : m.id;
              setMotivo(nuevo);
              onMotivo(nuevo);
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring",
              motivo === m.id
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {saleDeLista && (
        <p className="mt-3 text-xs text-muted-foreground">Para volver a verla: Estado › Ruido.</p>
      )}
    </div>
  );
}
