import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, ChevronRight, ExternalLink, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { hace, horaOFecha } from "@/lib/fechas";
import { llegada } from "@/lib/metricas";
import { PESTANAS, textoRadar, type Pestana, type TemaMapa } from "@/lib/discoverMap";
import { ComoLeer, Etiqueta } from "./ui";

// «Discover ahora»: lista de lo que ya está en Discover, ordenada por ritmo. Cada fila enseña la historia (último
// titular), el ritmo, los medios con la misma etiqueta que la ficha de Alertas, si estamos y si el radar avisó antes;
// al pulsarla se despliega ahí mismo con los titulares, el orden de llegada y los temas con los que sale.

const PUNTO = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" } as const;
const LLEGADA = { ok: "vas a tiempo", warn: "justo", bad: "tarde" } as const;
const COLUMNAS =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_88px_184px_88px_112px_168px_16px] lg:items-center lg:gap-4";
const MAX_LLEGADAS = 10;

export function SelectorPestanas({
  pestana,
  onCambio,
  cuentas,
  sinDominio,
}: {
  pestana: Pestana;
  onCambio: (p: Pestana) => void;
  cuentas: Record<Pestana, number>;
  /** Sin nuestro dominio en Configuración no se sabe dónde no estamos. */
  sinDominio: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Qué ver"
      className="mt-4 inline-flex flex-wrap rounded-md border bg-card p-1 text-sm"
    >
      {PESTANAS.map((p) => {
        const off = p.id === "sin_nosotros" && sinDominio;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            disabled={off}
            title={off ? "Falta nuestro dominio en Configuración" : undefined}
            onClick={() => onCambio(p.id)}
            className={cn(
              "rounded-md px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
              pestana === p.id
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.titulo} <span className="font-mono">({off ? "—" : cuentas[p.id]})</span>
          </button>
        );
      })}
    </div>
  );
}

export function ListaDiscover({
  temas,
  referencia,
  propio,
  abierto,
  onAbrir,
}: {
  temas: TemaMapa[];
  referencia: string[];
  propio: string | null;
  abierto: string | null;
  onAbrir: (id: string | null) => void;
}) {
  return (
    <div className="border bg-card">
      <div
        aria-hidden
        className={cn("hidden border-b px-4 py-2 text-xs text-muted-foreground", COLUMNAS)}
      >
        <span>Tema y último titular</span>
        <span>Ritmo</span>
        <span>Medios en Discover</span>
        <span>Nosotros</span>
        <span>En Discover desde</span>
        <span>Radar</span>
        <span />
      </div>
      <ul className="divide-y">
        {temas.map((t) => (
          <FilaTema
            key={t.id}
            tema={t}
            referencia={referencia}
            propio={propio}
            abierta={t.id === abierto}
            onAbrir={onAbrir}
          />
        ))}
      </ul>
    </div>
  );
}

function FilaTema({
  tema: t,
  referencia,
  propio,
  abierta,
  onAbrir,
}: {
  tema: TemaMapa;
  referencia: string[];
  propio: string | null;
  abierta: boolean;
  onAbrir: (id: string | null) => void;
}) {
  const nivel = llegada(t.medios).nivel;
  const ultimo = t.titulares[0];
  const radar = t.alerta ? textoRadar(t.alerta.creada_en, t.primeraVez) : null;
  return (
    <li data-tema={t.id}>
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => onAbrir(abierta ? null : t.id)}
        className={cn(
          "flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          COLUMNAS,
          abierta && "bg-accent hover:bg-accent",
        )}
      >
        <span className="block min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight">{t.nombre}</span>
            {t.categorias[0] && (
              <span className="text-xs text-muted-foreground">{t.categorias[0]}</span>
            )}
          </span>
          {ultimo && (
            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
              <span className="font-mono text-xs">{ultimo.medio}</span> · «{ultimo.titular}»
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm lg:contents">
          <span className={t.subiendo ? "font-semibold text-bad" : "text-muted-foreground"}>
            {t.mediosUltimaHora > 0 ? `+${t.mediosUltimaHora} en 1 h` : "sin nuevos en 1 h"}
          </span>
          <span>
            <Etiqueta punto={PUNTO[nivel]}>
              {t.medios} {t.medios === 1 ? "medio" : "medios"} · {LLEGADA[nivel]}
            </Etiqueta>
          </span>
          <span>
            <span className="text-muted-foreground lg:hidden">Nosotros: </span>
            {!propio ? (
              <span className="text-muted-foreground">—</span>
            ) : t.nosotros ? (
              <span className="font-medium text-ok">Sí · {t.nosotros.puesto}.º</span>
            ) : (
              <span className="font-semibold">No</span>
            )}
          </span>
          <span className="text-muted-foreground">{hace(t.primeraVez)}</span>
          <span>
            {radar ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  radar.antes ? "text-ok" : "text-warn",
                )}
              >
                <Bell aria-hidden className="size-3.5 shrink-0" /> {radar.texto}
              </span>
            ) : (
              <span className="text-muted-foreground">sin alerta</span>
            )}
          </span>
          {abierta ? (
            <ChevronDown aria-hidden className="hidden size-4 text-muted-foreground lg:block" />
          ) : (
            <ChevronRight aria-hidden className="hidden size-4 text-muted-foreground lg:block" />
          )}
        </span>
      </button>
      {abierta && (
        <DetalleTema tema={t} referencia={referencia} propio={propio} onAbrir={onAbrir} />
      )}
    </li>
  );
}

export function DetalleTema({
  tema: t,
  referencia,
  propio,
  onAbrir,
}: {
  tema: TemaMapa;
  referencia: string[];
  propio: string | null;
  onAbrir: (id: string | null) => void;
}) {
  const llegadas = t.llegadas.slice(0, MAX_LLEGADAS);
  const resto = t.llegadas.length - llegadas.length;
  const nosotrosFuera = t.nosotros && t.nosotros.puesto > MAX_LLEGADAS;
  return (
    <div className="border-t bg-accent/40 px-4 pt-3 pb-4">
      {t.alias.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">Misma historia: {t.alias.join(" · ")}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
        <section aria-label="Titulares en Discover">
          <h4 className="mb-2 text-sm font-semibold">Titulares en Discover</h4>
          <ul className="grid grid-cols-[max-content_minmax(0,1fr)_max-content] gap-x-3">
            {t.titulares.map((x) => (
              <li
                key={x.url}
                className="col-span-full grid grid-cols-subgrid items-baseline py-1 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{x.medio}</span>
                <a
                  href={x.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-baseline gap-1.5 underline-offset-4 hover:underline"
                >
                  {x.titular}
                  <ExternalLink aria-hidden className="size-3 shrink-0 self-center text-primary" />
                </a>
                <span className="font-mono text-xs text-muted-foreground">
                  {horaOFecha(x.recibido_en)}
                </span>
              </li>
            ))}
          </ul>
          {t.nosotros && (
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">Nuestra pieza: </span>
              <a
                href={t.nosotros.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t.nosotros.titular}
              </a>
            </p>
          )}
        </section>
        <section aria-label="Medios por orden de llegada">
          <h4 className="mb-2 text-sm font-semibold">Medios por orden de llegada</h4>
          <ol className="grid grid-cols-[max-content_minmax(0,1fr)_max-content] gap-x-3 text-sm">
            {llegadas.map((m, i) => (
              <li
                key={m.medio}
                className="col-span-full grid grid-cols-subgrid items-baseline py-0.5"
              >
                <span className="font-mono text-xs text-muted-foreground">{i + 1}.º</span>
                <span
                  className={cn(
                    "inline-flex min-w-0 items-center gap-1.5",
                    m.medio === propio && "font-semibold text-ok",
                  )}
                >
                  <span className="truncate">{m.medio}</span>
                  {referencia.includes(m.medio) && (
                    <Star
                      aria-label="medio de referencia"
                      className="size-3 shrink-0 fill-current text-warn"
                    />
                  )}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {horaOFecha(m.hora)}
                </span>
              </li>
            ))}
            {propio && (!t.nosotros || nosotrosFuera) && (
              <li className="col-span-full grid grid-cols-subgrid items-baseline py-0.5">
                <span className="font-mono text-xs text-muted-foreground">
                  {t.nosotros ? `${t.nosotros.puesto}.º` : "—"}
                </span>
                <span className={t.nosotros ? "font-semibold text-ok" : "font-semibold"}>
                  {propio}
                  {t.nosotros ? "" : " · todavía no"}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {t.nosotros ? horaOFecha(t.nosotros.hora) : ""}
                </span>
              </li>
            )}
          </ol>
          {resto > 0 && <p className="mt-1 text-xs text-muted-foreground">y {resto} más</p>}
          {referencia.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Star aria-hidden className="size-3 fill-current text-warn" /> Medio de referencia
              (Configuración)
            </p>
          )}
        </section>
        <section aria-label="Sale junto a">
          {t.relacionados.length > 0 && (
            <>
              <h4 className="mb-2 text-sm font-semibold">Sale junto a</h4>
              <div className="flex flex-wrap gap-2">
                {t.relacionados.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onAbrir(r.id)}
                    className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>
            </>
          )}
          {t.alerta && (
            <Link
              to="/"
              search={{ alerta: t.alerta.id }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Bell aria-hidden className="size-3.5" /> Ver su alerta
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

const cuantos = (n: number, uno: string, varios: string) =>
  `${n.toLocaleString("es-ES")} ${n === 1 ? uno : varios}`;

/**
 * «250 artículos en la ventana: 90 forman los 28 temas de la lista; 140 no tienen nombre propio en el titular y 20
 * hablan de nombres que salen en menos de 3 medios.» Para que el filtro no sea invisible.
 */
export function ResumenVentana({
  articulos,
  temas,
  resumen: r,
}: {
  articulos: number;
  temas: number;
  resumen: { enTemas: number; sinNombre: number; pocosMedios: number; fueraDeLista: number };
}) {
  const fuera = [
    r.sinNombre > 0 &&
      `${r.sinNombre.toLocaleString("es-ES")} no tienen nombre propio en el titular`,
    r.pocosMedios > 0 &&
      `${r.pocosMedios.toLocaleString("es-ES")} hablan de nombres que salen en menos de 3 medios`,
    r.fueraDeLista > 0 &&
      `${r.fueraDeLista.toLocaleString("es-ES")} son de temas que no caben en la lista (máximo 40)`,
  ].filter((x): x is string => !!x);
  const ultimo = fuera.pop();
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {cuantos(articulos, "artículo", "artículos")} en la ventana:{" "}
      {r.enTemas.toLocaleString("es-ES")} forman {temas === 1 ? "el tema" : `los ${temas} temas`} de
      la lista
      {ultimo ? `; ${fuera.length ? `${fuera.join(", ")} y ${ultimo}` : ultimo}` : ""}.
    </p>
  );
}

const LEYENDA: { t: string; d: string }[] = [
  {
    t: "Pestañas",
    d: "«Entrando ahora»: temas que suben y todavía tienen 5 medios o menos. «Sin nosotros»: temas en los que no estamos. «Consolidados»: 6 medios o más. «Todo»: todos los de la ventana.",
  },
  {
    t: "Ritmo",
    d: "Medios que lo han publicado por primera vez en la última hora. En rojo cuando son al menos 2 y al menos la mitad del total: el tema está entrando ahora. La lista va de lo que más sube a lo que menos.",
  },
  {
    t: "Medios en Discover",
    d: "Medios distintos que ya lo tienen en Discover, sin contarnos a nosotros. Misma etiqueta que en la ficha de Alertas: «vas a tiempo» con 0–2, «justo» con 3–5 y «tarde» con 6 o más.",
  },
  {
    t: "Nosotros",
    d: "Si ya estamos en Discover con ese tema y en qué puesto llegamos. Necesita nuestro dominio en Configuración; sin él sale «—».",
  },
  {
    t: "Radar",
    d: "Si el radar creó una alerta del tema en las últimas 24 horas y cuánto antes (o después) de su primer artículo en Discover. «Ver su alerta» la abre en Alertas.",
  },
  {
    t: "Estrella",
    d: "Medios de referencia de Configuración, en la lista de medios por orden de llegada.",
  },
  {
    t: "Qué cubre",
    d: "Lo que envía Snoop de las categorías que tengan alerta allí (el nombre de cada alerta es la categoría). Las publicaciones de X, YouTube, Instagram, TikTok o Facebook no cuentan como medio.",
  },
  {
    t: "Cómo se detecta",
    d: "Sin IA: se juntan los nombres propios de los titulares y se quitan lugares y palabras generales. Un nombre es tema si sale en 3 medios o más (o en 2 de la última hora). Es una aproximación y puede haber algo de ruido. La línea bajo los filtros dice cuántos artículos se quedan fuera y por qué.",
  },
];

export function LeyendaDiscover() {
  return (
    <ComoLeer titulo="Cómo leer esta sección">
      <dl className="mt-3 grid gap-x-6 gap-y-3 border bg-card p-4 sm:grid-cols-2">
        {LEYENDA.map((e) => (
          <div key={e.t}>
            <dt className="font-semibold">{e.t}</dt>
            <dd className="mt-0.5 text-muted-foreground">{e.d}</dd>
          </div>
        ))}
      </dl>
    </ComoLeer>
  );
}
