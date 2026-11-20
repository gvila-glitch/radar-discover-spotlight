import { ChevronDown, Info, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { llegada, sinDatosDiscover } from "@/lib/metricas";
import { InfoAyuda } from "./InfoAyuda";
import type { Alerta, Estado, Prioridad } from "@/lib/types";

const nivelCls = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };

export function LlegadaTag({ a }: { a: Pick<Alerta, "entidad" | "medios_discover"> }) {
  if (sinDatosDiscover(a)) return null;
  const l = llegada(a.medios_discover);
  const ya = a.medios_discover === 1 ? "Ya hay 1 medio" : `Ya hay ${a.medios_discover} medios`;
  return <span title={`${ya} en Discover: llegaríamos los ${l.puesto}.º`} className={cn("tabular-nums text-xs whitespace-nowrap", nivelCls[l.nivel])}>{l.label}</span>;
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

/** «Pendiente» en azul (lo que falta por hacer destaca); lo ya valorado, en gris. */
export function EstadoTag({ e }: { e: Estado }) {
  return (
    <span className={cn("text-xs whitespace-nowrap", e === "pendiente" ? "font-medium text-primary" : "text-muted-foreground")}>
      {ESTADO_LABEL[e]}
    </span>
  );
}

/** Desplegable de filtro. El foco se marca con la línea de debajo en azul (no con un recuadro: Chrome lo deja visible
 * también después de elegir con el ratón y parecía un fallo). */
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
          className="cursor-pointer appearance-none border-b border-input bg-transparent py-1 pr-5 text-sm text-foreground focus:outline-none focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--primary)]"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-0 size-3 text-muted-foreground" />
      </span>
    </div>
  );
}

/** Etiqueta redonda de la cabecera de la ficha: un punto de color y el texto («Prioridad alta · 12 puntos»). */
export function Etiqueta({ punto, children }: { punto: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
      <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", punto)} />
      {children}
    </span>
  );
}

/**
 * Bloque de la ficha: icono azul y título, un dato opcional a la derecha y el contenido. La línea de arriba es la única
 * que separa bloques (dentro, las filas van sin líneas) y hay más aire entre bloques que dentro de ellos.
 */
export function BloqueFicha({ titulo, icono: Icono, derecha, ayuda, children }: { titulo: string; icono?: LucideIcon; derecha?: ReactNode; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="border-t px-6 py-5.5">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[15px] font-semibold leading-snug">
          {Icono && <Icono aria-hidden strokeWidth={2.25} className="mr-2 inline-block size-[18px] align-[-3px] text-primary" />}
          {titulo}
        </h3>
        {ayuda && <InfoAyuda tema={titulo} className="self-center">{ayuda}</InfoAyuda>}
        {derecha && <span className="ml-auto text-xs text-muted-foreground">{derecha}</span>}
      </div>
      {children}
    </section>
  );
}

/** «⌄ Ver las 22 piezas · 683.563 clics en total»: abre y cierra una parte plegada. Cerrada, dice qué hay dentro. */
export function Pliegue({ abierto, onCambio, abrir, cerrar, resumen }: {
  abierto: boolean; onCambio: () => void; abrir: string; cerrar: string; resumen?: string;
}) {
  return (
    <button type="button" aria-expanded={abierto} onClick={onCambio}
      className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring">
      <ChevronDown aria-hidden className={cn("size-3.5 shrink-0 text-primary transition-transform", abierto && "rotate-180")} />
      <span className="font-medium text-primary underline-offset-4 hover:underline">{abierto ? cerrar : abrir}</span>
      {!abierto && resumen && <span className="text-muted-foreground">· {resumen}</span>}
    </button>
  );
}

/** «ⓘ Cómo leer… ⌄»: desplegable de ayuda. La ⓘ dice que hay una explicación y la flecha, que se despliega (gira al abrirlo). */
export function ComoLeer({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group mt-2 text-sm">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <Info aria-hidden className="size-4 shrink-0" />
        <span>{titulo}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
