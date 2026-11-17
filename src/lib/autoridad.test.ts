import { describe, expect, it } from "vitest";
import {
  calcularAutoridad,
  entidadesValidas,
  MAX_PIEZAS,
  mesDePeriodo,
  patronTema,
  seccionDeUrl,
  slugDeUrl,
  textoPeriodo,
  tituloDeSlug,
  type FilaAutoridad,
} from "./autoridad";
import { leerFilasAutoridad, type LectorAutoridad } from "./autoridad.server";

const D = "https://www.ejemplo.es";
const fila = (
  ruta: string,
  clics: number,
  desde = "2026-08-15",
  hasta = "2026-11-14",
): FilaAutoridad => ({
  url: ruta.startsWith("https://") ? ruta : `${D}${ruta}`,
  clics,
  desde,
  hasta,
});

describe("patronTema", () => {
  it("quita tildes, mayúsculas, prefijos, paréntesis y palabras vacías", () => {
    expect(patronTema("Yolanda Díaz")).toBe("yolanda-diaz");
    expect(patronTema("[SIN DISCOVER] José Luis Martínez-Almeida")).toBe(
      "jose-luis-martinez-almeida",
    );
    expect(patronTema("Maximiliano de México")).toBe("maximiliano-mexico");
    expect(patronTema("Marina Valverde (cantante)")).toBe("marina-valverde");
    expect(patronTema("Daniel Corrêa Freitas")).toBe("daniel-correa-freitas");
  });
  it("separa las palabras de los hashtags", () => {
    expect(patronTema("#FelizLunes")).toBe("feliz-lunes");
    expect(patronTema("#DragRaceEs")).toBe("drag-race-es");
  });
  it("no busca nombres que no sirven", () => {
    expect(patronTema("")).toBe("");
    expect(patronTema("J")).toBe("");
    expect(patronTema("de la")).toBe("");
    expect(patronTema("2026")).toBe("");
    expect(patronTema("Milo J")).toBe("milo-j");
  });
});

describe("direcciones de las piezas", () => {
  it("saca las palabras de la dirección, con o sin número de pieza", () => {
    expect(slugDeUrl(`${D}/politica/yolanda-diaz-oit_1_13481424.html`)).toBe("yolanda-diaz-oit");
    expect(slugDeUrl(`${D}/cultura/javier-bardem-serie_132_13494514.html`)).toBe(
      "javier-bardem-serie",
    );
    expect(slugDeUrl(`${D}/blog/una-pieza.html`)).toBe("una-pieza");
    expect(slugDeUrl("no es una dirección")).toBe("");
  });
  it("pone nombre a la sección (carpeta o subdominio)", () => {
    expect(seccionDeUrl(`${D}/politica/x_1_1.html`)).toBe("Política");
    expect(seccionDeUrl(`${D}/castilla-y-leon/sociedad/x_1_1.html`)).toBe("Castilla y León");
    expect(seccionDeUrl("https://cordoba.ejemplo.es/hoy/x_1_1.html")).toBe("Cordoba");
    expect(seccionDeUrl(`${D}/x_1_1.html`)).toBe("");
  });
  it("convierte la dirección en un título legible", () => {
    expect(tituloDeSlug("almeida-da-bendicion-noria")).toBe("Almeida da bendicion noria");
  });
});

describe("fechas", () => {
  it("una exportación de un solo mes tiene mes; la de varios meses, no", () => {
    expect(mesDePeriodo("2026-09-01", "2026-09-30")).toBe("2026-09");
    expect(mesDePeriodo("2026-08-15", "2026-11-14")).toBeNull();
  });
  it("escribe el periodo en español", () => {
    expect(textoPeriodo({ desde: "2026-09-01", hasta: "2026-11-15" })).toBe(
      "del 1 de septiembre al 15 de noviembre",
    );
    expect(textoPeriodo({ desde: "2025-12-01", hasta: "2026-01-31" })).toBe(
      "del 1 de diciembre de 2025 al 31 de enero de 2026",
    );
  });
});

describe("calcularAutoridad", () => {
  const filas = [
    fila("/economia/patronal-candidatura-yolanda-diaz-oit_1_1.html", 5000),
    fila("/economia/garamendi-reforma-laboral-yolanda-diaz_1_2.html", 4000),
    fila("/economia/trabajadores-oit-rival-yolanda-diaz_1_3.html", 3000),
    fila("/galicia/subasta-edificio-marcial-dorado_1_4.html", 1500),
    fila("/cultura/javier-bardem-suma-boicot_132_5.html", 900),
    fila("/madrid/almeida-noria-gigante_1_6.html", 6000),
    fila("/vertele/evole-rechaza-boicot-la-revuelta_1_7.html", 7000),
    fila("/madrid/almeidas-de-ejemplo_1_8.html", 100),
  ];

  it("alta con 3 piezas o más, media con 1 o 2 y tema nuevo con ninguna", () => {
    const a = calcularAutoridad(filas, ["Yolanda Díaz", "Marcial Dorado", "Pedri"]);
    expect(a.periodo).toEqual({ desde: "2026-08-15", hasta: "2026-11-14" });
    expect(a.temas["Yolanda Díaz"]).toMatchObject({
      nivel: "alta",
      total: 3,
      clics: 12000,
      unaPalabra: false,
    });
    expect(a.temas["Yolanda Díaz"]?.piezas.map((p) => p.clics)).toEqual([5000, 4000, 3000]);
    expect(a.temas["Yolanda Díaz"]?.piezas[0]).toMatchObject({
      titulo: "Patronal candidatura yolanda diaz oit",
      seccion: "Economía",
      mes: null,
    });
    expect(a.temas["Marcial Dorado"]).toMatchObject({ nivel: "media", total: 1 });
    expect(a.temas["Pedri"]).toMatchObject({
      nivel: "nuevo",
      total: 0,
      clics: 0,
      piezas: [],
      unaPalabra: false,
    });
  });

  it("exige el nombre completo y palabras enteras (homónimos)", () => {
    const a = calcularAutoridad(filas, ["Pilar Bardem", "Bardem", "Almeida"]);
    expect(a.temas["Pilar Bardem"]?.total).toBe(0);
    expect(a.temas["Bardem"]).toMatchObject({ total: 1, unaPalabra: true });
    expect(a.temas["Almeida"]).toMatchObject({ total: 1, unaPalabra: true }); // no cuenta «almeidas»
  });

  it("encuentra el tema aunque la dirección lleve o no el artículo", () => {
    expect(calcularAutoridad(filas, ["La Revuelta"]).temas["La Revuelta"]?.total).toBe(1);
    expect(calcularAutoridad(filas, ["Revuelta"]).temas["Revuelta"]?.total).toBe(1);
  });

  it("suma la misma pieza en varios meses y se queda con el mes más reciente", () => {
    const url = "/politica/yolanda-diaz-oit_1_9.html";
    const a = calcularAutoridad(
      [fila(url, 1000, "2026-09-01", "2026-09-30"), fila(url, 500, "2026-10-01", "2026-10-31")],
      ["Yolanda Díaz"],
    );
    expect(a.periodo).toEqual({ desde: "2026-09-01", hasta: "2026-10-31" });
    expect(a.temas["Yolanda Díaz"]).toMatchObject({ total: 1, clics: 1500, ultimoMes: "2026-10" });
    expect(a.temas["Yolanda Díaz"]?.piezas[0]?.mes).toBe("2026-10");
  });

  it("como mucho MAX_PIEZAS piezas, pero cuenta todas", () => {
    const muchas = Array.from({ length: MAX_PIEZAS + 5 }, (_, i) =>
      fila(`/politica/ayuso-${i}_1_${i}.html`, i),
    );
    const r = calcularAutoridad(muchas, ["Ayuso"]).temas["Ayuso"];
    expect(r?.total).toBe(MAX_PIEZAS + 5);
    expect(r?.piezas).toHaveLength(MAX_PIEZAS);
    expect(r?.piezas[0]?.clics).toBe(MAX_PIEZAS + 4);
  });

  it("sin datos cargados no hay periodo; un nombre que no sirve da null", () => {
    expect(calcularAutoridad([], ["Ayuso"]).periodo).toBeNull();
    expect(calcularAutoridad(filas, ["J"]).temas["J"]).toBeNull();
  });
});

describe("entidadesValidas", () => {
  it("solo textos, recortados, sin repetir", () => {
    expect(entidadesValidas(["Ayuso", " Ayuso ", 3, null, "", "x".repeat(300)])).toEqual([
      "Ayuso",
      "x".repeat(200),
    ]);
    expect(entidadesValidas("Ayuso")).toEqual([]);
  });
});

describe("leerFilasAutoridad", () => {
  function lector(paginas: unknown[][], error: unknown = null) {
    const rangos: [number, number][] = [];
    const db: LectorAutoridad = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (a: number, b: number) => {
              rangos.push([a, b]);
              return { data: paginas[rangos.length - 1] ?? [], error };
            },
          }),
        }),
      }),
    };
    return { db, rangos };
  }
  const buena = { url: `${D}/a/b_1_1.html`, clics: 10, desde: "2026-09-01", hasta: "2026-09-30" };

  it("lee de mil en mil hasta que se acaba y descarta filas raras", async () => {
    const llena = Array.from({ length: 1000 }, () => buena);
    const { db, rangos } = lector([
      llena,
      [buena, { ...buena, url: "http://x" }, { ...buena, clics: -1 }, null],
    ]);
    const filas = await leerFilasAutoridad(db);
    expect(filas).toHaveLength(1001);
    expect(rangos).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("si falla la lectura, lanza un error", async () => {
    await expect(leerFilasAutoridad(lector([], { message: "x" }).db)).rejects.toThrow(
      "No se pudo leer la autoridad en Discover.",
    );
  });
});
