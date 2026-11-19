import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";

// Ayuda de Alertas: «¿Cómo se usa?» abre los primeros pasos (salen solos la primera vez). Lo demás se explica en las ⓘ
// de cada etiqueta y bloque, junto a lo que explican (ver textosAyuda.tsx). Cuándo salen: usePrimerosPasos.ts.

export function EnlaceComoSeUsa({
  abiertos,
  onPulsar,
}: {
  abiertos: boolean;
  onPulsar: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={abiertos}
      onClick={onPulsar}
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Info aria-hidden className="size-4" />
      ¿Cómo se usa?
    </button>
  );
}

export function PrimerosPasos({ onCerrar }: { onCerrar: () => void }) {
  return (
    <section aria-label="Primeros pasos" className="mt-4 border bg-card p-4 text-sm">
      <h3 className="font-semibold">Primeros pasos</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Elige una alerta de la lista.</li>
        <li>
          Mira la cabecera de la ficha y <span className="text-foreground">«Por qué ahora»</span>.
          Si dudas de algo, pasa el ratón por su{" "}
          <Info aria-hidden className="inline size-3.5 align-[-2px]" />.
        </li>
        <li>
          Contesta <span className="text-foreground">«¿Te sirve esta alerta?»</span>. Para quitar
          una de la lista sin abrirla, pulsa <span className="text-foreground">Es ruido</span> al
          pasar el ratón por la fila, o la tecla <span className="text-foreground">R</span>.
        </li>
      </ol>
      <Button size="sm" className="mt-3" onClick={onCerrar}>
        Entendido
      </Button>
    </section>
  );
}
