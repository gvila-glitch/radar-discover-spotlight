import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listAlertas } from "@/lib/alertasRepo";
import { desdePeriodo } from "@/lib/fechas";
import { Indicadores } from "@/components/radar/Indicadores";

export const Route = createFileRoute("/_authenticated/resultados")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Resultados · Radar Discover" },
      { name: "description", content: "Indicadores del piloto del Radar Discover." },
      { property: "og:title", content: "Resultados · Radar Discover" },
      { property: "og:description", content: "Indicadores del piloto del Radar Discover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Resultados,
});

// Resultados: cómo está funcionando el radar. De momento, los cuatro indicadores que antes estaban en «Alertas».
export function Resultados() {
  const {
    data = [],
    isLoading,
    isError,
  } = useQuery({ queryKey: ["alertas", "7d"], queryFn: () => listAlertas(desdePeriodo("7d")) });
  return (
    <div className="min-h-screen">
      <header className="border-b border-caja bg-card">
        <div className="mx-auto flex max-w-7xl items-center px-4 py-3">
          <h1 className="tracking-tight text-xl font-semibold">Radar Discover</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h2 className="tracking-tight text-3xl font-semibold">Resultados</h2>
        <p className="mt-2">Cómo está funcionando el radar, para el seguimiento del piloto.</p>
        <div className="mt-5">
          {isError ? (
            <p role="alert" className="text-sm text-destructive">
              No se pudieron cargar las alertas. Inténtalo de nuevo.
            </p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <Indicadores alertas={data} />
          )}
        </div>
      </main>
    </div>
  );
}
