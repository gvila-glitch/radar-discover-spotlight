import { cn } from "@/lib/utils";
import { claveDia, desdePeriodo } from "@/lib/fechas";
import { kpis } from "@/lib/metricas";
import type { Alerta } from "@/lib/types";
import { InfoAyuda } from "./InfoAyuda";
import { AYUDA_KPI_MEDIOS } from "./textosAyuda";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)} %`);

function Kpi({
  titulo,
  valor,
  sub,
  ok,
  ayuda,
}: {
  titulo: string;
  valor: string;
  sub: string;
  ok: boolean | null;
  ayuda?: string;
}) {
  return (
    <div className="p-3 lg:p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground lg:text-sm">
        {titulo}
        {ayuda && <InfoAyuda tema={titulo}>{ayuda}</InfoAyuda>}
      </div>
      <div
        className={cn(
          "mt-1 tabular-nums text-xl font-medium lg:text-3xl",
          ok == null ? "" : ok ? "text-ok" : "text-bad",
        )}
      >
        {valor}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {ok != null && <span className={ok ? "text-ok" : "text-bad"}>{ok ? "✓ " : "✗ "}</span>}
        {sub}
      </div>
    </div>
  );
}

/**
 * Los cuatro indicadores del piloto (objetivos de quien lleva el producto, no de quien valora): por eso están en
 * «Resultados» y no en «Alertas». Cuentan siempre los últimos 7 días.
 */
export function Indicadores({ alertas }: { alertas: Alerta[] }) {
  const desde7 = desdePeriodo("7d")?.getTime() ?? 0;
  const k = kpis(
    alertas.filter((a) => Date.parse(a.creada_en) >= desde7),
    claveDia,
    claveDia(new Date()),
  );
  return (
    <section
      aria-label="Indicadores"
      className="grid grid-cols-2 divide-x divide-y border border-caja bg-card lg:grid-cols-4 lg:divide-y-0"
    >
      <Kpi
        titulo="Alertas hoy"
        valor={String(k.hoy)}
        ok={k.hoy >= 3 && k.hoy <= 8}
        sub={`${k.pendientesHoy} pendientes de valorar · objetivo 3–8 al día`}
      />
      <Kpi
        titulo="Útiles"
        valor={pct(k.pctUtiles)}
        ok={k.pctUtiles == null ? null : k.pctUtiles >= 50}
        sub="valoradas en los últimos 7 días · objetivo ≥ 50 %"
      />
      <Kpi
        titulo="Acabaron en pieza"
        valor={pct(k.pctPublicadas)}
        ok={k.pctPublicadas == null ? null : k.pctPublicadas >= 20}
        sub="del total de los últimos 7 días · objetivo ≥ 20 %"
      />
      <Kpi
        titulo="Medios en Discover"
        valor={k.medianaLlegada == null ? "—" : k.medianaLlegada.toLocaleString("es-ES")}
        ok={null}
        ayuda={AYUDA_KPI_MEDIOS}
        sub={
          k.medianaLlegada == null
            ? "sin datos de Discover en los últimos 7 días"
            : "mediana en las 24 h tras el aviso · últimos 7 días"
        }
      />
    </section>
  );
}
