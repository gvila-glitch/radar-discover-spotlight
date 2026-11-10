import { cn } from "@/lib/utils";
import { llegada } from "@/lib/metricas";
import type { Estado, Prioridad } from "@/lib/types";

const nivelCls = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };

export function LlegadaTag({ medios }: { medios: number }) {
  const l = llegada(medios);
  return <span className={cn("font-mono text-xs whitespace-nowrap", nivelCls[l.nivel])}>{l.label}</span>;
}

export function PrioridadTag({ p }: { p: Prioridad }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", p === "alta" ? "font-semibold text-foreground" : "text-muted-foreground")}>
      <span aria-hidden className={cn("inline-block size-1.5 rounded-full", p === "alta" ? "bg-primary" : "bg-muted-foreground/40")} />
      {p === "alta" ? "Alta" : "Media"}
    </span>
  );
}

export const ESTADO_LABEL: Record<Estado, string> = { pendiente: "Pendiente", util: "Útil", ruido: "Ruido", publicada: "Publicada" };

export function EstadoTag({ e }: { e: Estado }) {
  return (
    <span className={cn("text-xs whitespace-nowrap", e === "pendiente" ? "text-muted-foreground italic" : "text-foreground")}>
      {ESTADO_LABEL[e]}
    </span>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-3 border-b">
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn("-mb-px border-b-2 pb-1 text-sm focus-visible:outline-2 focus-visible:outline-ring",
              value === o.value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
