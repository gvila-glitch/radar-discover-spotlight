import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { Ban, ChevronDown, ChevronLeft, ChevronRight, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { guardarMotivoRuido, listAlertas, valorar } from "@/lib/alertasRepo";
import { anadirNoCubrimos } from "@/lib/ruido.functions";
import type { MotivoRuido } from "@/lib/ruido";
import { desdePeriodo, esHoy } from "@/lib/fechas";
import { nombreVisible } from "@/lib/metricas";
import type { Alerta, Estado, Prioridad } from "@/lib/types";
import { ESTADO_LABEL, Selector } from "@/components/radar/ui";
import { usePanelEmail } from '@/lib/panelAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Detalle } from "@/components/radar/Detalle";
import { EnlaceComoSeUsa, PrimerosPasos } from "@/components/radar/Ayuda";
import { usePrimerosPasos } from "@/components/radar/usePrimerosPasos";
import { useFichaMovil } from "@/components/radar/useFichaMovil";
import { avisarRuido } from "@/components/radar/avisarRuido";
import { useServerFn } from "@tanstack/react-start";
import { esAdmin as leerEsAdmin } from "@/lib/configRepo";
import { listarDescartes } from "@/lib/descartes.functions";
import { diaMadrid, OPCIONES_SENAL, pasaSenal, type FiltroSenal } from "@/lib/descartes";
import { OPCIONES_AUTORIDAD, OPCIONES_ESTADO, OPCIONES_FUENTE, pasaAutoridad, pasaEstado, pasaFuente, type FiltroAutoridad, type FiltroEstado, type FiltroFuente } from "@/lib/filtrosAlertas";
import { SelectorVistas, VistaDescartes, VistaTodas, type Vista } from "@/components/radar/Descartes";
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
const OPCIONES_PERIODO: { value: Periodo; label: string }[] = [{ value: "hoy", label: "Hoy" }, { value: "7d", label: "Últimos 7 días" }, { value: "30d", label: "Últimos 30 días" }, { value: "todo", label: "Todo" }];

export function Index() {
  const email = usePanelEmail();
  // Al entrar se ve lo de hoy.
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [prio, setPrio] = useState<"todas" | Prioridad>("todas");
  // Lo marcado como ruido sale de la lista (sigue contando para medir el radar; se ve en Estado › Ruido).
  const [estado, setEstado] = useState<FiltroEstado>("sin_ruido");
  const [fuente, setFuente] = useState<FiltroFuente>("todas");
  const [autoridad, setAutoridad] = useState<FiltroAutoridad>("todas");
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
  const pasos = usePrimerosPasos();
  // En el móvil: la ficha a pantalla completa (el botón de atrás vuelve a la lista) y los filtros tras un botón.
  const ficha = useFichaMovil((id) => setSel(id));
  const fichaRef = useRef<HTMLDivElement>(null);
  const [filtrosMovil, setFiltrosMovil] = useState(false);
  const [masFiltros, setMasFiltros] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);

  const qc = useQueryClient();
  // Se piden al menos 7 días: al pasar de «Hoy» a «Últimos 7 días» la lista sale sin volver a cargar.
  const periodoConsulta: Periodo = periodo === "hoy" ? "7d" : periodo;
  const key = ["alertas", periodoConsulta];
  const { data = [], isLoading, isError } = useQuery({ queryKey: key, queryFn: () => listAlertas(desdePeriodo(periodoConsulta)) });
  const delPeriodo = periodo === "hoy" ? data.filter((a) => esHoy(a.creada_en)) : data;
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

  const visibles = delPeriodo.filter((a) => (prio === "todas" || a.prioridad === prio) && pasaEstado(a.estado, estado) && pasaFuente(a, fuente) && pasaAutoridad(qa.data?.temas[a.entidad]?.nivel, autoridad));
  const actual = visibles.find((a) => a.id === sel) ?? visibles[0];
  const filtrosActivos = prio !== "todas" || estado !== "sin_ruido" || fuente !== "todas" || autoridad !== "todas" || periodo !== "hoy" || senal !== "todas" || revision !== "todos";
  const restablecer = () => { setPrio("todas"); setEstado("sin_ruido"); setFuente("todas"); setAutoridad("todas"); setPeriodo("hoy"); setSenal("todas"); setRevision("todos"); };

  // La siguiente de la lista (o la anterior, si era la última): se selecciona cuando la actual deja de verse.
  function siguienteDe(a: Alerta): Alerta | undefined {
    const i = visibles.findIndex((x) => x.id === a.id);
    return visibles[i + 1] ?? visibles[i - 1];
  }

  async function onValorar(a: Alerta, nuevo: Estado, pieza_url: string | null = null) {
    // Si con el filtro de Estado deja de verse (p. ej., ruido con «Todos menos ruido»), se pasa a la siguiente.
    const saleDeLista = !pasaEstado(nuevo, estado);
    const pasaALaSiguiente = saleDeLista && a.id === actual?.id;
    if (pasaALaSiguiente) setSel(siguienteDe(a)?.id ?? null);
    // En el móvil, si la alerta sale de la lista, se vuelve a la lista (con el aviso de «Deshacer»).
    if (pasaALaSiguiente && ficha.abierta) ficha.cerrar();
    const cambios = { estado: nuevo, pieza_url: nuevo === "publicada" ? pieza_url : null, estado_actualizado_en: new Date().toISOString(), estado_por: email };
    const prev = qc.getQueryData<Alerta[]>(key);
    qc.setQueryData<Alerta[]>(key, (l) => l?.map((x) => (x.id === a.id ? { ...x, ...cambios } : x)));
    try {
      const saved = await valorar(a.id, cambios); qc.setQueryData<Alerta[]>(key, l => l?.map(x => x.id === a.id ? saved : x));
      // Si deja de ser ruido, su motivo ya no vale.
      if (nuevo !== "ruido" && a.motivo_ruido) { try { const sinMotivo = await guardarMotivoRuido(a.id, null); qc.setQueryData<Alerta[]>(key, l => l?.map(x => x.id === a.id ? sinMotivo : x)); } catch { /* se queda; no afecta a la valoración */ } }
      // Aviso con «Deshacer» y, opcional, el motivo con un clic.
      if (nuevo === "ruido" && a.estado !== "ruido") avisarRuido({ nombre: nombreVisible(a.entidad), saleDeLista, onDeshacer: () => void deshacer(a), onMotivo: (m) => void onMotivo(a, m) });
    }
    catch { qc.setQueryData(key, prev); if (pasaALaSiguiente) setSel(a.id); toast.error("No se pudo guardar la valoración. Inténtalo de nuevo."); }
    finally { qc.invalidateQueries({ queryKey: ["alertas"], refetchType: "none" }); }
  }

  // «Deshacer»: vuelve al estado de antes (quitando el motivo, si se eligió en el aviso) y la deja seleccionada.
  async function deshacer(antes: Alerta) {
    const ahora = qc.getQueryData<Alerta[]>(key)?.find((x) => x.id === antes.id);
    setSel(antes.id);
    await onValorar({ ...antes, motivo_ruido: ahora?.motivo_ruido ?? null }, antes.estado, antes.pieza_url);
  }

  // Descarte rápido desde la lista (botón «Es ruido» al pasar el ratón o tecla R). Solo para las pendientes, para no
  // pisar sin querer una valoración ya hecha; esas se cambian desde la ficha.
  function ruidoRapido(a: Alerta) {
    if (a.estado !== "pendiente") { toast(`Ya está valorada como «${ESTADO_LABEL[a.estado]}». Si hace falta, cámbiala desde la ficha.`); return; }
    void onValorar(a, "ruido");
  }

  async function onMotivo(a: Alerta, motivo: MotivoRuido | null) {
    const prev = qc.getQueryData<Alerta[]>(key);
    qc.setQueryData<Alerta[]>(key, (l) => l?.map((x) => (x.id === a.id ? { ...x, motivo_ruido: motivo } : x)));
    try { const saved = await guardarMotivoRuido(a.id, motivo); qc.setQueryData<Alerta[]>(key, l => l?.map(x => x.id === a.id ? saved : x)); }
    catch { qc.setQueryData(key, prev); toast.error("No se pudo guardar el motivo. Inténtalo de nuevo."); }
  }

  const anadirNo = useServerFn(anadirNoCubrimos);
  async function onNoCubrimos(a: Alerta, tipo: "criterio" | "nombre", texto: string): Promise<boolean> {
    try {
      const fila = await anadirNo({ data: { id: a.id, tipo, texto } });
      qc.setQueryData<Alerta[]>(key, (l) => l?.map((x) => (x.id === a.id ? { ...x, ...fila } : x)));
      toast.success("Guardado en Configuración. Se aplica desde la próxima tanda.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error && e.message.includes("caracteres") ? e.message : "No se pudo guardar en Configuración.");
      return false;
    }
  }

  const listRef = useRef<HTMLUListElement>(null);
  // ‹ › de la ficha en el móvil: otra alerta sin volver a la lista, empezando por arriba.
  const posicion = visibles.findIndex((a) => a.id === actual?.id);
  function irA(a: Alerta | undefined) {
    if (!a) return;
    setSel(a.id); ficha.abrir(a.id);
    const el = fichaRef.current; if (el && typeof el.scrollTo === "function") el.scrollTo({ top: 0 });
  }
  const nFiltros = [prio !== "todas", estado !== "sin_ruido", fuente !== "todas", autoridad !== "todas", periodo !== "hoy", senal !== "todas", revision !== "todos"].filter(Boolean).length;
  const resumenFiltros = [OPCIONES_PERIODO.find((o) => o.value === periodo)?.label, vista === "descartes" ? `${descartes.length} descartes` : `${OPCIONES_ESTADO.find((o) => o.value === estado)?.label} · ${visibles.length} de ${delPeriodo.length}`].join(" · ");
  function onKey(e: React.KeyboardEvent) {
    if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (!actual) return;
      e.preventDefault();
      ruidoRapido(actual);
      // La seleccionada puede haber cambiado (la siguiente): el foco va con ella para seguir con las flechas y la R.
      setTimeout(() => listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(), 0);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = visibles.findIndex((a) => a.id === actual?.id);
    const n = visibles[Math.min(visibles.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (n) { setSel(n.id); listRef.current?.querySelector<HTMLElement>(`[data-id="${n.id}"]`)?.focus(); }
  }

  // Arriba, la tarea (cuántas quedan por valorar en el periodo elegido), no la descripción del radar.
  const porValorar = delPeriodo.filter((a) => a.estado === "pendiente").length;
  const fraseTarea = isLoading || isError ? null
    : porValorar > 0 ? <>Tienes <b>{porValorar} {porValorar === 1 ? "alerta" : "alertas"} por valorar</b>. {porValorar === 1 ? "Ábrela" : "Abre cada una"} y decide si nos sirve.</>
    : delPeriodo.length > 0 ? "Todo valorado. Las alertas nuevas aparecerán aquí."
    : "Aún no hay alertas que valorar.";
  // «Más filtros»: Autoridad y Fuente, plegados. Si alguno está en uso, se ven siempre (para no esconder un filtro activo).
  const nMasFiltros = [autoridad !== "todas", fuente !== "todas"].filter(Boolean).length;
  const verMasFiltros = masFiltros || nMasFiltros > 0;

  // Cabecera de la caja de la lista, igual en las tres pestañas: las pestañas y, debajo, los filtros de esa pestaña.
  const cabeceraLista = (
    <div className="border-b">
      <SelectorVistas vista={vista} onCambio={setVista} cuentas={{ alertas: isLoading ? null : visibles.length, descartes: qd.isLoading ? null : descartes.length, todas: isLoading || qd.isLoading ? null : visibles.length + descartes.length }} />
      {/* En el móvil, los filtros van tras un botón para que la lista se vea enseguida. */}
      <div className="flex items-center gap-2 border-t px-3 py-2 lg:hidden">
        <button type="button" aria-expanded={filtrosMovil} onClick={() => setFiltrosMovil((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm font-medium">
          <SlidersHorizontal aria-hidden className="size-4" />Filtros{nFiltros > 0 && ` (${nFiltros})`}
        </button>
        <span className="text-xs text-muted-foreground">{resumenFiltros}</span>
      </div>
      <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-muted/60 px-3 py-2", !filtrosMovil && "max-lg:hidden")}>
        <Selector id="f-periodo" label="Periodo" value={periodo} onChange={setPeriodo} options={OPCIONES_PERIODO} />
        {vista !== "descartes" && <>
          <Selector id="f-estado" label="Estado" value={estado} onChange={setEstado} options={OPCIONES_ESTADO} />
          <Selector id="f-prioridad" label="Prioridad" value={prio} onChange={setPrio} options={[{ value: "todas", label: "Todas" }, { value: "alta", label: "Alta" }, { value: "media", label: "Media" }]} />
          <button type="button" aria-expanded={verMasFiltros} onClick={() => setMasFiltros((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            <SlidersHorizontal aria-hidden className="size-3.5" />Más filtros{nMasFiltros > 0 && ` (${nMasFiltros})`}
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", verMasFiltros && "rotate-180")} />
          </button>
          {verMasFiltros && qa.data?.periodo && <Selector id="f-autoridad" label="Autoridad" value={autoridad} onChange={setAutoridad} options={OPCIONES_AUTORIDAD} />}
          {verMasFiltros && <Selector id="f-fuente" label="Fuente" value={fuente} onChange={setFuente} options={OPCIONES_FUENTE} />}
        </>}
        {vista === "descartes" && <>
          <Selector id="f-senal" label="Señal" value={senal} onChange={setSenal} options={OPCIONES_SENAL} />
          <Selector id="f-revision" label="Revisión" value={revision} onChange={setRevision} options={[{ value: "todos", label: "Todos" }, { value: "marcados", label: "Marcados" }, { value: "sin_marcar", label: "Sin marcar" }]} />
        </>}
        <span className="ml-auto flex items-center gap-4">
          <span className="tabular-nums text-xs text-muted-foreground">{vista === "descartes" ? `${descartes.length} descartes` : `${visibles.length} de ${delPeriodo.length}`}</span>
          {filtrosActivos && (
            <button onClick={restablecer} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Restablecer filtros
            </button>
          )}
        </span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-caja bg-card">
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
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {fraseTarea && <span>{fraseTarea}</span>}
          <EnlaceComoSeUsa abiertos={pasos.abiertos} onPulsar={pasos.alternar} />
        </p>
        {pasos.abiertos && <PrimerosPasos onCerrar={pasos.cerrar} />}

        {vista === "descartes" ? (
          <VistaDescartes descartes={descartes} cargando={qd.isLoading} error={qd.isError} esAdmin={admin} cabecera={cabeceraLista} />
        ) : vista === "todas" ? (
          <VistaTodas alertas={visibles} descartes={descartes} esAdmin={admin} onValorar={(a, e, u) => onValorar(a, e, u ?? null)} onMotivo={onMotivo} onNoCubrimos={onNoCubrimos} cabecera={cabeceraLista} />
        ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0 self-start border border-caja bg-card">
            {cabeceraLista}
            {isError ? <p role="alert" className="p-4 text-sm text-destructive">No se pudieron cargar las alertas. Inténtalo de nuevo.</p>
              : isLoading ? <p className="p-4 text-sm text-muted-foreground">Cargando alertas…</p>
              : visibles.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{periodo === "hoy" && delPeriodo.length === 0 ? "Hoy todavía no hay alertas. Cambia el periodo para ver las anteriores." : "No hay alertas con estos filtros."}</p>
              : (<>
                <ul ref={listRef} role="listbox" aria-label="Alertas" aria-describedby="atajos-lista" onKeyDown={onKey} className="divide-y">
                  {visibles.map((a) => {
                    const on = a.id === actual?.id;
                    return (
                      <li key={a.id} data-id={a.id} role="option" aria-selected={on} tabIndex={on ? 0 : -1}
                        onClick={() => { setSel(a.id); ficha.abrir(a.id); }}
                        className={cn("group relative flex cursor-pointer gap-3 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          on ? "bg-accent shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-muted")}>
                        <ContenidoAlerta a={a} />
                        {/* Al pasar el ratón, «Es ruido» tapa las etiquetas de la fila (como la fecha en Gmail); fuera del botón, el clic selecciona. */}
                        {a.estado === "pendiente" && (
                          <div className="absolute inset-y-0 right-0 hidden w-32 items-center justify-end bg-inherit pr-3 group-hover:flex">
                            <button type="button" tabIndex={-1} title="Marcar como ruido (tecla R)" aria-label={`Marcar «${nombreVisible(a.entidad)}» como ruido`}
                              onClick={(e) => { e.stopPropagation(); ruidoRapido(a); }}
                              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-muted">
                              <Ban aria-hidden className="size-3.5 text-muted-foreground" />Es ruido
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p id="atajos-lista" className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground max-lg:hidden">
                  <Tecla>↑</Tecla><Tecla>↓</Tecla> cambiar de alerta <span aria-hidden>·</span> <Tecla>R</Tecla> marcar como ruido la seleccionada
                </p>
              </>)}
          </div>
          {/* En el móvil, la ficha solo se ve al pulsar una alerta, y entonces ocupa toda la pantalla. */}
          <div ref={fichaRef} data-ficha-movil={ficha.abierta ? "abierta" : "cerrada"}
            className={cn("min-w-0", ficha.abierta ? "max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:overflow-y-auto max-lg:bg-background" : "max-lg:hidden")}>
            {actual ? <>
              <div className="sticky top-0 z-20 flex items-center justify-between border-b bg-card px-3 py-2 lg:hidden">
                <button type="button" onClick={ficha.cerrar} aria-label="Volver a la lista" className="inline-flex items-center gap-0.5 py-1 text-sm font-medium text-primary"><ChevronLeft aria-hidden className="size-5" />Alertas</button>
                <span className="inline-flex items-center gap-1">
                  <button type="button" aria-label="Alerta anterior" disabled={posicion <= 0} onClick={() => irA(visibles[posicion - 1])} className="grid size-9 place-items-center rounded-md border disabled:opacity-40"><ChevronLeft aria-hidden className="size-4" /></button>
                  <span className="px-1 tabular-nums text-xs text-muted-foreground">{posicion + 1} de {visibles.length}</span>
                  <button type="button" aria-label="Alerta siguiente" disabled={posicion >= visibles.length - 1} onClick={() => irA(visibles[posicion + 1])} className="grid size-9 place-items-center rounded-md border disabled:opacity-40"><ChevronRight aria-hidden className="size-4" /></button>
                </span>
              </div>
              <Detalle a={actual} onValorar={(e, u) => onValorar(actual, e, u)} esAdmin={admin} onMotivo={(m) => onMotivo(actual, m)} onNoCubrimos={(t, x) => onNoCubrimos(actual, t, x)} />
            </> : null}
          </div>
        </div>
        )}
      </main>
      </AutoridadProvider>
    </div>
  );
}

function Tecla({ children }: { children: string }) {
  return <kbd className="rounded border border-b-2 bg-background px-1.5 py-px tabular-nums text-[11px] text-foreground">{children}</kbd>;
}
