import { describe, it, expect } from "vitest";
import { colocarBurbujas, etiquetaDe, partirNombre, radioBurbuja } from "./discoverMapLayout";
import type { GrupoMapa, TemaMapa } from "./discoverMap";

const tema = (nombre: string, medios: number): TemaMapa => ({
  id: nombre.toLowerCase(),
  nombre,
  alias: [],
  medios,
  mediosUltimaHora: 0,
  subiendo: false,
  primeraVez: "2026-11-15T10:00:00Z",
  listaMedios: [],
  titulares: [],
  relacionados: [],
  hayAlerta: false,
});
const GRUPOS: GrupoMapa[] = [
  {
    id: "otros",
    nombre: "Otros temas",
    temas: [tema("ERC", 2), tema("Julia Otero", 2), tema("Nvidia · Huang", 2)],
  },
  {
    id: "sanchez",
    nombre: "Pedro Sánchez · PSOE · Alberto Núñez Feijóo",
    temas: [
      tema("Pedro Sánchez", 10),
      tema("PSOE", 9),
      tema("Alberto Núñez Feijóo", 9),
      tema("Ada Colau", 2),
    ],
  },
  {
    id: "vox",
    nombre: "Vox · Abascal · Jordi Wild",
    temas: [tema("Vox", 7), tema("Abascal", 4), tema("Jordi Wild", 4)],
  },
  {
    id: "abalos",
    nombre: "Ábalos · Antifraude",
    temas: [tema("Ábalos", 3), tema("Antifraude", 2)],
  },
];

describe("colocarBurbujas", () => {
  const m = colocarBurbujas(GRUPOS);

  it("ninguna burbuja pisa a otra y cada una queda dentro de su grupo", () => {
    for (let i = 0; i < m.burbujas.length; i++)
      for (let j = i + 1; j < m.burbujas.length; j++) {
        const a = m.burbujas[i]!,
          b = m.burbujas[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    for (const b of m.burbujas) {
      const g = m.grupos.find((x) => x.indice === b.grupo)!;
      expect(Math.hypot(b.x - g.x, b.y - g.y) + b.r).toBeLessThanOrEqual(g.r + 0.001);
    }
    for (let i = 0; i < m.grupos.length; i++)
      for (let j = i + 1; j < m.grupos.length; j++) {
        const a = m.grupos[i]!,
          b = m.grupos[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
  });

  it("el área de la burbuja es proporcional a los medios y todo cabe en la caja", () => {
    expect(radioBurbuja(4) / radioBurbuja(1)).toBeCloseTo(2);
    const [x0, y0, w, h] = m.caja;
    for (const g of m.grupos) {
      expect(g.x - g.r).toBeGreaterThanOrEqual(x0);
      expect(g.x + g.r).toBeLessThanOrEqual(x0 + w);
      expect(g.y - g.r - 20).toBeGreaterThanOrEqual(y0);
      expect(g.y + g.r).toBeLessThanOrEqual(y0 + h);
    }
  });

  it("«Otros temas» va siempre al final y el resultado no cambia entre llamadas", () => {
    expect(m.grupos.at(-1)?.id).toBe("otros");
    expect(m.grupos[0]?.id).toBe("sanchez");
    expect(colocarBurbujas(GRUPOS)).toEqual(m);
    expect(colocarBurbujas([])).toEqual({ grupos: [], burbujas: [], caja: [0, 0, 1, 1] });
  });
});

describe("etiquetas", () => {
  it("parte el nombre en líneas que caben, o lo saca fuera si no cabe", () => {
    expect(partirNombre("PSOE", 100, 14)).toEqual(["PSOE"]);
    expect(partirNombre("Pedro Sánchez", 70, 14)).toEqual(["Pedro", "Sánchez"]);
    expect(partirNombre("Alberto Núñez Feijóo", 75, 14)).toEqual(["Alberto", "Núñez", "Feijóo"]);
    expect(partirNombre("Antifraude", 40, 14)).toBeNull();
    expect(etiquetaDe("Antifraude", radioBurbuja(2)).dentro).toBe(false);
    expect(etiquetaDe("Pedro Sánchez", radioBurbuja(10))).toMatchObject({
      dentro: true,
      lineas: ["Pedro", "Sánchez"],
    });
  });
});
