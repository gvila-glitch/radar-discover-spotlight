import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Selector } from "@/components/radar/ui";
import {
  LeyendaDiscover,
  ListaDiscover,
  ResumenVentana,
  SelectorPestanas,
} from "@/components/radar/DiscoverMap";
import { leerDiscoverMap } from "@/lib/discoverMap.functions";
import {
  enPestana,
  PESTANAS,
  VENTANA_INICIAL,
  ventanaValida,
  type Pestana,
  type Ventana,
} from "@/lib/discoverMap";
import { hora24 } from "@/lib/fechas";

// La dirección sigue siendo /discover-map (enlaces guardados); la sección se llama «Discover ahora».
export const Route = createFileRoute("/_authenticated/discover-map")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Discover ahora · Radar Discover" },
      {
        name: "description",
        content:
          "Lo que ya está en Discover: a qué ritmo entra, si estamos y si el radar avisó antes.",
      },
      { property: "og:title", content: "Discover ahora · Radar Discover" },
      { property: "og:description", content: "Lo que ya está en Discover ahora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiscoverAhoraPagina,
});

const VACIO: Record<Pestana, string> = {
  entrando:
    "Ahora mismo no está entrando ningún tema nuevo. En «Todo» tienes lo que ya está en Discover.",
  sin_nosotros: "Estamos en todos los temas de esta ventana.",
  consolidados: "Ningún tema tiene todavía 6 medios o más.",
  todo: "Todavía no hay temas con varios medios en esta ventana.",
};

function DiscoverAhoraPagina() {
  const [ventana, setVentana] = useState<Ventana>(VENTANA_INICIAL);
  const [pestana, setPestana] = useState<Pestana>("entrando");
  const [categoria, setCategoria] = useState("todas");
  const [abierto, setAbierto] = useState<string | null>(null);
  const leer = useServerFn(leerDiscoverMap);
  // Se calcula al abrir la sección o al pulsar «Actualizar»: no se pide solo cada pocos minutos (ahorra consumo).
  const q = useQuery({
    queryKey: ["discover-map", ventana],
    queryFn: () => leer({ data: { ventana } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const datos = q.data;
  const sinDominio = !!datos && !datos.propio;
  const deCategoria = (datos?.temas ?? []).filter(
    (t) => categoria === "todas" || t.categorias.includes(categoria),
  );
  const cuentas = Object.fromEntries(
    PESTANAS.map((p) => [p.id, deCategoria.filter((t) => enPestana(t, p.id)).length]),
  ) as Record<Pestana, number>;
  const lista = deCategoria.filter((t) => enPestana(t, pestana));
  // En «Consolidados» manda el tamaño; en el resto, el ritmo (ya viene ordenado así).
  if (pestana === "consolidados") lista.sort((a, b) => b.medios - a.medios);

  // «Sale junto a» puede abrir un tema de otra pestaña: entonces se pasa a «Todo» y se lleva la fila a la vista.
  const abrir = (id: string | null) => {
    setAbierto(id);
    if (!id) return;
    if (!lista.some((t) => t.id === id)) {
      setPestana("todo");
      setCategoria("todas");
    }
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-tema="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3">
          <h1 className="tracking-tight text-xl font-semibold">Radar Discover</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="tracking-tight text-3xl font-semibold">Discover ahora</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que ya está en Discover · España
          {datos?.categorias.length ? ` · ${datos.categorias.join(", ")}` : ""}
        </p>
        <LeyendaDiscover />

        <SelectorPestanas
          pestana={pestana}
          onCambio={(p) => {
            setPestana(p);
            setAbierto(null);
          }}
          cuentas={cuentas}
          sinDominio={sinDominio}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border bg-card px-3 py-2">
          <Selector
            id="f-ventana"
            label="Ventana"
            value={String(ventana)}
            onChange={(v) => setVentana(ventanaValida(Number(v)))}
            options={[
              { value: "1", label: "Última hora" },
              { value: "3", label: "Últimas 3 horas" },
              { value: "6", label: "Últimas 6 horas" },
              { value: "24", label: "Últimas 24 horas" },
            ]}
          />
          {(datos?.categorias.length ?? 0) > 1 && (
            <Selector
              id="f-categoria"
              label="Categoría"
              value={categoria}
              onChange={setCategoria}
              options={[
                { value: "todas", label: "Todas" },
                ...(datos?.categorias ?? []).map((c) => ({ value: c, label: c })),
              ]}
            />
          )}
          <span className="ml-auto flex items-center gap-4">
            {datos && (
              <span className="font-mono text-xs text-muted-foreground">
                Actualizado {hora24(datos.generado)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? "Actualizando…" : "Actualizar"}
            </Button>
          </span>
        </div>

        {datos && datos.articulos > 0 && (
          <ResumenVentana
            articulos={datos.articulos}
            temas={datos.temas.length}
            resumen={datos.resumen}
          />
        )}

        {sinDominio && (
          <p className="mt-3 text-xs text-muted-foreground">
            Falta nuestro dominio en Configuración: por eso «Nosotros» sale con «—» y «Sin nosotros»
            está desactivada.
          </p>
        )}

        <div className="mt-4">
          {q.isError ? (
            <p role="alert" className="border bg-card p-4 text-sm text-destructive">
              No se pudieron cargar los datos. Inténtalo de nuevo.
            </p>
          ) : q.isLoading ? (
            <p className="border bg-card p-4 text-sm text-muted-foreground">Cargando…</p>
          ) : datos && datos.articulos === 0 ? (
            <p className="border bg-card p-4 text-sm text-muted-foreground">
              Snoop no ha enviado artículos en esta ventana. Prueba con una ventana más larga.
            </p>
          ) : lista.length === 0 ? (
            <p className="border bg-card p-4 text-sm text-muted-foreground">{VACIO[pestana]}</p>
          ) : (
            <ListaDiscover
              temas={lista}
              referencia={datos?.referencia ?? []}
              propio={datos?.propio ?? null}
              abierto={abierto}
              onAbrir={abrir}
            />
          )}
        </div>
      </main>
    </div>
  );
}
