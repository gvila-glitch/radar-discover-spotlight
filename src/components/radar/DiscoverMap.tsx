import { Link } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { horaOFecha } from "@/lib/fechas";
import type { GrupoMapa, TemaMapa } from "@/lib/discoverMap";
import { ANCHO_FILA, colocarBurbujas } from "@/lib/discoverMapLayout";

// Tinte de cada grupo. Se mezcla con el color de las tarjetas, así funciona igual en modo claro y oscuro.
const TONOS = [250, 300, 150, 200, 70, 350];
const tono = (indice: number, otros: boolean, pct: number) =>
  otros
    ? `color-mix(in oklab, var(--muted-foreground) ${Math.round(pct * 0.6)}%, var(--card))`
    : `color-mix(in oklab, oklch(0.65 0.12 ${TONOS[indice % TONOS.length]}) ${pct}%, var(--card))`;
const TEXTO = { fill: "var(--foreground)" } as const;
const SUAVE = { fill: "var(--muted-foreground)" } as const;
const MONO = "var(--font-mono, ui-monospace, monospace)";

const describir = (t: TemaMapa) =>
  `${t.nombre}: ${t.medios} medios` +
  (t.subiendo ? `, sube ${t.mediosUltimaHora} en la última hora` : "") +
  (t.hayAlerta ? ", ya tiene alerta en el radar" : "");

/** Mapa de burbujas: tamaño = medios que lo publican; los temas que salen juntos en titulares van en el mismo círculo. */
/** Ancho real del contenedor (en saltos de 40 px para no recolocar el mapa por cada píxel). */
function useAncho(inicial: number | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState<number | null>(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([e]) => {
      if (e) setAncho(Math.floor(e.contentRect.width / 40) * 40);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho] as const;
}

export function MapaDiscover({
  grupos,
  seleccion,
  onSeleccion,
  onFondo,
  anchoInicial = null,
}: {
  grupos: GrupoMapa[];
  seleccion: string | undefined;
  onSeleccion: (id: string) => void;
  /** Al pulsar en una zona vacía del mapa (sirve para cerrar la ficha). */
  onFondo?: () => void;
  /** Ancho a usar antes de poder medir (vistas previas y pruebas). */
  anchoInicial?: number | null;
}) {
  const [contenedor, ancho] = useAncho(anchoInicial);
  // Las filas se reparten con el ancho real disponible: así el texto sale a su tamaño en cualquier pantalla.
  const mapa = useMemo(
    () => colocarBurbujas(grupos, ancho ? Math.max(300, ancho - 20) : ANCHO_FILA),
    [grupos, ancho],
  );
  const [enfocada, setEnfocada] = useState<string | null>(null);
  const otrosDe = new Map(mapa.grupos.map((g) => [g.indice, g.otros]));
  const teclas = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSeleccion(id);
    }
  };
  return (
    <div ref={contenedor}>
      <svg
        viewBox={mapa.caja.join(" ")}
        className="mx-auto block h-auto w-full"
        style={{ maxWidth: mapa.caja[2] }}
        role="group"
        aria-label="Mapa de temas en Discover"
        onClick={(e) => {
          if (!(e.target as Element).closest("[data-tema]")) onFondo?.();
        }}
      >
        {mapa.grupos.map((g) => (
          <g key={g.id}>
            <circle
              cx={g.x}
              cy={g.y}
              r={g.r}
              strokeDasharray="4 4"
              strokeWidth={1.2}
              style={{ fill: tono(g.indice, g.otros, 6), stroke: tono(g.indice, g.otros, 45) }}
            />
            <text
              x={g.x}
              y={g.y - g.r - 8}
              textAnchor="middle"
              fontSize={13}
              fontWeight={500}
              style={SUAVE}
            >
              {g.otros ? "Otros temas" : g.nombre}
            </text>
          </g>
        ))}
        {mapa.burbujas.map(({ tema: t, grupo, x, y, r, etiqueta }) => {
          const otros = otrosDe.get(grupo) ?? false;
          const on = t.id === seleccion;
          const foco = t.id === enfocada;
          const n = etiqueta.lineas.length;
          return (
            <g
              key={t.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={describir(t)}
              data-tema={t.id}
              className="cursor-pointer outline-none"
              onClick={() => onSeleccion(t.id)}
              onKeyDown={(e) => teclas(e, t.id)}
              onFocus={() => setEnfocada(t.id)}
              onBlur={() => setEnfocada((v) => (v === t.id ? null : v))}
            >
              <title>{describir(t)}</title>
              {foco && (
                <circle
                  cx={x}
                  cy={y}
                  r={r + 5}
                  fill="none"
                  strokeWidth={2}
                  style={{ stroke: "var(--ring)" }}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={r}
                strokeWidth={on ? 3.5 : 1.2}
                style={{
                  fill: tono(grupo, otros, 24),
                  stroke: on ? "var(--primary)" : tono(grupo, otros, 60),
                }}
              />
              {etiqueta.dentro ? (
                <>
                  {etiqueta.lineas.map((l, k) => (
                    <text
                      key={k}
                      x={x}
                      y={y + (k - (n - 1) / 2) * etiqueta.tamano * 1.1 - etiqueta.tamano * 0.25}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={etiqueta.tamano}
                      fontWeight={t.medios >= 5 ? 600 : 500}
                      style={TEXTO}
                    >
                      {l}
                    </text>
                  ))}
                  <text
                    x={x}
                    y={y + (n / 2) * etiqueta.tamano * 1.1 + 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.max(10, etiqueta.tamano * 0.7)}
                    style={{ ...SUAVE, fontFamily: MONO }}
                  >
                    {t.medios}
                  </text>
                </>
              ) : (
                <>
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={11}
                    style={{ ...SUAVE, fontFamily: MONO }}
                  >
                    {t.medios}
                  </text>
                  <text
                    x={x}
                    y={y + r + 15}
                    textAnchor="middle"
                    fontSize={etiqueta.tamano}
                    fontWeight={500}
                    style={TEXTO}
                  >
                    {t.nombre}
                  </text>
                </>
              )}
              {t.subiendo && (
                <g aria-hidden>
                  <circle
                    cx={x + r * 0.72}
                    cy={y - r * 0.72}
                    r={12}
                    style={{ fill: "var(--bad)" }}
                  />
                  <text
                    x={x + r * 0.72}
                    y={y - r * 0.72 + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10.5}
                    fontWeight={700}
                    style={{ fill: "var(--card)" }}
                  >
                    +{t.mediosUltimaHora}
                  </text>
                </g>
              )}
              {t.hayAlerta && (
                <g aria-hidden data-alerta="">
                  <circle
                    cx={x - r * 0.72}
                    cy={y - r * 0.72}
                    r={11}
                    strokeWidth={1.2}
                    style={{ fill: "var(--card)", stroke: "var(--primary)" }}
                  />
                  <Bell
                    x={x - r * 0.72 - 7}
                    y={y - r * 0.72 - 7}
                    width={14}
                    height={14}
                    className="text-primary"
                  />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Leyenda corta debajo del mapa. */
export function LeyendaBurbujas() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
      <li>Tamaño de la burbuja = medios que lo publican</li>
      <li>Número rojo = medios nuevos en la última hora</li>
      <li>Campana = ya hay alerta</li>
      <li>Círculo de puntos = nombres que salen juntos en titulares</li>
    </ul>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-2 text-sm font-semibold">{titulo}</h4>
      {children}
    </section>
  );
}

const MAX_MEDIOS_LISTA = 10;

export function FichaTema({
  tema: t,
  onSeleccion,
}: {
  tema: TemaMapa;
  onSeleccion: (id: string) => void;
}) {
  const resto = t.listaMedios.length - MAX_MEDIOS_LISTA;
  return (
    <aside aria-label={`Detalle de ${t.nombre}`} className="p-5">
      <h3 className="tracking-tight text-2xl font-semibold leading-tight">{t.nombre}</h3>
      {t.alias.length > 0 && (
        <p className="mt-1 text-sm text-muted-foreground">Misma historia: {t.alias.join(" · ")}</p>
      )}
      <p className="mt-2 text-sm">
        <span className="font-mono">{t.medios}</span> medios ·{" "}
        <span className="font-mono">{t.mediosUltimaHora}</span> en la última hora
      </p>
      {t.subiendo && (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-bad">Subiendo</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Primer artículo: {horaOFecha(t.primeraVez)} ·{" "}
        {t.hayAlerta ? (
          <Link to="/" className="text-primary underline underline-offset-4">
            ya hay alerta en el radar
          </Link>
        ) : (
          "sin alerta en el radar"
        )}
      </p>
      <Bloque titulo="Medios, por orden de llegada">
        <ol className="list-decimal space-y-0.5 pl-5 text-sm">
          {t.listaMedios.slice(0, MAX_MEDIOS_LISTA).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ol>
        {resto > 0 && <p className="mt-1 text-xs text-muted-foreground">y {resto} más</p>}
      </Bloque>
      <Bloque titulo="Titulares recientes">
        <ul className="space-y-3">
          {t.titulares.map((x) => (
            <li key={x.url} className="text-sm leading-snug">
              <a
                href={x.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {x.titular}
              </a>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {x.medio} · {horaOFecha(x.recibido_en)}
              </div>
            </li>
          ))}
        </ul>
      </Bloque>
      {t.relacionados.length > 0 && (
        <Bloque titulo="Sale junto a">
          <div className="flex flex-wrap gap-2">
            {t.relacionados.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSeleccion(r.id)}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </Bloque>
      )}
    </aside>
  );
}

/**
 * Ficha como capa lateral: se abre por encima del mapa desde la derecha, sin empujarlo ni oscurecer el fondo.
 * El mapa sigue activo (pulsar otra burbuja cambia la ficha). Se cierra con la X, con Esc o pulsando en vacío.
 */
export function CajonFicha({
  tema,
  onCerrar,
  onSeleccion,
}: {
  tema: TemaMapa;
  onCerrar: () => void;
  onSeleccion: (id: string) => void;
}) {
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cerrar.current?.focus();
  }, []);
  useEffect(() => {
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Ficha de ${tema.nombre}`}
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l bg-card shadow-lg animate-in slide-in-from-right duration-300 sm:w-[28rem]"
    >
      <div className="flex items-center justify-between border-b py-3 pl-5 pr-4">
        <span className="text-xs text-muted-foreground">Ficha del tema · Esc para cerrar</span>
        <button
          ref={cerrar}
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar ficha"
          className="rounded-md border p-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FichaTema tema={tema} onSeleccion={onSeleccion} />
      </div>
    </div>
  );
}

const LEYENDA: { t: string; d: string }[] = [
  {
    t: "Tamaño",
    d: "Cada burbuja es un nombre. Cuantos más medios distintos lo han publicado en la ventana elegida, más grande es. El número de debajo es ese recuento.",
  },
  {
    t: "Grupos",
    d: "Las burbujas dentro del mismo círculo de puntos salen juntas en al menos 2 titulares. El grupo se titula con sus tres temas más grandes; los que no tienen relación van en «Otros temas».",
  },
  {
    t: "Número rojo",
    d: "Medios nuevos en la última hora. Sale cuando son al menos 2 y al menos la mitad del total: el tema está entrando ahora.",
  },
  { t: "Campana", d: "El radar ya tiene una alerta de ese tema en las últimas 24 horas." },
  {
    t: "Qué cubre",
    d: "Lo que envía Snoop de las categorías News y News/Politics en España. Las publicaciones de X, YouTube, Instagram, TikTok o Facebook no cuentan como medio.",
  },
  {
    t: "Cómo se detecta",
    d: "Sin IA: se juntan los nombres propios de los titulares y se quitan lugares y palabras generales. Es una aproximación y puede haber algo de ruido.",
  },
];

export function LeyendaMapa() {
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-block cursor-pointer text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
        Cómo leer el mapa
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-3 border bg-card p-4 sm:grid-cols-2">
        {LEYENDA.map((e) => (
          <div key={e.t}>
            <dt className="font-semibold">{e.t}</dt>
            <dd className="mt-0.5 text-muted-foreground">{e.d}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
