import { describe, it, expect, vi } from "vitest";
import {
  anadirLinea,
  criterioValido,
  diaMadrid,
  filasDescartesTrends,
  filasDescartesWikipedia,
  fuerzaSenal,
  lineaReglaSi,
  sugerenciaExcepcion,
  UMBRAL_FUERTE,
} from "./descartes";
import { guardarDescartes } from "./descartes.server";
import type { CandidataTrends, ClasificacionIA } from "./trendsAlertas";

const ahora = new Date("2026-11-16T22:30:00Z"); // 23:30 en Madrid: sigue siendo día 16
const ia = (motivo: string, extra: Partial<ClasificacionIA> = {}): ClasificacionIA => ({
  encaje: "fuera",
  agencia: false,
  seccion: "Deportes",
  motivo,
  ...extra,
});
const cand = (termino: string, o: Partial<CandidataTrends> = {}): CandidataTrends => ({
  termino,
  trend: null,
  x: null,
  titular: null,
  ...o,
});
const x = (posicion: number, desde = "2026-11-16T22:10:00Z") => ({
  nombre: "x",
  posicion,
  desde,
  categoria: "Deportes",
  publicaciones: 48200,
});

describe("qué descartes se guardan", () => {
  it("día en Madrid y fuerza de la señal sin la parte editorial", () => {
    expect(diaMadrid(ahora)).toBe("2026-11-16");
    expect(diaMadrid(new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-17");
    expect(
      fuerzaSenal({
        creada_en: ahora.toISOString(),
        x_posicion: 1,
        x_desde: "2026-11-16T22:10:00Z",
      }).puntos,
    ).toBe(4);
    expect(fuerzaSenal({ creada_en: ahora.toISOString(), trends_crecimiento: "500+" }).puntos).toBe(
      0,
    );
  });
  it("X y Trends: solo lo que la IA dejó fuera, un tema por día, con su señal, contexto, motivo y si es fuerte", () => {
    const filas = filasDescartesTrends({
      ahora,
      candidatas: [
        cand("Pedri", { x: x(1), titular: null }),
        cand("Accidente A-6", {
          trend: {
            id: 1,
            termino: "Accidente A-6",
            volumen: "5000+",
            capturado_en: "",
            noticias: [],
          },
          titular: "Un muerto en la A-6",
        }),
        cand("Vox", { x: x(9) }),
      ],
      ia: new Map([
        ["Pedri", ia("Fútbol sin dimensión pública")],
        ["Accidente A-6", ia("Suceso", { agencia: true, seccion: "Sociedad" })],
      ]),
      descartadas: [
        { termino: "Pedri", motivo: "fuera_de_linea" },
        { termino: "PEDRI", motivo: "fuera_de_linea" },
        { termino: "Accidente A-6", motivo: "fuera_de_linea" },
        { termino: "Vox", motivo: "tope_diario" },
      ],
      modelo: "gemini-3.8-flash",
    });
    expect(filas.map((f) => f.tema)).toEqual(["Pedri", "Accidente A-6"]);
    expect(filas[0]).toMatchObject({
      dia: "2026-11-16",
      clave: "pedri",
      fuente: "x_trends",
      x_posicion: 1,
      puntos: 4,
      fuerte: true,
      contexto: "En tendencia en X España (puesto 1 · Deportes · 48.200 publicaciones)",
      motivo_ia: "Fútbol sin dimensión pública",
      seccion_ia: "Deportes",
      agencia: false,
      modelo: "gemini-3.8-flash",
    });
    expect(filas[1]).toMatchObject({
      trends_crecimiento: "5000+",
      puntos: 2,
      fuerte: false,
      agencia: true,
      contexto: "Un muerto en la A-6",
    });
    expect(UMBRAL_FUERTE).toBe(3);
  });
  it("Wikipedia: guarda visitas y veces sobre la media", () => {
    const [f] = filasDescartesWikipedia({
      ahora,
      picos: [{ articulo: "Kayla Harrison", visitas: 9000, ratio: 10 }],
      ia: new Map([["Kayla Harrison", ia("Luchadora de MMA")]]),
      descartadas: [{ termino: "Kayla Harrison", motivo: "fuera_de_linea" }],
      modelo: "m",
    });
    expect(f).toMatchObject({
      fuente: "wikipedia",
      wikipedia_ratio: 10,
      wikipedia_visitas: 9000,
      puntos: 3,
      fuerte: true,
      clave: "kayla harrison",
    });
    expect(f?.contexto).toContain("9000 visitas, ×10"); // en español, 4 cifras van sin punto
  });
});

describe("textos de las excepciones", () => {
  it("propone un criterio a partir del tema y la nota", () => {
    expect(sugerenciaExcepcion("Pedri", "hay dinero público")).toBe(
      "Temas como «Pedri»: hay dinero público",
    );
    expect(sugerenciaExcepcion("Pedri", null)).toBe(
      "Temas como «Pedri»: explica aquí cuándo nos interesan.",
    );
  });
  it("las reglas de «sí» y las excepciones se añaden sin romper el formato ni repetir", () => {
    expect(lineaReglaSi("Pedri => /deportes/; otra\nlínea")).toBe("Pedri /deportes/ otra línea");
    expect(anadirLinea("pedro sanchez\nvox", "Pedri")).toBe("pedro sanchez\nvox\nPedri");
    expect(anadirLinea("pedro sanchez\npedri", "Pedri")).toBe("pedro sanchez\npedri");
    expect(anadirLinea("", "- criterio")).toBe("- criterio");
    expect(criterioValido("corto")).toBeNull();
    expect(criterioValido("  Futbolistas:   si hay dinero público  ")).toBe(
      "Futbolistas: si hay dinero público",
    );
    expect(criterioValido("x".repeat(301))).toBeNull();
  });
});

describe("guardado", () => {
  it("guarda un tema por día sin tocar la revisión y borra lo de más de 30 días; si falla, no rompe", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const lt = vi.fn(async () => ({ error: null }));
    const client = { from: () => ({ upsert, delete: () => ({ lt }) }) } as never;
    const fila = { dia: "2026-11-16", clave: "pedri", tema: "Pedri", fuente: "x_trends" };
    expect(await guardarDescartes(client, [fila], ahora)).toEqual({ descartes_guardados: 1 });
    expect(upsert).toHaveBeenCalledWith([fila], { onConflict: "dia,clave" });
    expect(lt).toHaveBeenCalledWith("dia", "2026-10-18"); // 30 días antes, en hora de Madrid (aún en horario de verano)
    expect(await guardarDescartes(client, [], ahora)).toEqual({ descartes_guardados: 0 });
    const roto = { from: () => ({ upsert: async () => ({ error: { message: "x" } }) }) } as never;
    expect(await guardarDescartes(roto, [fila], ahora)).toEqual({
      descartes_guardados: 0,
      descartes_error: "No se pudieron guardar los descartes.",
    });
  });
});

import { readFileSync } from "node:fs";
import { describe as describeImport, it as itImport, expect as expectImport } from "vitest";
describeImport("descartes.functions.ts", () => {
  itImport("no importa el cliente privilegiado", () => {
    const src = readFileSync("src/lib/descartes.functions.ts", "utf8");
    expectImport(src).not.toMatch(/client\.server/);
    expectImport(src).not.toMatch(/supabaseAdmin/);
  });
});
