import type { Alerta } from "./types";

// Las alertas que salen sin datos de Discover llevan el prefijo [SIN DISCOVER]: su 0 no significa
// «nadie ha llegado», sino «no lo sabemos», así que no deben contar como «a tiempo» ni en la mediana.
export function sinDatosDiscover(a: Pick<Alerta, "entidad">): boolean {
  return typeof a.entidad === "string" && /^\[SIN DISCOVER\]/i.test(a.entidad);
}

export function llegada(mediosDiscover: number) {
  const puesto = mediosDiscover + 1;
  const nivel = mediosDiscover <= 2 ? "ok" : mediosDiscover <= 5 ? "warn" : "bad";
  const texto = nivel === "ok" ? "a tiempo" : nivel === "warn" ? "justo" : "tarde";
  return { puesto, nivel, label: `${puesto}.º · ${texto}` } as const;
}

export function mediana(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function kpis(alertas: Alerta[], hoyKey: (iso: string) => string, hoy: string) {
  const valoradas = alertas.filter((a) => a.estado !== "pendiente");
  const utiles = valoradas.filter((a) => a.estado === "util" || a.estado === "publicada").length;
  const deHoy = alertas.filter((a) => hoyKey(a.creada_en) === hoy);
  return {
    hoy: deHoy.length,
    pendientesHoy: deHoy.filter((a) => a.estado === "pendiente").length,
    pctUtiles: valoradas.length ? (utiles / valoradas.length) * 100 : null,
    pctPublicadas: alertas.length ? (alertas.filter((a) => a.estado === "publicada").length / alertas.length) * 100 : null,
    medianaLlegada: mediana(alertas.filter((a) => !sinDatosDiscover(a)).map((a) => a.medios_discover)),
  };
}

export function nombreVisible(entidad: string): string {
  return entidad.replace(/^\[(SIN DISCOVER|PRUEBA)\]\s*/i, "");
}
