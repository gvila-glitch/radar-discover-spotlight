import { cn } from "@/lib/utils";
import { llegada } from "@/lib/metricas";
import type { Estado, Prioridad } from "@/lib/types";

const nivelCls = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" };

export function LlegadaTag({ medios }: { medios: number }) {
  const l = llegada(medios);
  return <span className={cn("rounded px-1.5 py-0.5 font-mono text-xs font-medium whitespace-nowrap", nivelCls[l.nivel])}>{l.label}</span>;
}

export function PrioridadTag({ p }: { p: Prioridad }) {
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
      p === "alta" ? "border-primary text-primary" : "border-border text-muted-foreground")}>
      {p}
    </span>
  );
}

export const ESTADO_LABEL: Record<Estado, string> = { pendiente: "Pendiente", util: "Útil", ruido: "Ruido", publicada: "Publicada" };

export function EstadoTag({ e }: { e: Estado }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs whitespace-nowrap",
      e === "pendiente" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground")}>
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
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border bg-card p-0.5">
        {options.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn("rounded px-2.5 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              value === o.value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
