import { describe, expect, it } from "vitest";
import { destinatarios, franjaActual, inicioFranja, montarEmail, ordenar, type AlertaResumen } from "./resumenEmail";

const base: AlertaResumen = { id: 1, entidad: "Tema", prioridad: "media", creada_en: "2026-11-25T07:00:00Z", x_posicion: null, x_desde: null,
  trends_activo: false, trends_crecimiento: null, medios_discover: 0, motivo_afinidad: "", wikipedia_ratio: null };
const a = (o: Partial<AlertaResumen>) => ({ ...base, ...o });

describe("resumen por email", () => {
  it("altas primero y, dentro, más puntos primero", () => {
    const r = ordenar([a({ id: 1 }), a({ id: 2, prioridad: "alta", x_posicion: 20 }), a({ id: 3, prioridad: "alta", x_posicion: 2 }), a({ id: 4, x_posicion: 1 })]);
    expect(r.altas.map((x) => x.id)).toEqual([3, 2]);
    expect(r.medias.map((x) => x.id)).toEqual([4, 1]);
  });
  it("sin envío previo cubre 24 horas", () => {
    const ahora = new Date("2026-11-25T07:00:00Z");
    expect(inicioFranja(null, ahora).toISOString()).toBe("2026-11-24T07:00:00.000Z");
    expect(inicioFranja(new Date("2026-11-24T15:00:00Z"), ahora).toISOString()).toBe("2026-11-24T15:00:00.000Z");
  });
  it("envía a las 8 y 16 de Madrid en invierno y en verano", () => {
    expect(franjaActual(new Date("2026-11-25T07:00:20Z"))).toBe("2026-11-25 08");
    expect(franjaActual(new Date("2026-11-25T15:00:00Z"))).toBe("2026-11-25 16");
    expect(franjaActual(new Date("2026-11-25T06:00:00Z"))).toBeNull();
    expect(franjaActual(new Date("2026-07-01T06:00:00Z"))).toBe("2026-07-01 08");
    expect(franjaActual(new Date("2026-07-01T14:00:00Z"))).toBe("2026-07-01 16");
    expect(franjaActual(new Date("2026-07-01T07:00:00Z"))).toBeNull();
  });
  it("sin alertas manda el aviso corto con el botón", () => {
    const e = montarEmail([], new Date(), new Date());
    expect(e.asunto).toBe("Radar Discover · Resumen de alertas");
    expect(e.html).toContain("Sin alertas nuevas desde el último resumen");
    expect(e.html).toContain("Abrir el panel de alertas");
  });
  it("enlaza cada ficha y escapa el HTML", () => {
    const e = montarEmail([a({ id: 42, entidad: "<b>X</b>" })], new Date(), new Date());
    expect(e.html).toContain("https://radar-discover-spotlight.lovable.app/?alerta=42");
    expect(e.html).not.toContain("<b>X</b>");
    expect(e.texto).toContain("Prioridad media".toUpperCase());
  });
  it("valida destinatarios separados por comas", () => {
    expect(destinatarios("a@x.es, b@y.es")).toEqual(["a@x.es", "b@y.es"]);
    expect(destinatarios("a@x.es, nada")).toEqual([]);
  });
});
