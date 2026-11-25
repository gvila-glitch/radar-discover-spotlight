import { describe, expect, it } from "vitest";
import { cuandoSeCreo, destinatarios, franjaActual, inicioFranja, montarEmail, ordenar, type AlertaResumen } from "./resumenEmail";

const base: AlertaResumen = { id: 1, entidad: "Tema", prioridad: "media", creada_en: "2026-11-25T07:00:00Z", x_posicion: null, x_desde: null,
  trends_activo: false, trends_crecimiento: null, medios_discover: 0, motivo_afinidad: "", wikipedia_ratio: null };
const a = (o: Partial<AlertaResumen>) => ({ ...base, ...o });

describe("resumen por email", () => {
  it("altas primero y, dentro de cada bloque, la más reciente primero", () => {
    const r = ordenar([
      a({ id: 1, creada_en: "2026-11-25T05:00:00Z" }), a({ id: 2, prioridad: "alta", creada_en: "2026-11-25T03:00:00Z", x_posicion: 1 }),
      a({ id: 3, prioridad: "alta", creada_en: "2026-11-25T06:00:00Z" }), a({ id: 4, creada_en: "2026-11-25T06:30:00Z" }),
    ]);
    expect(r.altas.map((x) => x.id)).toEqual([3, 2]);
    expect(r.medias.map((x) => x.id)).toEqual([4, 1]);
    const e = montarEmail([a({ id: 4, entidad: "Media", creada_en: "2026-11-25T06:59:00Z" }), a({ id: 2, entidad: "Alta", prioridad: "alta", creada_en: "2026-11-24T00:00:00Z" })], new Date("2026-11-24T00:00:00Z"), new Date("2026-11-25T07:00:00Z"));
    expect(e.texto.indexOf("[ALTA] Alta")).toBeLessThan(e.texto.indexOf("- Media"));
  });
  it("«hace N min» con mínimo 1 y «hace N h» redondeando hacia abajo", () => {
    const ahora = new Date("2026-11-25T07:00:00Z");
    expect(cuandoSeCreo("2026-11-25T06:59:30Z", ahora)).toBe("07:59 · hace 1 min");
    expect(cuandoSeCreo("2026-11-25T06:01:00Z", ahora)).toBe("07:01 · hace 59 min");
    expect(cuandoSeCreo("2026-11-25T06:00:00Z", ahora)).toBe("07:00 · hace 1 h");
    expect(cuandoSeCreo("2026-11-25T05:01:00Z", ahora)).toBe("06:01 · hace 1 h");
  });
  it("«Ayer, » cuando cambia el día en Madrid y fecha corta antes de ayer", () => {
    const ahora = new Date("2026-11-25T07:00:00Z");
    // 23:30 UTC del 24 es 00:30 del 25 en Madrid: mismo día
    expect(cuandoSeCreo("2026-11-24T23:30:00Z", ahora)).toBe("00:30 · hace 7 h");
    expect(cuandoSeCreo("2026-11-24T22:30:00Z", ahora)).toBe("Ayer, 23:30 · hace 8 h");
    expect(cuandoSeCreo("2026-11-23T09:05:00Z", ahora)).toBe("23 nov, 10:05 · hace 45 h");
  });
  it("respeta el horario de verano y de invierno", () => {
    expect(cuandoSeCreo("2026-07-01T05:41:00Z", new Date("2026-07-01T06:00:00Z"))).toBe("07:41 · hace 19 min");
    expect(cuandoSeCreo("2026-11-25T05:41:00Z", new Date("2026-11-25T06:00:00Z"))).toBe("06:41 · hace 19 min");
    // Cambio de hora (25 oct 2026, 03:00 CEST → 02:00 CET)
    expect(cuandoSeCreo("2026-10-24T22:30:00Z", new Date("2026-10-25T07:00:00Z"))).toBe("00:30 · hace 8 h");
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
