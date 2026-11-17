import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Newspaper, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Alerta, Estado } from "@/lib/types";
import { fechaLarga, hace, hora24, esHoy } from "@/lib/fechas";
import { HORAS_SEGUIMIENTO, llegada, nombreVisible, seguimientoCerrado, sinDatosDiscover } from "@/lib/metricas";
import { BloqueFicha, Etiqueta, Pliegue } from "./ui";
import { puntuarAlerta, UMBRAL_ALTA } from "@/lib/prioridad";
import { DesglosePuntos } from "./Puntos";
import { BloqueAutoridad, EtiquetaAutoridad } from "./Autoridad";
import { enlaceX, leerContexto } from "@/lib/contexto";

// Ficha de una alerta. Arriba, lo necesario para decidir (cabecera y «Por qué ahora»); debajo, la competencia y
// nuestras piezas, con lo largo plegado; al pie, los botones de valoración, siempre a la vista.
const LLEGADA_TEXTO = { ok: "vas a tiempo", warn: "justo", bad: "tarde" } as const;
// Pasadas las 24 h de seguimiento, la llegada es historia: sin «vas».
const LLEGADA_PASADA = { ok: "a tiempo", warn: "justo", bad: "tarde" } as const;
const LLEGADA_PUNTO = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" } as const;
const GRIS = "bg-muted-foreground/40";

/** «Encaja (IA, alto): …» → «Encaja mucho (según la IA): …». Lo que no reconoce, tal cual. */
function motivoLegible(m: string): ReactNode {
  const ia = /^Encaja \(IA, (alto|medio)\):\s*([\s\S]*)$/.exec(m);
  if (ia) return <><b>{ia[1] === "alto" ? "Encaja mucho" : "Puede encajar según el enfoque"}</b> <span className="text-muted-foreground">(según la IA)</span>: {ia[2]}</>;
  const reglas = /^Encaja por reglas:\s*([\s\S]*)$/.exec(m);
  if (reglas) return <><b>Encaja</b> <span className="text-muted-foreground">(por las reglas de Configuración)</span>: {reglas[1]}</>;
  return m;
}

/** «X», «X ni en Google», «X, Google ni Wikipedia». */
const sinSenalEn = (fuentes: string[]) =>
  fuentes.length < 3 ? fuentes.join(" ni en ") : `${fuentes.slice(0, -1).join(", ")} ni ${fuentes[fuentes.length - 1]}`;

export function Detalle({ a, onValorar }: { a: Alerta; onValorar: (estado: Estado, pieza_url?: string | null) => void }) {
  const [editUrl, setEditUrl] = useState(false);
  const [url, setUrl] = useState("");
  const urlValida = url === "" || /^https:\/\/\S+$/.test(url);
  useEffect(() => { setEditUrl(false); setUrl(a.pieza_url ?? ""); }, [a.id, a.pieza_url]);

  const c = leerContexto(a);
  const l = llegada(a.medios_discover);
  const hayTrends = a.trends_activo && !!a.trends_crecimiento;
  const vacias = [!a.x_posicion && "X", !hayTrends && "Google", !a.wikipedia_ratio && "Wikipedia"].filter((f): f is string => !!f);
  const seccion = a.seccion_sugerida && a.seccion_sugerida !== "Sin sugerir" ? a.seccion_sugerida : null;
  const cerrado = seguimientoCerrado(a.creada_en);
  const medios = a.medios_discover === 0 ? "Nadie" : `${a.medios_discover} ${a.medios_discover === 1 ? "medio" : "medios"}`;

  const btn = (estado: Estado, label: string, onClick?: () => void) => (
    <button aria-pressed={a.estado === estado} onClick={onClick ?? (() => onValorar(estado))}
      className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        a.estado === estado ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
      {label}
    </button>
  );

  return (
    <article className="break-words border bg-card" aria-label={`Detalle: ${a.entidad}`}>
      <div className="px-6 pt-5 pb-4">
        <time dateTime={a.creada_en} title={fechaLarga(a.creada_en)} className="font-mono text-xs text-muted-foreground underline decoration-dotted underline-offset-4">{hace(a.creada_en)}</time>
        <h2 className="mt-1.5 tracking-tight text-3xl font-semibold leading-tight">{nombreVisible(a.entidad)}</h2>
        {c.queEs && <p className="mt-1 text-muted-foreground">{c.queEs}</p>}
        {c.frase && <p className="mt-1 text-sm text-muted-foreground">«{c.frase}»</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Etiqueta punto={a.prioridad === "alta" ? "bg-primary" : GRIS}>
            Prioridad {a.prioridad} ·
            <DesglosePuntos p={puntuarAlerta(a)} titulo="Prioridad por puntos" nota={`Alta: ${UMBRAL_ALTA} puntos o más, que encaje con la línea o venga de 2 fuentes, y como mucho 2 medios en Discover.`} />
          </Etiqueta>
          {sinDatosDiscover(a)
            ? <Etiqueta punto={GRIS}>Sin datos de Discover todavía</Etiqueta>
            : cerrado
              ? <Etiqueta punto={LLEGADA_PUNTO[l.nivel]}>{medios} en Discover en sus primeras {HORAS_SEGUIMIENTO} h · {LLEGADA_PASADA[l.nivel]}</Etiqueta>
              : <Etiqueta punto={LLEGADA_PUNTO[l.nivel]}>{a.medios_discover === 0 ? "Nadie en Discover aún" : `${medios} en Discover`} · {LLEGADA_TEXTO[l.nivel]}</Etiqueta>}
          <EtiquetaAutoridad entidad={a.entidad} />
        </div>
        {(a.motivo_afinidad || seccion) && (
          <p className="mt-3 text-sm">
            {motivoLegible(a.motivo_afinidad)}
            {seccion && <>{a.motivo_afinidad && <span className="text-muted-foreground"> · </span>}<span className="text-muted-foreground">Sección sugerida:</span> <span className="font-medium">{seccion}</span></>}
          </p>
        )}
      </div>

      <BloqueFicha titulo="Por qué ahora" icono={TrendingUp}>
        {c.seHabla && <p className="mb-1 text-sm">Se habla de: <span className="font-medium">«{c.seHabla.titular}»</span>{c.seHabla.medio && <span className="text-muted-foreground"> ({c.seHabla.medio})</span>}</p>}
        {c.resto && <p className="mb-1 text-sm text-muted-foreground">{c.resto}</p>}
        {vacias.length < 3 && (
          <ul className="grid grid-cols-[max-content_minmax(0,1fr)_auto] gap-x-3">
            {a.x_posicion ? (
              <Fuente nombre="X" enlace={<a href={enlaceX(nombreVisible(a.entidad))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4">Ver en X <ExternalLink aria-hidden className="size-3" /></a>}>
                puesto <span className="font-mono">{a.x_posicion}</span>
                {a.x_desde && (esHoy(a.x_desde) ? <> desde las <span className="font-mono">{hora24(a.x_desde)}</span></> : <> desde el <span className="font-mono">{fechaLarga(a.x_desde)}</span></>)}
                {c.x?.categoria && <> · {c.x.categoria}</>}
                {c.x?.publicaciones && <> · {c.x.publicaciones}</>}
              </Fuente>
            ) : null}
            {hayTrends && <Fuente nombre="Google"><span className="font-mono">{a.trends_crecimiento}</span> búsquedas</Fuente>}
            {a.wikipedia_ratio ? (
              <Fuente nombre="Wikipedia">
                <span className="font-mono">{(a.wikipedia_visitas ?? 0).toLocaleString("es-ES")}</span> visitas en un día, <span className="font-mono">×{Number(a.wikipedia_ratio).toLocaleString("es-ES")}</span> sobre su media
              </Fuente>
            ) : null}
          </ul>
        )}
        {vacias.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Sin señal en {sinSenalEn(vacias)}.</p>}
      </BloqueFicha>

      <BloqueFicha titulo="Competencia en Discover" icono={Newspaper}>
        <Competencia key={a.id} a={a} />
        {cerrado && <p className="mt-2 text-xs text-muted-foreground">Medido en las {HORAS_SEGUIMIENTO} horas siguientes a la alerta, hasta el {fechaLarga(new Date(Date.parse(a.creada_en) + HORAS_SEGUIMIENTO * 3_600_000).toISOString())}. Si ha vuelto a Discover, lo verás en «Discover ahora».</p>}
      </BloqueFicha>

      <BloqueAutoridad key={a.id} entidad={a.entidad} />

      <div className="sticky bottom-0 z-10 border-t bg-card px-6 py-3 shadow-[0_-6px_12px_-10px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[15px] font-semibold">¿Te sirve esta alerta?</span>
          {btn("util", "Útil")}
          {btn("ruido", "Ruido")}
          {btn("publicada", "Publicamos", () => { onValorar("publicada", a.estado === "publicada" ? a.pieza_url : null); setEditUrl(true); })}
        </div>
        {a.estado === "publicada" && editUrl && (
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!urlValida) return; onValorar("publicada", url || null); setEditUrl(false); }}>
            <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
              Enlace a nuestra pieza (opcional)
              <input autoFocus type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://"
                aria-invalid={!urlValida} className="rounded-md border border-input bg-background px-3 py-1.5 font-mono text-sm focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive" />
            </label>
            <button type="submit" disabled={!urlValida} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Guardar</button>
            <button type="button" onClick={() => setEditUrl(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
            {!urlValida && <p className="w-full text-xs text-destructive">El enlace debe empezar por https://</p>}
          </form>
        )}
        {a.estado === "publicada" && !editUrl && (
          <p className="mt-3 text-sm">
            {a.pieza_url ? <a href={a.pieza_url} target="_blank" rel="noreferrer" className="font-mono text-primary underline">{a.pieza_url}</a> : <span className="text-muted-foreground">Sin enlace a la pieza.</span>}
            {" "}<button onClick={() => setEditUrl(true)} className="text-primary hover:underline">{a.pieza_url ? "Editar" : "Añadir enlace"}</button>
          </p>
        )}
        {a.estado !== "pendiente" && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {a.estado_actualizado_en && <span>Valorada {hace(a.estado_actualizado_en)} por {a.estado_por}</span>}
            <button onClick={() => onValorar("pendiente")} className="text-primary underline-offset-2 hover:underline">Marcar como pendiente</button>
          </p>
        )}
      </div>
    </article>
  );
}

/** Medios que ya están en Discover: los dos primeros titulares a la vista y el resto plegado. */
function Competencia({ a }: { a: Alerta }) {
  const [abierto, setAbierto] = useState(false);
  if (sinDatosDiscover(a)) return <p className="text-sm text-muted-foreground">Sin datos de Discover todavía.</p>;
  if (a.medios_discover === 0) return <p className="text-sm text-muted-foreground">Ningún medio ha llegado todavía a Discover con este tema.</p>;
  const titulares = a.titulares_seo;
  if (!titulares.length) {
    return <p className="text-sm">{a.medios_lista.length ? a.medios_lista.join(", ") : `${a.medios_discover} ${a.medios_discover === 1 ? "medio" : "medios"}`}<span className="text-muted-foreground"> · sin titulares todavía</span></p>;
  }
  const conTitular = new Set(titulares.map((t) => t.medio));
  const sinTitular = a.medios_lista.filter((m) => !conTitular.has(m));
  const ocultos = [...titulares.slice(2).map((t) => t.medio), ...sinTitular];
  return (
    <>
      <ul className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3">
        {(abierto ? titulares : titulares.slice(0, 2)).map((t, i) => (
          <li key={i} className="col-span-full grid grid-cols-subgrid py-1.5 text-sm"><span className="max-w-40 truncate font-mono text-xs leading-5 text-muted-foreground" title={t.medio}>{t.medio}</span><span>{t.titular}</span></li>
        ))}
      </ul>
      {abierto && sinTitular.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Sin titular todavía: {sinTitular.join(", ")}</p>}
      {ocultos.length > 0 && (
        <Pliegue abierto={abierto} onCambio={() => setAbierto((v) => !v)} abrir={`Ver ${ocultos.length} ${ocultos.length === 1 ? "medio" : "medios"} más`} cerrar="Ver solo los dos primeros" resumen={ocultos.join(", ")} />
      )}
    </>
  );
}

/**
 * Una fuente con señal: el nombre a la izquierda y el dato al lado. La lista es una tabla (subgrid): la columna de los
 * nombres mide lo que el más largo de esa ficha, así el dato queda cerca y las filas, alineadas.
 */
function Fuente({ nombre, enlace, children }: { nombre: string; enlace?: ReactNode; children: ReactNode }) {
  return (
    <li className="col-span-full grid grid-cols-subgrid items-baseline py-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{nombre}</span>
      <span className="min-w-0">{children}</span>
      {enlace && <span>{enlace}</span>}
    </li>
  );
}
