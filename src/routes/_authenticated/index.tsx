import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { listAlertas, valorar } from "@/lib/alertasRepo";
import { desdePeriodo, claveDia } from "@/lib/fechas";
import { kpis } from "@/lib/metricas";
import type { Alerta, Estado, Prioridad } from "@/lib/types";
import { Selector } from "@/components/radar/ui";
import { usePanelEmail } from '@/lib/panelAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Detalle } from "@/components/radar/Detalle";
import { Leyenda, PrimerosPasos } from "@/components/radar/Ayuda";
import { useServerFn } from "@tanstack/react-start";
import { esAdmin as leerEsAdmin } from "@/lib/configRepo";
import { listarDescartes } from "@/lib/descartes.functions";
import { diaMadrid, OPCIONES_SENAL, pasaSenal, type FiltroSenal } from "@/lib/descartes";
import { AvisoDescartes, SelectorVistas, VistaDescartes, VistaTodas, type Vista } from "@/components/radar/Descartes";
import { ContenidoAlerta } from "@/components/radar/ItemAlerta";
import { leerAutoridad } from "@/lib/autoridad.functions";
import { AutoridadProvider } from "@/components/radar/Autoridad";

export const Route = createFileRoute("/_authenticated/")({
  ssr: false,
  // «?alerta=123» abre esa alerta (lo usa «Ver su alerta» en Discover ahora).
  validateSearch: (s: Record<string, unknown>): { alerta?: number } => {
    const n = Number(s["alerta"]);
    return Number.isInteger(n) && n > 0 ? { alerta: n } : {};
  },
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

export function Index() {
  const email = usePanelEmail();
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [prio, setPrio] = useState<"todas" | Prioridad>("todas");
  const [estado, setEstado] = useState<"todos" | Estado>("todos");
  // «?alerta=123» (desde Discover ahora): se lee de la dirección para no depender del enrutador.
  const [sel, setSel] = useState<number | null>(() => {
    const n = typeof window === "undefined" ? NaN : Number(new URLSearchParams(window.location.search).get("alerta"));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  // Vistas: «Alertas», «Descartadas por la IA» (lo que la IA dejó fuera, para revisarlo) y «Todas».
  const [vista, setVista] = useState<Vista>("alertas");
  const [senal, setSenal] = useState<FiltroSenal>("todas");
  const [revision, setRevision] = useState<"todos" | "marcados" | "sin_marcar">("todos");
  const leerDescartes = useServerFn(listarDescartes);
  const { data: admin = false } = useQuery({ queryKey: ["es_admin"], queryFn: leerEsAdmin });
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  const qc = useQueryClient();
  const key = ["alertas", periodo];
  const { data = [], isLoading, isError } = useQuery({ queryKey: key, queryFn: () => listAlertas(desdePeriodo(periodo)) });
  // Se ven todos los descartes, fuertes y con poca señal (se distinguen por color); el filtro «Señal» los separa.
  const qd = useQuery({
    queryKey: ["descartes", periodo],
    queryFn: () => { const d = desdePeriodo(periodo); return leerDescartes({ data: { desde: d ? diaMadrid(d) : undefined, todos: true } }); },
    staleTime: 60_000,
  });
  // Autoridad en Discover (Search Console): una sola petición para todas las alertas del periodo. Si falla o no hay datos cargados, no se enseña.
  const leerAut = useServerFn(leerAutoridad);
  const entidades = useMemo(() => [...new Set(data.map((a) => a.entidad))].sort(), [data]);
  const qa = useQuery({ queryKey: ["autoridad", entidades], queryFn: () => leerAut({ data: { entidades } }), enabled: entidades.length > 0, staleTime: 10 * 60_000, retry: false });
  const descartes = (qd.data ?? []).filter((d) => pasaSenal(d, senal) && (revision === "todos" || (revision === "marcados" ? !!d.veredicto : !d.veredicto)));

  const k = useMemo(() => kpis(data, claveDia, claveDia(new Date())), [data]);
  const visibles = data.filter((a) => (prio === "todas" || a.prioridad === prio) && (estado === "todos" || a.estado === estado));
  const actual = visibles.find((a) => a.id === sel) ?? visibles[0];
  const filtrosActivos = prio !== "todas" || estado !== "todos" || periodo !== "7d" || senal !== "todas" || revision !== "todos";
  const restablecer = () => { setPrio("todas"); setEstado("todos"); setPeriodo("7d"); setSenal("todas"); setRevision("todos"); };

  async function onValorar(a: Alerta, nuevo: Estado, pieza_url: string | null = null) {
    const cambios = { estado: nuevo, pieza_url: nuevo === "publicada" ? pieza_url : null, estado_actualizado_en: new Date().toISOString(), estado_por: email };
    const prev = qc.getQueryData<Alerta[]>(key);
    qc.setQueryData<Alerta[]>(key, (l) => l?.map((x) => (x.id === a.id ? { ...x, ...cambios } : x)));
    try { const saved = await valorar(a.id, cambios); qc.setQueryData<Alerta[]>(key, l => l?.map(x => x.id === a.id ? saved : x)); }
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
          <h1 className="tracking-tight text-xl font-semibold">Radar Discover</h1>
          <span className="text-xs text-muted-foreground">prototipo</span>
          <span className="ml-auto break-all text-xs text-muted-foreground">Usuario: {email}</span>
          <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}>Cerrar sesión</Button>
          <button onClick={() => setDark((d) => !d)} aria-label={dark ? "Modo claro" : "Modo oscuro"} className="rounded-md border p-1.5 hover:bg-muted">
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </div>
      </header>

      <AutoridadProvider value={qa.data ?? null}>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="tracking-tight text-3xl font-semibold">Alertas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Qué empieza a subir antes de llegar a Discover · España · X, Google Trends y Wikipedia</p>
        <Leyenda />
        <PrimerosPasos />
        <SelectorVistas vista={vista} onCambio={setVista} cuentas={{ alertas: isLoading ? null : visibles.length, descartes: qd.isLoading ? null : descartes.length, todas: isLoading || qd.isLoading ? null : visibles.length + descartes.length }} />
        {vista === "descartes" && <AvisoDescartes />}

        {vista !== "descartes" && <section aria-label="Indicadores" className="mt-4 grid grid-cols-2 divide-x divide-y border bg-card lg:grid-cols-4 lg:divide-y-0">
          <Kpi titulo="Alertas hoy" valor={String(k.hoy)} ok={k.hoy >= 3 && k.hoy <= 8} sub={`${k.pendientesHoy} pendientes de valorar · objetivo 3–8 al día`} />
          <Kpi titulo="Útiles" valor={pct(k.pctUtiles)} ok={k.pctUtiles == null ? null : k.pctUtiles >= 50} sub="sobre valoradas · objetivo ≥ 50 %" />
          <Kpi titulo="Acabaron en pieza" valor={pct(k.pctPublicadas)} ok={k.pctPublicadas == null ? null : k.pctPublicadas >= 20} sub="sobre el total · objetivo ≥ 20 %" />
          <Kpi titulo="Llegada" valor={k.medianaLlegada == null ? "—" : k.medianaLlegada.toLocaleString("es-ES")} ok={k.medianaLlegada == null ? null : k.medianaLlegada <= 2} sub={k.medianaLlegada == null ? "sin datos de Discover todavía · objetivo ≤ 2" : "mediana de medios ya en Discover · objetivo ≤ 2"} />
        </section>}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border bg-card px-3 py-2">
          {vista !== "descartes" && <Selector id="f-prioridad" label="Prioridad" value={prio} onChange={setPrio} options={[{ value: "todas", label: "Todas" }, { value: "alta", label: "Alta" }, { value: "media", label: "Media" }]} />}
          {vista !== "descartes" && <Selector id="f-estado" label="Estado" value={estado} onChange={setEstado} options={[{ value: "todos", label: "Todos" }, { value: "pendiente", label: "Pendiente" }, { value: "util", label: "Útil" }, { value: "ruido", label: "Ruido" }, { value: "publicada", label: "Publicada" }]} />}
          <Selector id="f-periodo" label="Periodo" value={periodo} onChange={setPeriodo} options={[{ value: "hoy", label: "Hoy" }, { value: "7d", label: "Últimos 7 días" }, { value: "30d", label: "Últimos 30 días" }, { value: "todo", label: "Todo" }]} />
          {vista === "descartes" && <Selector id="f-senal" label="Señal" value={senal} onChange={setSenal} options={OPCIONES_SENAL} />}
          {vista === "descartes" && <Selector id="f-revision" label="Revisión" value={revision} onChange={setRevision} options={[{ value: "todos", label: "Todos" }, { value: "marcados", label: "Marcados" }, { value: "sin_marcar", label: "Sin marcar" }]} />}
          <span className="ml-auto flex items-center gap-4">
            <span className="font-mono text-xs text-muted-foreground">{vista === "descartes" ? `${descartes.length} descartes` : `${visibles.length} de ${data.length}`}</span>
            {filtrosActivos && (
              <button onClick={restablecer} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Restablecer filtros
              </button>
            )}
          </span>
        </div>

        {vista === "descartes" ? (
          <VistaDescartes descartes={descartes} cargando={qd.isLoading} error={qd.isError} esAdmin={admin} />
        ) : vista === "todas" ? (
          <VistaTodas alertas={visibles} descartes={descartes} esAdmin={admin} onValorar={(a, e, u) => onValorar(a, e, u ?? null)} />
        ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 border bg-card">
            {isError ? <p role="alert" className="p-4 text-sm text-destructive">No se pudieron cargar las alertas. Inténtalo de nuevo.</p>
              : isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando alertas…</p>
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
                        <ContenidoAlerta a={a} />
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>
          <div className="min-w-0">{actual ? <Detalle a={actual} onValorar={(e, u) => onValorar(actual, e, u)} /> : null}</div>
        </div>
        )}
      </main>
      </AutoridadProvider>
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
