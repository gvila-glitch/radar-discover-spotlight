import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Ayuda del panel: un aviso de primeros pasos que se puede cerrar y una leyenda desplegable.
const CLAVE = "radar_primeros_pasos_v1";
const yaVisto = (): boolean => {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
};
const marcarVisto = () => {
  try {
    window.localStorage.setItem(CLAVE, "1");
  } catch {
    /* sin almacenamiento: el aviso volverá a salir */
  }
};

export function PrimerosPasos() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!yaVisto());
  }, []);
  if (!visible) return null;
  return (
    <section aria-label="Primeros pasos" className="mt-4 border bg-card p-4 text-sm">
      <h3 className="font-semibold">Primeros pasos</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Elige una alerta de la lista.</li>
        <li>
          Mira en <span className="text-foreground">«Señal»</span> dónde se mueve el tema y en{" "}
          <span className="text-foreground">«Ángulo sugerido»</span> qué enfoque se propone.
        </li>
        <li>
          Valórala con <span className="text-foreground">Útil</span>,{" "}
          <span className="text-foreground">Ruido</span> o{" "}
          <span className="text-foreground">Publicamos</span>: así sabemos si el radar acierta.
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => {
            marcarVisto();
            setVisible(false);
          }}
        >
          Entendido
        </Button>
        <span className="text-xs text-muted-foreground">
          Tienes el detalle de cada dato en «Cómo leer este panel».
        </span>
      </div>
    </section>
  );
}

const ENTRADAS: { t: string; d: string }[] = [
  {
    t: "Prioridad",
    d: "Por puntos: suman el puesto en X (y haber entrado hace poco), el volumen en Google, el pico en Wikipedia, coincidir en varias fuentes, tener 0–2 medios en Discover y encajar con la línea editorial; restan un hashtag sin relación y tener ya 3 o más medios. Alta: 5 puntos o más, que encaje con la línea o venga de 2 fuentes o más, y que aún lleguemos a tiempo. Cada alerta enseña su desglose.",
  },
  {
    t: "Señal",
    d: "X (España): puesto y hora desde la que está en tendencia. Volumen en Google: tramo de búsquedas. Wikipedia: cuántas veces sobre su media de visitas. Discover: medios que ya lo tienen; el icono de radar junto al nombre indica que ya está en Discover.",
  },
  {
    t: "Llegada",
    d: "Puesto en el que llegaríamos a Discover: «a tiempo» si ya hay 0–2 medios, «justo» si hay 3–5 y «tarde» si hay 6 o más. Con 6 o más medios ya en Discover no se genera alerta. Si todavía no hay datos de Discover, no se muestra.",
  },
  {
    t: "Titulares en Discover",
    d: "Los titulares más recientes de los medios que ya han publicado sobre el tema (hasta tres, de medios distintos).",
  },
  {
    t: "Por qué es afín",
    d: "La regla por la que el filtro dejó pasar el tema. Por ahora el filtro es por reglas, sin IA, y el ángulo sugerido está pendiente.",
  },
  {
    t: "Valoración",
    d: "Útil: merecía el aviso. Ruido: no aportaba nada. Publicamos: acabamos haciendo una pieza (puedes añadir el enlace).",
  },
  {
    t: "Indicadores",
    d: "Alertas de hoy (objetivo 3–8), Útiles (≥ 50 % de las valoradas), Acabaron en pieza (≥ 20 % del total) y Llegada (mediana ≤ 2 medios, solo con alertas que tienen datos de Discover).",
  },
];

export function Leyenda() {
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-block cursor-pointer text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Cómo leer este panel
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-3 border bg-card p-4 sm:grid-cols-2">
        {ENTRADAS.map((e) => (
          <div key={e.t}>
            <dt className="font-semibold">{e.t}</dt>
            <dd className="mt-0.5 text-muted-foreground">{e.d}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
