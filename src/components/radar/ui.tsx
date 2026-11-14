import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { llegada, sinDatosDiscover } from "@/lib/metricas";
import type { Alerta, Estado, Prioridad } from "@/lib/types";

const nivelCls = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };

export function LlegadaTag({ a }: { a: Pick<Alerta, "entidad" | "medios_discover"> }) {
  if (sinDatosDiscover(a)) return null;
  const l = llegada(a.medios_discover);
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

export function Selector<T extends string>({ label, value, options, onChange, id }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <span className="relative inline-flex items-center">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="cursor-pointer appearance-none border-b border-input bg-transparent py-1 pr-5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-0 size-3 text-muted-foreground" />
      </span>
    </div>
  );
}
