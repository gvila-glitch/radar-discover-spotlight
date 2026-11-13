import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Alerta, Estado } from "@/lib/types";
import { fechaLarga, hace, hora24, esHoy } from "@/lib/fechas";
import { LlegadaTag, PrioridadTag } from "./ui";

export function Detalle({ a, onValorar }: { a: Alerta; onValorar: (estado: Estado, pieza_url?: string | null) => void }) {
  const [editUrl, setEditUrl] = useState(false);
  const [url, setUrl] = useState("");
  const urlValida = url === "" || /^https:\/\/\S+$/.test(url);
  useEffect(() => { setEditUrl(false); setUrl(a.pieza_url ?? ""); }, [a.id, a.pieza_url]);

  const btn = (estado: Estado, label: string, onClick?: () => void) => (
    <button aria-pressed={a.estado === estado} onClick={onClick ?? (() => onValorar(estado))}
      className={cn("rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        a.estado === estado ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
      {label}
    </button>
  );

  return (
    <article className="border bg-card p-6" aria-label={`Detalle: ${a.entidad}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <PrioridadTag p={a.prioridad} /> <LlegadaTag medios={a.medios_discover} />
        <span className="font-mono">{fechaLarga(a.creada_en)}</span><span>·</span><span>{hace(a.creada_en)}</span>
      </div>
      <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight">{a.entidad}</h2>
      <p className="mt-1 text-muted-foreground">{a.contexto}</p>

      <Seccion titulo="Señal">
        <div className="grid divide-y border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Bloque t="X (España)">{a.x_posicion ? <><span className="font-mono">#{a.x_posicion}</span> desde las <span className="font-mono">{a.x_desde && (esHoy(a.x_desde) ? hora24(a.x_desde) : fechaLarga(a.x_desde))}</span></> : "No"}</Bloque>
          <Bloque t="Volumen en Google">{a.trends_activo && a.trends_crecimiento ? <span className="font-mono">{a.trends_crecimiento}</span> : "Todavía no"}</Bloque>
          <Bloque t="Discover">{a.medios_discover > 0 ? <><span className="font-mono">{a.medios_discover}</span> {a.medios_discover === 1 ? "medio" : "medios"}<div className="mt-1 text-xs text-muted-foreground">{a.medios_lista.join(", ")}</div></> : "Nadie ha llegado aún"}</Bloque>
        </div>
      </Seccion>

      <div className="mt-6 border-y border-foreground/80 py-3">
        <div className="text-xs text-muted-foreground">Ángulo sugerido <span className="text-foreground">→ {a.seccion_sugerida}</span></div>
        <p className="mt-1 font-serif text-lg leading-snug">{a.angulo}</p>
      </div>

      <Seccion titulo="Lo que han sacado los medios de referencia SEO">
        {a.titulares_seo.length ? (
          <ul className="divide-y border-y">
            {a.titulares_seo.map((t, i) => (
              <li key={i} className="flex gap-3 py-2 text-sm"><span className="w-20 shrink-0 text-muted-foreground">{t.medio}</span><span>{t.titular}</span></li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Ningún medio de referencia ha publicado todavía sobre esto.</p>}
      </Seccion>

      <Seccion titulo="Por qué es afín"><p className="text-sm">{a.motivo_afinidad}</p></Seccion>

      <div className="mt-6 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {btn("util", "Útil")}
          {btn("ruido", "Ruido")}
          {btn("publicada", "Publicamos", () => { onValorar("publicada", a.estado === "publicada" ? a.pieza_url : null); setEditUrl(true); })}
          {a.estado !== "pendiente" && (
            <button onClick={() => onValorar("pendiente")} className="ml-auto text-sm text-primary underline-offset-2 hover:underline">Marcar como pendiente</button>
          )}
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
        {a.estado_actualizado_en && (
          <p className="mt-4 text-xs text-muted-foreground">Valorada {hace(a.estado_actualizado_en)} por {a.estado_por}</p>
        )}
      </div>
    </article>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section className="mt-5"><h3 className="mb-2 text-sm font-semibold">{titulo}</h3>{children}</section>;
}
function Bloque({ t, children }: { t: string; children: React.ReactNode }) {
  return <div className="p-3 text-sm"><div className="mb-1 text-xs text-muted-foreground">{t}</div>{children}</div>;
}
