import { createContext, useContext, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  mesCorto,
  nombreMes,
  textoPeriodo,
  UMBRAL_AUTORIDAD_ALTA,
  type Autoridad,
  type NivelAutoridad,
  type ResultadoAutoridad,
} from "@/lib/autoridad";

// Autoridad en Discover (datos de Search Console). La página de Alertas la pide una vez para todas sus alertas y la
// reparte con este contexto; sin datos (o sin proveedor) no se enseña nada.
const Ctx = createContext<Autoridad | null>(null);
export const AutoridadProvider = Ctx.Provider;

function useAutoridad(
  entidad: string,
): { r: ResultadoAutoridad; periodo: { desde: string; hasta: string } } | null {
  const a = useContext(Ctx);
  const r = a?.temas[entidad];
  return a?.periodo && r ? { r, periodo: a.periodo } : null;
}

const n = (x: number) => x.toLocaleString("es-ES");

export function AutoridadTag({ nivel }: { nivel: NivelAutoridad }) {
  if (nivel === "nuevo") {
    return (
      <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
        Tema nuevo para nosotros
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold",
        nivel === "alta" ? "text-ok" : "text-warn",
      )}
    >
      <span
        aria-hidden
        className={cn("inline-block size-1.5 rounded-full", nivel === "alta" ? "bg-ok" : "bg-warn")}
      />
      Autoridad {nivel}
    </span>
  );
}

/** En la lista de alertas: solo si hay autoridad (alta o media), para no llenar la lista de «tema nuevo». */
export function AutoridadLista({ entidad }: { entidad: string }) {
  const a = useAutoridad(entidad);
  if (!a || a.r.nivel === "nuevo") return null;
  return (
    <div className="mt-1">
      <AutoridadTag nivel={a.r.nivel} />
    </div>
  );
}

/** Bloque de la ficha: nivel, piezas, clics, mes de la última y las mejores piezas con su enlace. */
export function BloqueAutoridad({ entidad }: { entidad: string }) {
  const a = useAutoridad(entidad);
  const [todas, setTodas] = useState(false);
  if (!a) return null;
  const { r, periodo } = a;
  const nombre = entidad.replace(/^\[(SIN DISCOVER|PRUEBA)\]\s*/i, "");
  const visibles = todas ? r.piezas : r.piezas.slice(0, 3);
  return (
    <section className="mt-5" aria-label="Nuestra autoridad en Discover">
      <h3 className="mb-2 text-sm font-semibold">Nuestra autoridad en Discover</h3>
      {r.nivel === "nuevo" ? (
        <div className="border px-3 py-2.5 text-sm">
          <AutoridadTag nivel="nuevo" />
          <p className="mt-1 text-muted-foreground">
            Ninguna pieza nuestra sobre «{nombre}» ha tenido tráfico de Discover{" "}
            {textoPeriodo(periodo)}.
          </p>
        </div>
      ) : (
        <div className="border">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2.5 text-sm">
            <AutoridadTag nivel={r.nivel} />
            <span className="text-muted-foreground">·</span>
            <span>
              <span className="font-mono">{n(r.total)}</span> {r.total === 1 ? "pieza" : "piezas"}{" "}
              con tráfico de Discover
            </span>
            <span className="text-muted-foreground">·</span>
            <span>
              <span className="font-mono">{n(r.clics)}</span> clics
            </span>
            {r.ultimoMes && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>la última, en {nombreMes(r.ultimoMes)}</span>
              </>
            )}
          </div>
          <ul className="divide-y border-t">
            {visibles.map((p) => (
              <li key={p.url} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">
                  {p.seccion}
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={p.titulo}
                  className="inline-flex min-w-0 flex-1 items-baseline gap-1.5 text-primary underline-offset-4 hover:underline"
                >
                  <span className="truncate">{p.titulo}</span>
                  <ExternalLink aria-hidden className="size-3.5 shrink-0 self-center" />
                </a>
                <span className="shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {n(p.clics)}
                  {p.mes && ` · ${mesCorto(p.mes)}`}
                </span>
              </li>
            ))}
          </ul>
          {r.piezas.length > 3 && (
            <div className="border-t px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setTodas((t) => !t)}
                className="text-primary underline underline-offset-4"
              >
                {todas
                  ? "Ver solo las 3 mejores"
                  : r.total > r.piezas.length
                    ? `Ver las ${r.piezas.length} mejores (de ${n(r.total)})`
                    : `Ver las ${r.total} piezas`}
              </button>
            </div>
          )}
        </div>
      )}
      {r.unaPalabra && (
        <p className="mt-2 text-xs text-warn">
          «{nombre}» es una sola palabra: comprueba que las piezas hablan de la misma persona.
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Search Console · Discover · {textoPeriodo(periodo)}. Alta: {UMBRAL_AUTORIDAD_ALTA} piezas o
        más; media: 1 o 2.
      </p>
    </section>
  );
}
