import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fechaLarga, hace, horaOFecha } from "@/lib/fechas";
import { describirPuntos } from "@/lib/prioridad";
import { enlaceX } from "@/lib/contexto";
import { fuerzaSenal, sugerenciaExcepcion, type Descarte } from "@/lib/descartes";
import { anadirExcepcion, marcarDescarte } from "@/lib/descartes.functions";
import type { Alerta, Estado } from "@/lib/types";
import { Detalle } from "./Detalle";
import { ContenidoAlerta } from "./ItemAlerta";

export type Vista = "alertas" | "descartes" | "todas";

/** «Alertas (12) | Descartadas por la IA (7) | Todas (19)» */
export function SelectorVistas({
  vista,
  onCambio,
  cuentas,
}: {
  vista: Vista;
  onCambio: (v: Vista) => void;
  cuentas: Record<Vista, number | null>;
}) {
  const opciones: { v: Vista; t: string }[] = [
    { v: "alertas", t: "Alertas" },
    { v: "descartes", t: "Descartadas por la IA" },
    { v: "todas", t: "Todas" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Qué ver"
      className="mt-4 inline-flex flex-wrap rounded-md border bg-card p-1 text-sm"
    >
      {opciones.map((o) => (
        <button
          key={o.v}
          type="button"
          role="tab"
          aria-selected={vista === o.v}
          onClick={() => onCambio(o.v)}
          className={cn(
            "rounded-md px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-ring",
            vista === o.v
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.t} <span className="font-mono">({cuentas[o.v] ?? "…"})</span>
        </button>
      ))}
    </div>
  );
}

/** Aviso que explica la vista de descartes, con el paso a «ver todos». */
export function AvisoDescartes({
  verTodos,
  onVerTodos,
}: {
  verTodos: boolean;
  onVerTodos: (v: boolean) => void;
}) {
  return (
    <div className="mt-4 border bg-card p-4 text-sm">
      <p>
        Temas que la IA dejó fuera por no encajar con la línea editorial o por ser noticia de
        agencia.{" "}
        {verTodos ? (
          "Se ven todos"
        ) : (
          <>
            Solo los <span className="font-medium">fuertes</span>: puesto alto en X, mucho volumen o
            varias fuentes
          </>
        )}
        , ordenados por puntos.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Revísalos y marca los que deberían haber pasado. No cuentan en los indicadores ni en el tope
        diario. ·{" "}
        <button
          type="button"
          onClick={() => onVerTodos(!verTodos)}
          className="text-primary underline underline-offset-4"
        >
          {verTodos ? "Ver solo los fuertes" : "Ver todos los descartes"}
        </button>
      </p>
    </div>
  );
}

function ContenidoDescarte({ d, gris = false }: { d: Descarte; gris?: boolean }) {
  const senal = [
    d.x_posicion ? `X #${d.x_posicion}` : null,
    d.trends_crecimiento ? `Trends ${d.trends_crecimiento}` : null,
    d.wikipedia_ratio ? `Wikipedia ×${Number(d.wikipedia_ratio).toLocaleString("es-ES")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
        {horaOFecha(d.creada_en)}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn("truncate font-semibold tracking-tight", gris && "text-muted-foreground")}
        >
          {d.tema}
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {d.motivo_ia || "Sin motivo"}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
        {gris && <span className="font-medium text-bad">Descartada por la IA</span>}
        <span className="font-mono text-muted-foreground">
          {d.puntos} pts{senal ? ` · ${senal}` : ""}
        </span>
        {d.veredicto && <span className="font-medium text-bad">Debería haber pasado</span>}
      </div>
    </>
  );
}

const fila = (on: boolean) =>
  cn(
    "flex w-full cursor-pointer gap-3 px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    on ? "bg-accent shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted",
  );

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

/** Ficha de un descarte: por qué lo dejó fuera la IA, la señal y la revisión («Debería haber pasado» y la excepción). */
export function FichaDescarte({ d, esAdmin }: { d: Descarte; esAdmin: boolean }) {
  const qc = useQueryClient();
  const marcar = useServerFn(marcarDescarte);
  const excepcion = useServerFn(anadirExcepcion);
  const [nota, setNota] = useState("");
  const [tipo, setTipo] = useState<"criterio" | "nombre">("criterio");
  const [criterio, setCriterio] = useState(() => sugerenciaExcepcion(d.tema, d.nota));
  const [oculto, setOculto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const fuerza = fuerzaSenal({
    creada_en: d.creada_en,
    x_posicion: d.x_posicion,
    x_desde: d.x_desde,
    trends_crecimiento: d.trends_crecimiento,
    wikipedia_ratio: d.wikipedia_ratio,
  });
  const actualizar = (nueva: Descarte) =>
    qc.setQueriesData<Descarte[]>({ queryKey: ["descartes"] }, (l) =>
      l?.map((x) => (x.id === nueva.id ? nueva : x)),
    );
  async function revisar(marcarlo: boolean) {
    setOcupado(true);
    try {
      const nueva = await marcar({ data: { id: d.id, marcar: marcarlo, nota } });
      actualizar(nueva);
      setCriterio(sugerenciaExcepcion(nueva.tema, nueva.nota));
      setNota("");
    } catch {
      toast.error("No se pudo guardar la revisión. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }
  async function guardarExcepcion() {
    setOcupado(true);
    try {
      actualizar(await excepcion({ data: { id: d.id, tipo, texto: criterio } }));
      toast.success("Excepción guardada. Se aplica desde la próxima tanda.");
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.includes("caracteres")
          ? e.message
          : "No se pudo guardar la excepción.",
      );
    } finally {
      setOcupado(false);
    }
  }
  const bloque = (t: string, v: ReactNode) => (
    <div className="p-3">
      <div className="text-xs text-muted-foreground">{t}</div>
      <div className="mt-1 text-sm">{v}</div>
    </div>
  );
  return (
    <article className="break-words border bg-card p-6" aria-label={`Descarte: ${d.tema}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span className="text-xs font-medium text-bad">● Descartada por la IA</span>
        <span className="font-mono">{fechaLarga(d.creada_en)}</span>
        <span>·</span>
        <span>{hace(d.creada_en)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Sin contar la línea editorial · {describirPuntos(fuerza)}
      </p>
      <h2 className="mt-3 tracking-tight text-3xl font-semibold leading-tight">{d.tema}</h2>
      {d.contexto && <p className="mt-1 text-muted-foreground">{d.contexto}</p>}

      <Seccion titulo="Por qué la IA lo dejó fuera">
        <div className="pl-3 text-sm" style={{ borderLeft: "3px solid var(--bad)" }}>
          <p>
            <span className="font-medium">
              {d.agencia ? "Noticia de agencia:" : "Fuera de línea:"}
            </span>{" "}
            {d.motivo_ia || "sin motivo"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sección que sugería: {d.seccion_ia || "—"}
            {d.modelo ? ` · Modelo: ${d.modelo}` : ""}
          </p>
        </div>
      </Seccion>

      <Seccion titulo="Señal">
        <div className="grid divide-y border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {bloque(
            "X (España)",
            d.x_posicion ? (
              <>
                <span className="font-mono">#{d.x_posicion}</span>
                <div className="mt-1 text-xs">
                  <a
                    href={enlaceX(d.tema)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    Ver en X
                  </a>
                </div>
              </>
            ) : (
              "No"
            ),
          )}
          {bloque(
            "Volumen en Google",
            d.trends_crecimiento ? <span className="font-mono">{d.trends_crecimiento}</span> : "No",
          )}
          {bloque(
            "Wikipedia",
            d.wikipedia_ratio ? (
              <>
                <span className="font-mono">
                  ×{Number(d.wikipedia_ratio).toLocaleString("es-ES")}
                </span>{" "}
                sobre su media
              </>
            ) : (
              "Sin pico"
            ),
          )}
        </div>
      </Seccion>

      <div className="mt-6 border-t pt-4">
        {!d.veredicto ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={ocupado} onClick={() => revisar(true)}>
                Debería haber pasado
              </Button>
              <span className="text-xs text-muted-foreground">
                Si te parece bien descartada, no hace falta hacer nada.
              </span>
            </div>
            <label className="mt-3 block text-xs text-muted-foreground" htmlFor={`nota-${d.id}`}>
              Nota (opcional): por qué nos interesaba
            </label>
            <Textarea
              id={`nota-${d.id}`}
              className="mt-1"
              rows={2}
              maxLength={500}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Por ejemplo: hay dinero público en juego"
            />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                Debería haber pasado ✓
              </span>
              {!d.excepcion && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => revisar(false)}
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Quitar la marca
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Marcado por {d.veredicto_por || "alguien del equipo"}
              {d.veredicto_en ? ` · ${hace(d.veredicto_en)}` : ""}
              {d.nota ? ` · «${d.nota}»` : ""}
            </p>
            {d.excepcion ? (
              <p className="mt-4 border bg-accent p-3 text-sm">
                Excepción añadida{d.excepcion_por ? ` por ${d.excepcion_por}` : ""}
                {d.excepcion_en ? ` (${hace(d.excepcion_en)})` : ""}:{" "}
                {d.excepcion_tipo === "nombre" ? (
                  <>avisar siempre de «{d.excepcion}»</>
                ) : (
                  <>«{d.excepcion}»</>
                )}
              </p>
            ) : esAdmin && !oculto ? (
              <section className="mt-4 border bg-accent p-4" aria-label="Añadir como excepción">
                <h3 className="text-sm font-semibold">
                  Añadir como excepción{" "}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (solo administradores)
                  </span>
                </h3>
                <div className="mt-3 space-y-3 text-sm">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`tipo-${d.id}`}
                      checked={tipo === "criterio"}
                      onChange={() => setTipo("criterio")}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">Añadir un criterio a las excepciones</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        (recomendado: sirve también para casos parecidos)
                      </span>
                    </span>
                  </label>
                  {tipo === "criterio" && (
                    <Textarea
                      className="bg-card"
                      rows={2}
                      maxLength={300}
                      value={criterio}
                      onChange={(e) => setCriterio(e.target.value)}
                      aria-label="Criterio de la excepción"
                    />
                  )}
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`tipo-${d.id}`}
                      checked={tipo === "nombre"}
                      onChange={() => setTipo("nombre")}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">Avisar siempre de «{d.tema}»</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        (regla de «sí»: solo este nombre)
                      </span>
                    </span>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={ocupado} onClick={guardarExcepcion}>
                    Guardar excepción
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOculto(true)}>
                    Ahora no
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Se aplica desde la próxima tanda; queda registrado quién la añadió.
                  </span>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

function EstadoLista({
  cargando,
  error,
  vacio,
  texto,
}: {
  cargando: boolean;
  error: boolean;
  vacio: boolean;
  texto: string;
}) {
  if (error)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        No se pudieron cargar los descartes. Inténtalo de nuevo.
      </p>
    );
  if (cargando) return <p className="p-4 text-sm text-muted-foreground">Cargando…</p>;
  if (vacio) return <p className="p-4 text-sm text-muted-foreground">{texto}</p>;
  return null;
}

/** Vista «Descartadas por la IA»: lista a la izquierda y ficha a la derecha. */
export function VistaDescartes({
  descartes,
  cargando,
  error,
  esAdmin,
}: {
  descartes: Descarte[];
  cargando: boolean;
  error: boolean;
  esAdmin: boolean;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const actual = descartes.find((d) => d.id === sel) ?? descartes[0];
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="min-w-0 border bg-card">
        <EstadoLista
          cargando={cargando}
          error={error}
          vacio={!descartes.length}
          texto="No hay descartes con estos filtros."
        />
        {!cargando && !error && descartes.length > 0 && (
          <ul aria-label="Descartes" className="divide-y">
            {descartes.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={d.id === actual?.id}
                  onClick={() => setSel(d.id)}
                  className={fila(d.id === actual?.id)}
                >
                  <ContenidoDescarte d={d} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="min-w-0">
        {actual ? <FichaDescarte key={actual.id} d={actual} esAdmin={esAdmin} /> : null}
      </div>
    </div>
  );
}

/** Vista «Todas»: alertas y descartes mezclados por hora; cada uno abre su ficha. */
export function VistaTodas({
  alertas,
  descartes,
  esAdmin,
  onValorar,
}: {
  alertas: Alerta[];
  descartes: Descarte[];
  esAdmin: boolean;
  onValorar: (a: Alerta, e: Estado, url?: string | null) => void;
}) {
  type Item = { k: string; ms: number } & (
    { tipo: "alerta"; a: Alerta } | { tipo: "descarte"; d: Descarte }
  );
  const items: Item[] = [
    ...alertas.map((a) => ({
      k: `a${a.id}`,
      ms: Date.parse(a.creada_en),
      tipo: "alerta" as const,
      a,
    })),
    ...descartes.map((d) => ({
      k: `d${d.id}`,
      ms: Date.parse(d.creada_en),
      tipo: "descarte" as const,
      d,
    })),
  ].sort((x, y) => y.ms - x.ms);
  const [sel, setSel] = useState<string | null>(null);
  const actual = items.find((i) => i.k === sel) ?? items[0];
  return (
    <>
      <p className="mt-3 text-xs text-muted-foreground">
        «Todas»: alertas y descartes, por hora. Los indicadores cuentan solo las alertas.
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 border bg-card">
          {!items.length ? (
            <p className="p-4 text-sm text-muted-foreground">No hay nada con estos filtros.</p>
          ) : (
            <ul aria-label="Alertas y descartes" className="divide-y">
              {items.map((i) => (
                <li key={i.k}>
                  <button
                    type="button"
                    aria-pressed={i.k === actual?.k}
                    onClick={() => setSel(i.k)}
                    className={fila(i.k === actual?.k)}
                  >
                    {i.tipo === "alerta" ? (
                      <ContenidoAlerta a={i.a} />
                    ) : (
                      <ContenidoDescarte d={i.d} gris />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          {actual?.tipo === "alerta" ? (
            <Detalle a={actual.a} onValorar={(e, u) => onValorar(actual.a, e, u)} />
          ) : actual?.tipo === "descarte" ? (
            <FichaDescarte key={actual.d.id} d={actual.d} esAdmin={esAdmin} />
          ) : null}
        </div>
      </div>
    </>
  );
}
