import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePopoverAlPasar } from "./usePopoverAlPasar";

/**
 * «ⓘ» junto a una etiqueta o un título: al pasar el ratón o pulsarla, una o dos frases que explican qué es. Sustituye
 * a los párrafos largos de «Cómo leer este panel»: cada explicación está junto a lo que explica.
 */
export function InfoAyuda({
  tema,
  children,
  className,
}: {
  /** De qué es la ayuda, para lectores de pantalla («Qué es: Por qué ahora»). */
  tema: string;
  children: ReactNode;
  className?: string;
}) {
  const p = usePopoverAlPasar();
  return (
    <Popover open={p.abierto} onOpenChange={p.onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Qué es: ${tema}`}
          onPointerEnter={p.entrar}
          onPointerLeave={p.salir}
          onClick={p.alPulsar}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            p.abierto && "text-foreground",
            className,
          )}
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[300px] max-w-[calc(100vw_-_2rem)] bg-card text-sm font-normal"
        onPointerEnter={p.entrar}
        onPointerLeave={p.salir}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
