import type { Alerta } from "./types";

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
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
    medianaLlegada: mediana(alertas.map((a) => a.medios_discover)),
  };
}
