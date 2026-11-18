import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ComoLeer } from "./ui";

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
          Mira en la cabecera de la ficha la prioridad, si llegamos a tiempo y por qué nos interesa,
          y en <span className="text-foreground">«Por qué ahora»</span> dónde se mueve el tema.
        </li>
        <li>
          Contesta «¿Te sirve esta alerta?» con <span className="text-foreground">Sí, útil</span>,{" "}
          <span className="text-foreground">No, es ruido</span> o{" "}
          <span className="text-foreground">La publicamos</span>: así sabemos si el radar acierta.
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
    d: "Por puntos: suman el puesto en X (y haber entrado hace poco), el volumen en Google, el pico en Wikipedia, coincidir en varias fuentes, tener 0–2 medios en Discover y encajar con la línea editorial; restan un hashtag sin relación y tener ya 3 o más medios. Alta: 5 puntos o más, que encaje con la línea o venga de 2 fuentes o más, y que aún lleguemos a tiempo. En la ficha de cada alerta, pasa el ratón por encima de «N puntos» (o púlsalo) para ver el desglose.",
  },
  {
    t: "Por qué ahora",
    d: "El titular del que se habla y cada fuente con señal: puesto en X y hora desde la que está en tendencia, tramo de búsquedas en Google y visitas en Wikipedia (cuántas veces sobre su media). Debajo, en gris, las fuentes sin señal. En la lista, el icono de radar junto al nombre indica que el tema ya está en Discover.",
  },
  {
    t: "Llegada",
    d: "En la lista, puesto en el que llegaríamos a Discover: «a tiempo» si ya hay 0–2 medios, «justo» si hay 3–5 y «tarde» si hay 6 o más. En la ficha se dice en palabras («2 medios en Discover · vas a tiempo»). Con 6 o más medios ya en Discover no se genera alerta. Si todavía no hay datos de Discover, se indica. Se mide durante las 24 horas siguientes a la alerta; pasado ese plazo, la ficha lo dice y las cifras ya no cambian.",
  },
  {
    t: "Autoridad",
    d: "Cuántas piezas nuestras sobre ese tema han tenido tráfico de Discover, según Search Console: alta con 3 o más, media con 1 o 2, y «tema nuevo para nosotros» si no hay ninguna (puede ser una oportunidad). En «Nuestro historial en Discover» sale la mejor con su enlace y, al pulsar, las demás: son piezas anteriores, no lo conseguido con la alerta. Los datos se cargan a mano cada mes; junto al título del bloque se ve de qué fechas es el tráfico.",
  },
  {
    t: "Competencia en Discover",
    d: "Los medios que ya están en Discover con el tema y sus titulares más recientes (hasta tres, de medios distintos). Se ven los dos primeros; el resto, al pulsar «Ver N medios más».",
  },
  {
    t: "Por qué nos interesa",
    d: "La frase bajo las etiquetas de la ficha: por qué el filtro dejó pasar el tema y qué sección se sugiere. Lo decide una IA (Gemini) con el perfil editorial de Configuración: «Encaja mucho» o «Puede encajar según el enfoque»; lo que ve fuera de línea no llega a ser alerta. Si la IA no responde, decide el filtro por reglas. El ángulo sugerido se enseñará cuando la IA lo escriba.",
  },
  {
    t: "Valoración",
    d: "«Sí, útil»: merecía el aviso. «No, es ruido»: no aportaba nada; la alerta no se borra, sigue en la lista y cuenta para medir el radar (para no verlas, Estado «Todos menos ruido»). «La publicamos»: acabamos haciendo una pieza (puedes añadir el enlace). Se puede cambiar cuando quieras. Tras «No, es ruido» puedes decir por qué (no es nuestro tema, llegamos tarde, ya lo teníamos o nombre confundido); si no es nuestro tema, un administrador puede añadirlo a lo que no cubrimos para que la IA lo tenga en cuenta desde la próxima tanda.",
  },
  {
    t: "Indicadores",
    d: "Alertas de hoy (objetivo 3–8), Útiles (≥ 50 % de las valoradas), Acabaron en pieza (≥ 20 % del total) y Medios en Discover: la mediana de medios que publicaron el tema en Discover en las 24 horas siguientes a cada aviso (solo alertas con datos de Discover). Dice lo grande que se hizo el tema, no si avisamos antes, así que no tiene objetivo. Útiles, Acabaron en pieza y Medios en Discover usan siempre los últimos 7 días, aunque la lista enseñe otro periodo.",
  },
];

export function Leyenda() {
  return (
    <ComoLeer titulo="Cómo leer este panel">
      <dl className="mt-3 grid gap-x-6 gap-y-3 border bg-card p-4 sm:grid-cols-2">
        {ENTRADAS.map((e) => (
          <div key={e.t}>
            <dt className="font-semibold">{e.t}</dt>
            <dd className="mt-0.5 text-muted-foreground">{e.d}</dd>
          </div>
        ))}
      </dl>
    </ComoLeer>
  );
}
