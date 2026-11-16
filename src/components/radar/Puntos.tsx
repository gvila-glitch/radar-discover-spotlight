import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Puntuacion } from "@/lib/prioridad";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const palabra = (n: number) => `${n} ${Math.abs(n) === 1 ? "punto" : "puntos"}`;

/**
 * «5 puntos ⓘ»: el total siempre a la vista y el desglose en un recuadro. Se abre al pasar el ratón (y se cierra al
 * salir), al pulsar (móvil y tableta, donde no se puede pasar por encima) y con el teclado; Esc lo cierra. Si se abrió
 * pasando el ratón, pulsar lo deja fijo.
 */
export function DesglosePuntos({
  p,
  titulo,
  nota,
}: {
  p: Puntuacion;
  /** Encabezado del recuadro, p. ej. «Prioridad por puntos». */
  titulo: string;
  /** Frase al pie: la regla que se aplica con esos puntos. */
  nota?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const porRaton = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(espera.current), []);
  const entrar = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(espera.current);
    if (!abierto) {
      porRaton.current = true;
      setAbierto(true);
    }
  };
  const salir = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !porRaton.current) return;
    espera.current = setTimeout(() => setAbierto(false), 150);
  };
  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) porRaton.current = false;
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${palabra(p.puntos)}: ver el desglose`}
          onPointerEnter={entrar}
          onPointerLeave={salir}
          onClick={(e) => {
            // Abierto al pasar el ratón: el clic lo deja fijo en vez de cerrarlo.
            if (abierto && porRaton.current) {
              e.preventDefault();
              porRaton.current = false;
              clearTimeout(espera.current);
            }
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground underline decoration-dotted underline-offset-[3px] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            abierto && "bg-muted text-foreground",
          )}
        >
          {palabra(p.puntos)} <Info aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[340px] max-w-[calc(100vw_-_2rem)] bg-card text-sm"
        onPointerEnter={entrar}
        onPointerLeave={salir}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{titulo}</span>
          <span className="font-mono text-xs text-muted-foreground">{palabra(p.puntos)}</span>
        </div>
        <table className="mt-2 w-full">
          <tbody>
            {p.partes.length ? (
              p.partes.map((x) => (
                <tr key={x.texto} className="border-t">
                  <td className="py-1.5 pr-3">{mayuscula(x.texto)}</td>
                  <td
                    className={cn(
                      "py-1.5 text-right font-mono",
                      x.puntos > 0 ? "text-ok" : "text-bad",
                    )}
                  >
                    {x.puntos > 0 ? "+" : "−"}
                    {Math.abs(x.puntos)}
                  </td>
                </tr>
              ))
            ) : (
              <tr className="border-t">
                <td className="py-1.5 text-muted-foreground" colSpan={2}>
                  Nada suma ni resta puntos.
                </td>
              </tr>
            )}
            <tr className="border-t border-foreground/60">
              <td className="py-1.5 pr-3 font-semibold">Total</td>
              <td className="py-1.5 text-right font-mono font-semibold">{p.puntos}</td>
            </tr>
          </tbody>
        </table>
        {nota && <p className="mt-2 text-xs text-muted-foreground">{nota}</p>}
      </PopoverContent>
    </Popover>
  );
}
