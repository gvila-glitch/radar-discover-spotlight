import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Selector } from "@/components/radar/ui";
import {
  CajonFicha,
  LeyendaBurbujas,
  LeyendaMapa,
  MapaDiscover,
} from "@/components/radar/DiscoverMap";
import { leerDiscoverMap } from "@/lib/discoverMap.functions";
import { filtrarGrupos, ventanaValida, type Ventana } from "@/lib/discoverMap";
import { hora24 } from "@/lib/fechas";

export const Route = createFileRoute("/_authenticated/discover-map")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Discover Map · Radar Discover" },
      {
        name: "description",
        content: "Qué nombres están entrando en Discover ahora y cuántos medios los publican.",
      },
      { property: "og:title", content: "Discover Map · Radar Discover" },
      { property: "og:description", content: "Qué está entrando en Discover ahora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiscoverMapPagina,
});

function DiscoverMapPagina() {
  const [ventana, setVentana] = useState<Ventana>(6);
  const [soloSube, setSoloSube] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const leer = useServerFn(leerDiscoverMap);
  // Se calcula al abrir la sección o al pulsar «Actualizar»: no se pide solo cada pocos minutos (ahorra consumo).
  const q = useQuery({
    queryKey: ["discover-map", ventana],
    queryFn: () => leer({ data: { ventana } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const grupos = filtrarGrupos(q.data?.grupos ?? [], soloSube);
  const temas = grupos.flatMap((g) => g.temas);
  // La ficha solo se abre al pulsar una burbuja; si el tema deja de estar en el mapa, se cierra sola.
  const actual = sel ? temas.find((t) => t.id === sel) : undefined;
  const seleccionar = (id: string) => {
    setSel(id);
    if (soloSube && !temas.some((t) => t.id === id)) setSoloSube(false);
  };
  // Al cerrar, el foco vuelve a la burbuja que se había abierto (para quien usa el teclado).
  const cerrar = useCallback(() => {
    if (!sel) return;
    const id = sel;
    setSel(null);
    requestAnimationFrame(() =>
      document.querySelector<SVGGElement>(`[data-tema="${CSS.escape(id)}"]`)?.focus(),
    );
  }, [sel]);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3">
          <h1 className="tracking-tight text-xl font-semibold">Radar Discover</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="tracking-tight text-3xl font-semibold">Discover Map</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Qué está entrando en Discover ahora · España · News y Política
        </p>
        <LeyendaMapa />

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border bg-card px-3 py-2">
          <Selector
            id="f-ventana"
            label="Ventana"
            value={String(ventana)}
            onChange={(v) => setVentana(ventanaValida(Number(v)))}
            options={[
              { value: "1", label: "Última hora" },
              { value: "3", label: "Últimas 3 horas" },
              { value: "6", label: "Últimas 6 horas" },
            ]}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={soloSube}
              onCheckedChange={setSoloSube}
              aria-label="Solo lo que sube"
            />
            Solo lo que sube
          </label>
          <span className="ml-auto flex items-center gap-4">
            {q.data && (
              <span className="font-mono text-xs text-muted-foreground">
                Actualizado {hora24(q.data.generado)} · {q.data.articulos} artículos
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? "Actualizando…" : "Actualizar"}
            </Button>
          </span>
        </div>

        <div className="mt-5">
          {q.isError ? (
            <p role="alert" className="border bg-card p-4 text-sm text-destructive">
              No se pudo cargar el mapa. Inténtalo de nuevo.
            </p>
          ) : q.isLoading ? (
            <p className="border bg-card p-4 text-sm text-muted-foreground">Cargando el mapa…</p>
          ) : q.data && q.data.articulos === 0 ? (
            <p className="border bg-card p-4 text-sm text-muted-foreground">
              Snoop no ha enviado artículos en esta ventana. Prueba con una ventana más larga.
            </p>
          ) : grupos.length === 0 ? (
            <p className="border bg-card p-4 text-sm text-muted-foreground">
              {soloSube
                ? "Ahora mismo no hay ningún tema subiendo."
                : "Todavía no hay temas con varios medios en esta ventana."}
            </p>
          ) : (
            <div className="border bg-card p-4">
              <p className="mb-2 h-4 text-right text-xs text-muted-foreground">
                {actual ? "" : "Pulsa una burbuja para ver su ficha"}
              </p>
              <MapaDiscover
                grupos={grupos}
                seleccion={actual?.id}
                onSeleccion={seleccionar}
                onFondo={cerrar}
              />
              <LeyendaBurbujas />
            </div>
          )}
        </div>
      </main>
      {actual && <CajonFicha tema={actual} onCerrar={cerrar} onSeleccion={seleccionar} />}
    </div>
  );
}
