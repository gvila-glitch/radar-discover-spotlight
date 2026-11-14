import { describe, expect, it } from "vitest";
import { articuloValido, calcularPicos, diasUTC, planificarAlertasWikipedia } from "./wikipediaPicos";

const previo = (extra: { article: string; views: number }[] = []) => [...extra, { article: "Relleno", views: 1000 }];

describe("picos de Wikipedia", () => {
  it("quita portada, buscador y páginas de servicio", () => {
    expect(articuloValido("Wikipedia:Portada")).toBe(false);
    expect(articuloValido("Especial:Buscar")).toBe(false);
    expect(articuloValido("Anexo:Episodios")).toBe(false);
    expect(articuloValido("Ada_Colau")).toBe(true);
  });
  it("exige 5000 visitas y triplicar la media de 7 días", () => {
    const previos = Array.from({ length: 7 }, () => previo([{ article: "Estable", views: 9000 }]));
    const picos = calcularPicos([{ article: "Ada_Colau", views: 30000 }, { article: "Estable", views: 10000 }, { article: "Pequeño", views: 4999 }], previos);
    expect(picos).toEqual([{ articulo: "Ada Colau", visitas: 30000, media_previa: 1000, ratio: 30 }]);
  });
  it("un ratio de 2,9 no es pico", () => {
    const previos = Array.from({ length: 7 }, () => previo([{ article: "X", views: 2000 }]));
    expect(calcularPicos([{ article: "X", views: 5800 }], previos)).toEqual([]);
  });
  it("máximo tres alertas por ejecución, sin repetir ni excluidas", () => {
    const picos = ["A", "B", "C", "D", "E", "Fútbol club"].map((a, i) => ({ articulo: a, visitas: 9000, media_previa: 100, ratio: 90 - i }));
    const plan = planificarAlertasWikipedia({ picos, exclusiones: ["fútbol"], entidadesRecientes: ["[SIN DISCOVER] a"] });
    expect(plan.nuevas.map((n) => n.entidad)).toEqual(["[SIN DISCOVER] B", "[SIN DISCOVER] C", "[SIN DISCOVER] D"]);
    // «A» ya tiene alerta: se envía para combinarla en vez de descartarla.
    expect(plan.fusiones.map((n) => n.entidad)).toEqual(["[SIN DISCOVER] A"]);
    expect(plan.descartadas.map((d) => d.motivo).sort()).toEqual(["exclusion", "limite_ejecucion"]);
  });
  it("lee el último día completo en UTC", () => {
    expect(diasUTC(new Date("2026-11-14T00:30:00Z"), 2)).toEqual(["2026-11-13", "2026-11-12"]);
  });
});
