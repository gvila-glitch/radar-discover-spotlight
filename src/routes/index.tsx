import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listAlertas, valorar, USUARIO_DEMO } from "@/lib/alertasRepo";
import { desdePeriodo, claveDia, horaOFecha } from "@/lib/fechas";
import { kpis } from "@/lib/metricas";
import type { Alerta, Estado, Prioridad } from "@/lib/types";
import { EstadoTag, LlegadaTag, PrioridadTag, Segmented } from "@/components/radar/ui";
import { Detalle } from "@/components/radar/Detalle";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Alertas · Radar Discover" },
      { name: "description", content: "Panel interno para valorar las alertas del Radar Discover y medir si funcionan." },
      { property: "og:title", content: "Alertas · Radar Discover" },
      { property: "og:description", content: "Panel interno para valorar las alertas del Radar Discover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Periodo = "hoy" | "7d" | "30d" | "todo";

function Index() {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [prio, setPrio] = useState<"todas" | Prioridad>("todas");
  const [estado, setEstado] = useState<"todos" | Estado>("todos");
  const [sel, setSel] = useState<number | null>(null);
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  const qc = useQueryClient();
  const key = ["alertas", periodo];
  const { data = [], isLoading } = useQuery({ queryKey: key, queryFn: () => listAlertas(desdePeriodo(periodo)) });

  const k = useMemo(() => kpis(data, claveDia, claveDia(new Date())), [data]);
  const visibles = data.filter((a) => (prio === "todas" || a.prioridad === prio) && (estado === "todos" || a.estado === estado));
  const actual = visibles.find((a) => a.id === sel) ?? visibles[0];

  async function onValorar(a: Alerta, nuevo: Estado, pieza_url: string | null = null) {
    const cambios = { estado: nuevo, pieza_url: nuevo === "publicada" ? pieza_url : null, estado_actualizado_en: new Date().toISOString(), estado_por: USUARIO_DEMO };
    const prev = qc.getQueryData<Alerta[]>(key);
    qc.setQueryData<Alerta[]>(key, (l) => l?.map((x) => (x.id === a.id ? { ...x, ...cambios } : x)));
    try { await valorar(a.id, cambios); }
    catch { qc.setQueryData(key, prev); toast.error("No se pudo guardar la valoración. Inténtalo de nuevo."); }
    finally { qc.invalidateQueries({ queryKey: ["alertas"], refetchType: "none" }); }
  }

  const listRef = useRef<HTMLUListElement>(null);
  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = visibles.findIndex((a) => a.id === actual?.id);
    const n = visibles[Math.min(visibles.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (n) { setSel(n.id); listRef.current?.querySelector<HTMLElement>(`[data-id="${n.id}"]`)?.focus(); }
  }

  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)} %`);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="font-serif text-xl font-semibold">Radar Discover</h1>
          <span className="text-xs text-muted-foreground">prototipo</span>
          <span className="ml-auto font-mono text-xs text-warn">Modo demo · datos de ejemplo</span>
          <span className="text-xs text-muted-foreground">Usuario: {USUARIO_DEMO}</span>
          <button onClick={() => setDark((d) => !d)} aria-label={dark ? "Modo claro" : "Modo oscuro"} className="rounded-md border p-1.5 hover:bg-muted">
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="font-serif text-3xl font-semibold">Alertas</h2>

        <section aria-label="Indicadores" className="mt-4 grid grid-cols-2 divide-x divide-y border bg-card lg:grid-cols-4 lg:divide-y-0">
          <Kpi titulo="Alertas hoy" valor={String(k.hoy)} ok={k.hoy >= 3 && k.hoy <= 8} sub={`${k.pendientesHoy} pendientes de valorar · objetivo 3–8 al día`} />
          <Kpi titulo="Útiles" valor={pct(k.pctUtiles)} ok={k.pctUtiles == null ? null : k.pctUtiles >= 50} sub="sobre valoradas · objetivo ≥ 50 %" />
          <Kpi titulo="Acabaron en pieza" valor={pct(k.pctPublicadas)} ok={k.pctPublicadas == null ? null : k.pctPublicadas >= 20} sub="sobre el total · objetivo ≥ 20 %" />
          <Kpi titulo="Llegada" valor={k.medianaLlegada == null ? "—" : k.medianaLlegada.toLocaleString("es-ES")} ok={k.medianaLlegada == null ? null : k.medianaLlegada <= 2} sub="mediana de medios ya en Discover · objetivo ≤ 2" />
        </section>

        <div className="mt-5 flex flex-wrap gap-4">
          <Segmented label="Prioridad" value={prio} onChange={setPrio} options={[{ value: "todas", label: "Todas" }, { value: "alta", label: "Alta" }, { value: "media", label: "Media" }]} />
          <Segmented label="Estado" value={estado} onChange={setEstado} options={[{ value: "todos", label: "Todos" }, { value: "pendiente", label: "Pendiente" }, { value: "util", label: "Útil" }, { value: "ruido", label: "Ruido" }, { value: "publicada", label: "Publicada" }]} />
          <Segmented label="Periodo" value={periodo} onChange={setPeriodo} options={[{ value: "hoy", label: "Hoy" }, { value: "7d", label: "Últimos 7 días" }, { value: "30d", label: "Últimos 30 días" }, { value: "todo", label: "Todo" }]} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="border bg-card">
            {isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando alertas…</p>
              : visibles.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No hay alertas con estos filtros.</p>
              : (
                <ul ref={listRef} role="listbox" aria-label="Alertas" onKeyDown={onKey} className="divide-y">
                  {visibles.map((a) => {
                    const on = a.id === actual?.id;
                    return (
                      <li key={a.id} data-id={a.id} role="option" aria-selected={on} tabIndex={on ? 0 : -1}
                        onClick={() => setSel(a.id)}
                        className={cn("flex cursor-pointer gap-3 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          on ? "bg-accent shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted")}>
                        <span className="w-12 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">{horaOFecha(a.creada_en)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-serif font-semibold">{a.entidad}</div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.contexto}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1"><PrioridadTag p={a.prioridad} /><LlegadaTag medios={a.medios_discover} /><EstadoTag e={a.estado} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
          <div>{actual ? <Detalle a={actual} onValorar={(e, u) => onValorar(actual, e, u)} /> : null}</div>
        </div>
      </main>
    </div>
  );
}

function Kpi({ titulo, valor, sub, ok }: { titulo: string; valor: string; sub: string; ok: boolean | null }) {
  return (
    <div className="p-4">
      <div className="text-sm text-muted-foreground">{titulo}</div>
      <div className={cn("mt-1 font-mono text-3xl font-medium", ok == null ? "" : ok ? "text-ok" : "text-bad")}>{valor}</div>
      <div className="mt-1 text-xs text-muted-foreground">{ok != null && <span className={ok ? "text-ok" : "text-bad"}>{ok ? "✓ " : "✗ "}</span>}{sub}</div>
    </div>
  );
}
