import { describe, it, expect } from "vitest";
import { describirPuntos, puntuarAlerta, type DatosPuntuacion } from "./prioridad";

const AFIN = "Encaja por reglas: «pedro sanchez»";
const NO = "Sin clasificar: no coincide con ninguna regla";
const base: DatosPuntuacion = {
  entidad: "Tema",
  creada_en: "2026-11-16T10:00:00Z",
  x_posicion: null,
  x_desde: null,
  trends_activo: false,
  trends_crecimiento: null,
  wikipedia_ratio: null,
  medios_discover: 0,
  motivo_afinidad: NO,
};
const p = (o: Partial<DatosPuntuacion>) => puntuarAlerta({ ...base, ...o });

describe("prioridad por puntos", () => {
  it("X arriba, recién entrado, nadie en Discover y afín: alta con su desglose", () => {
    const r = p({
      entidad: "Pedro Sánchez",
      x_posicion: 3,
      x_desde: "2026-11-16T09:30:00Z",
      motivo_afinidad: AFIN,
    });
    expect(r.puntos).toBe(8);
    expect(r.prioridad).toBe("alta");
    expect(describirPuntos(r)).toBe(
      "8 puntos: X, puesto 3 +3 · acaba de entrar en X +1 · nadie en Discover todavía +1 · encaja con la línea editorial +3",
    );
  });
  it("X arriba sin relación con la línea y una sola fuente: media (Pedri, #FelizLunes)", () => {
    expect(p({ entidad: "Pedri", x_posicion: 3, x_desde: "2026-11-16T09:30:00Z" })).toMatchObject({
      puntos: 5,
      prioridad: "media",
    });
    expect(
      p({ entidad: "#FelizLunes", x_posicion: 3, x_desde: "2026-11-16T09:30:00Z" }),
    ).toMatchObject({ puntos: 4, prioridad: "media" });
  });
  it("dos fuentes cuentan aunque no haya regla; con 3 o más medios nunca es alta", () => {
    expect(p({ entidad: "Pablo Bustinduy", x_posicion: 20, wikipedia_ratio: 6 }).prioridad).toBe(
      "alta",
    );
    expect(
      p({
        entidad: "Pablo Bustinduy",
        x_posicion: 2,
        x_desde: "2026-11-16T09:50:00Z",
        wikipedia_ratio: 12,
        medios_discover: 4,
      }),
    ).toMatchObject({ puntos: 6, prioridad: "media" }); // 3 + 1 + 3 + 1 − 2
  });
  it("Trends por tramos, Wikipedia por veces sobre su media y sin datos de Discover no suma ni resta", () => {
    expect(
      p({ entidad: "[SIN DISCOVER] x", trends_activo: true, trends_crecimiento: "20K+" }).puntos,
    ).toBe(3);
    expect(
      p({ entidad: "[SIN DISCOVER] x", trends_activo: true, trends_crecimiento: "500+" }).puntos,
    ).toBe(0);
    expect(p({ entidad: "[SIN DISCOVER] x", wikipedia_ratio: "5.2" }).puntos).toBe(2);
    expect(
      p({ entidad: "[SIN DISCOVER] x", trends_activo: false, trends_crecimiento: "50K+" }).puntos,
    ).toBe(0);
  });
  it("X que entró hace más de 90 minutos no suma el punto de «recién»", () => {
    expect(
      p({ entidad: "[SIN DISCOVER] x", x_posicion: 10, x_desde: "2026-11-16T08:00:00Z" }).puntos,
    ).toBe(2);
  });
});
