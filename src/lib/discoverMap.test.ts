import { describe, it, expect } from "vitest";
import {
  construirDiscoverMap,
  nombresDelTitular,
  palabrasCorrientes,
  ventanaValida,
  type ArticuloSnoop,
  type TemaMapa,
} from "./discoverMap";

const AHORA = new Date("2026-11-15T16:00:00Z");
let n = 0;
const art = (medio: string, titular: string, haceMin = 10): ArticuloSnoop => ({
  id: ++n,
  url: `https://${medio}/a${n}`,
  medio,
  titular,
  recibido_en: new Date(AHORA.getTime() - haceMin * 60_000).toISOString(),
});
const mapa = (articulos: ArticuloSnoop[], alertas: string[] = [], ventana: 1 | 3 | 6 = 6) =>
  construirDiscoverMap({ articulos, alertas, ahora: AHORA, ventana });
const temas = (m: ReturnType<typeof mapa>) =>
  Object.fromEntries(m.grupos.flatMap((g) => g.temas).map((t) => [t.nombre, t])) as Record<
    string,
    TemaMapa
  >;

describe("nombres propios de un titular", () => {
  it("quita la palabra corriente que abre la frase y conserva los nombres", () => {
    const corrientes = palabrasCorrientes(["el debate de hoy", "así lo dijo", "muere un actor"]);
    expect(
      nombresDelTitular("El primer debate: Cuerpo y Bustinduy ante Figaredo", corrientes),
    ).toEqual(["Cuerpo", "Bustinduy", "Figaredo"]);
    expect(nombresDelTitular("Así reaccionó Javier Bardem al bulo", corrientes)).toEqual([
      "Javier Bardem",
    ]);
    expect(nombresDelTitular("Sumar exige más medidas al PSOE", corrientes)).toEqual([
      "Sumar",
      "PSOE",
    ]);
    expect(nombresDelTitular("Muere Robe Iniesta", corrientes)).toEqual(["Robe Iniesta"]);
  });
  it("la ventana solo admite 1, 3 o 6 horas", () => {
    expect(ventanaValida(3)).toBe(3);
    expect(ventanaValida(24)).toBe(6);
    expect(ventanaValida("1")).toBe(6);
  });
});

describe("construirDiscoverMap", () => {
  it("cuenta medios distintos, suma el apellido suelto y no cuenta redes ni artículos fuera de la ventana", () => {
    const m = mapa(
      [
        art(
          "lasexta.com",
          "El primer debate electoral: Cuerpo y Bustinduy sacan pecho ante un Bravo al ataque y un Figaredo centrado en la migración",
        ),
        art("elpais.com", "Pablo Bustinduy defiende la reducción de jornada en el debate"),
        art("elmundo.es", "Bustinduy y Figaredo chocan por la vivienda", 120),
        art("elmundo.es", "Bustinduy repite sus propuestas", 20),
        art("x.com", "Pablo Bustinduy en el debate"),
        art("abc.es", "Bustinduy, en el debate de anoche", 8 * 60),
      ],
      ["[SIN DISCOVER] Pablo Bustinduy"],
    );
    const t = temas(m)["Pablo Bustinduy"]!;
    expect(t.medios).toBe(3);
    expect(t.alias).toEqual(["Figaredo"]); // los dos artículos de Figaredo también hablan de Bustinduy
    expect(t.mediosUltimaHora).toBe(3);
    expect(t.subiendo).toBe(true);
    expect(t.hayAlerta).toBe(true);
    expect(t.listaMedios).toEqual(["elmundo.es", "lasexta.com", "elpais.com"]); // por orden de llegada
    expect(t.titulares.map((x) => x.medio)).toEqual(["lasexta.com", "elpais.com", "elmundo.es"]);
    expect(m.articulos).toBe(4); // sin x.com ni el de hace 8 horas
  });

  it("quita lugares, instituciones y palabras corrientes; no mete «Madrid» en «Real Madrid»", () => {
    const m = mapa([
      art("abc.es", "Se vive mejor en un pueblo que en Madrid o Barcelona"),
      art("elconfidencial.com", "Vivir en Madrid o Barcelona ya no compensa"),
      art("elperiodico.com", "Madrid sube los precios"),
      art("marca.com", "El Real Madrid gana en Vigo"),
      art("as.com", "Ancelotti celebra la victoria del Real Madrid"),
      art("mundodeportivo.com", "El Real Madrid sigue líder"),
      art("cadenaser.com", "El Ayuntamiento de Logroño paraliza las obras"),
      art("cope.es", "El Ayuntamiento de Sevilla aprueba los presupuestos"),
      art("rtve.es", "El Ayuntamiento de Cádiz cierra los parques"),
      art("diariodealmeria.es", "La Guardia Civil vigila los Filabres"),
      art("eldiadecordoba.es", "La Guardia Civil tiene vacantes"),
      art("cope.es", "La Guardia Civil se traslada"),
    ]);
    const t = temas(m);
    expect(Object.keys(t)).toEqual(["Real Madrid"]);
    expect(t["Real Madrid"]!.medios).toBe(3);
  });

  it("enseña un tema con 3 medios o más, o con 2 si los dos son de la última hora", () => {
    const m = mapa([
      art("elpais.com", "Ábalos pide anular el registro", 200),
      art("elmundo.es", "Ábalos recurre", 200),
      art("infobae.com", "Elon Musk pide restituir a Jensen Huang en Nvidia", 10),
      art("lavanguardia.com", "Nvidia: Elon Musk apoya a Jensen Huang", 20),
    ]);
    const t = temas(m);
    expect(t["Ábalos"]).toBeUndefined();
    expect(t["Elon Musk"]?.alias).toEqual(["Jensen Huang", "Nvidia"]);
    expect(t["Elon Musk"]?.subiendo).toBe(true);
  });

  it("agrupa los temas que comparten varios titulares y deja aparte a los demás", () => {
    const m = mapa([
      art("elpais.com", "Abascal y Vox, contra los datos de Cornellà"),
      art("okdiario.com", "Abascal llena el mitin de Vox en Cornellá"),
      art("lasexta.com", "Abascal no se arrepiente"),
      art("elmundo.es", "Vox presenta su programa"),
      art("cadenaser.com", "Vox denuncia al portavoz"),
      art("libertaddigital.com", "Vox sube en las encuestas"),
      art("abc.es", "Pedro Sánchez promete permisos por amistad"),
      art("eldiario.es", "Sánchez avanza su programa"),
      art("rtve.es", "Sánchez, en Albacete"),
      art("elespanol.com", "Sánchez critica a Abascal"),
    ]);
    const nombres = m.grupos.map((g) => [g.nombre, g.temas.map((t) => t.nombre)]);
    expect(nombres).toEqual([
      ["Vox · Abascal", ["Vox", "Abascal"]],
      ["Otros temas", ["Pedro Sánchez"]],
    ]);
    expect(temas(m)["Pedro Sánchez"]!.relacionados.map((r) => r.nombre)).toEqual(["Abascal"]);
  });

  it("sin artículos devuelve un mapa vacío", () => {
    expect(mapa([])).toEqual({
      grupos: [],
      articulos: 0,
      ventana: 6,
      generado: AHORA.toISOString(),
    });
    expect(mapa([art("elpais.com", "Pablo Bustinduy en el debate", 7 * 60)]).grupos).toEqual([]);
  });
});
