import { describe, expect, it } from "vitest";
import { fuentesDe, pasaAutoridad, pasaEstado, pasaFuente } from "./filtrosAlertas";

const alerta = (o: Partial<Parameters<typeof fuentesDe>[0]> = {}) => ({
  x_posicion: null,
  trends_activo: false,
  trends_crecimiento: null,
  wikipedia_ratio: null,
  ...o,
});

describe("filtros de Alertas", () => {
  it("Estado: «Todos menos ruido» deja fuera solo el ruido", () => {
    expect(pasaEstado("pendiente", "sin_ruido")).toBe(true);
    expect(pasaEstado("publicada", "sin_ruido")).toBe(true);
    expect(pasaEstado("ruido", "sin_ruido")).toBe(false);
    expect(pasaEstado("ruido", "todos")).toBe(true);
    expect(pasaEstado("util", "ruido")).toBe(false);
  });

  it("Fuente: cuenta X, Google con volumen y Wikipedia; «Varias fuentes» es dos o más", () => {
    const xYGoogle = alerta({ x_posicion: 4, trends_activo: true, trends_crecimiento: "20.000+" });
    const googleSinVolumen = alerta({ trends_activo: true });
    const wiki = alerta({ wikipedia_ratio: 6 });
    expect(fuentesDe(xYGoogle)).toEqual(["x", "google"]);
    expect(fuentesDe(googleSinVolumen)).toEqual([]);
    expect(pasaFuente(xYGoogle, "x")).toBe(true);
    expect(pasaFuente(xYGoogle, "varias")).toBe(true);
    expect(pasaFuente(wiki, "varias")).toBe(false);
    expect(pasaFuente(wiki, "wikipedia")).toBe(true);
    expect(pasaFuente(wiki, "todas")).toBe(true);
  });

  it("Autoridad: «Con autoridad» junta alta y media; sin nivel solo pasa con «Todas»", () => {
    expect(pasaAutoridad("alta", "con")).toBe(true);
    expect(pasaAutoridad("media", "con")).toBe(true);
    expect(pasaAutoridad("nuevo", "con")).toBe(false);
    expect(pasaAutoridad("media", "alta")).toBe(false);
    expect(pasaAutoridad("nuevo", "nuevo")).toBe(true);
    expect(pasaAutoridad(undefined, "nuevo")).toBe(false);
    expect(pasaAutoridad(undefined, "todas")).toBe(true);
  });
});
