import { createContext, useContext, useState } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { BloqueFicha, Etiqueta, Pliegue } from "./ui";
import {
  mesCorto,
  nombreMes,
  textoPeriodo,
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

/** Etiqueta de la cabecera de la ficha: «Autoridad alta · 6 piezas» o «Tema nuevo para nosotros». Sin datos, nada. */
export function EtiquetaAutoridad({ entidad }: { entidad: string }) {
  const a = useAutoridad(entidad);
  if (!a) return null;
  const { nivel, total } = a.r;
  if (nivel === "nuevo") {
    return <Etiqueta punto="bg-muted-foreground/40">Tema nuevo para nosotros</Etiqueta>;
  }
  return (
    <Etiqueta punto={nivel === "alta" ? "bg-ok" : "bg-warn"}>
      Autoridad {nivel} · {n(total)} {total === 1 ? "pieza" : "piezas"}
    </Etiqueta>
  );
}

/**
 * Bloque «Nuestras piezas en Discover» de la ficha: la mejor pieza con su enlace y, plegadas, las demás. El nivel va
 * en la etiqueta de la cabecera; los umbrales, en «Cómo leer este panel».
 */
export function BloqueAutoridad({ entidad }: { entidad: string }) {
  const a = useAutoridad(entidad);
  const [todas, setTodas] = useState(false);
  if (!a) return null;
  const { r, periodo } = a;
  const nombre = entidad.replace(/^\[(SIN DISCOVER|PRUEBA)\]\s*/i, "");
  const visibles = todas ? r.piezas : r.piezas.slice(0, 1);
  const resumen = [
    `${n(r.clics)} clics en total`,
    r.ultimoMes && `la última, en ${nombreMes(r.ultimoMes)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <BloqueFicha
      titulo="Nuestras piezas en Discover"
      derecha={`Search Console · ${textoPeriodo(periodo)}`}
    >
      {r.nivel === "nuevo" ? (
        <p className="text-sm text-muted-foreground">
          Ninguna pieza nuestra sobre «{nombre}» ha tenido tráfico de Discover en estas fechas.
        </p>
      ) : (
        <>
          <ul>
            {visibles.map((p) => (
              <li key={p.url} className="flex items-baseline gap-3 py-1.5 text-sm">
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
          {r.piezas.length > 1 && (
            <Pliegue
              abierto={todas}
              onCambio={() => setTodas((t) => !t)}
              abrir={
                r.total > r.piezas.length
                  ? `Ver las ${r.piezas.length} mejores (de ${n(r.total)})`
                  : `Ver las ${r.total} piezas`
              }
              cerrar="Ver solo la mejor"
              resumen={resumen}
            />
          )}
        </>
      )}
      {r.unaPalabra && (
        <p className="mt-2 text-xs text-warn">
          «{nombre}» es una sola palabra: comprueba que las piezas hablan de la misma persona.
        </p>
      )}
    </BloqueFicha>
  );
}
