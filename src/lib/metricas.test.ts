import { describe, it, expect } from "vitest";
import { llegada, mediana, kpis } from "./metricas";
import type { Alerta } from "./types";

const base = { estado: "pendiente", medios_discover: 0, creada_en: "2026-01-01T10:00:00Z" } as Alerta;
describe("llegada", () => {
  it("0–2 medios a tiempo", () => expect(llegada(2)).toMatchObject({ puesto: 3, nivel: "ok" }));
  it("3–5 medios justo", () => expect(llegada(3).nivel).toBe("warn"));
  it("6+ medios tarde", () => expect(llegada(6).label).toBe("7.º · tarde"));
});
describe("kpis", () => {
  const a = [
    { ...base, estado: "util" }, { ...base, estado: "ruido" }, { ...base, estado: "publicada", medios_discover: 4 }, { ...base },
  ] as Alerta[];
  const k = kpis(a, () => "x", "x");
  it("útiles sobre valoradas", () => expect(k.pctUtiles).toBeCloseTo(66.67, 1));
  it("publicadas sobre total", () => expect(k.pctPublicadas).toBe(25));
  it("mediana", () => expect(mediana([0, 0, 0, 4])).toBe(0));
});

import { nombreVisible } from "./metricas";
describe("nombreVisible", () => {
  it("oculta los prefijos al mostrar", () => {
    expect(nombreVisible("[SIN DISCOVER] Abascal")).toBe("Abascal");
    expect(nombreVisible("[PRUEBA] Persona")).toBe("Persona");
    expect(nombreVisible("Rosalía")).toBe("Rosalía");
  });
});
