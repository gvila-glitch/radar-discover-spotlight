import { describe, it, expect } from "vitest";
import {
  construirDiscoverMap,
  dominioDe,
  enPestana,
  nombresDelTitular,
  palabrasCorrientes,
  textoRadar,
  ventanaValida,
  type AlertaReciente,
  type ArticuloSnoop,
  type TemaMapa,
} from "./discoverMap";

const AHORA = new Date("2026-11-15T16:00:00Z");
let n = 0;
const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();
const art = (medio: string, titular: string, haceMin = 10, alerta?: string): ArticuloSnoop => ({
  id: ++n,
  url: `https://${medio}/a${n}`,
  medio,
  titular,
  recibido_en: hace(haceMin),
  alerta: alerta ?? null,
});
const mapa = (
  articulos: ArticuloSnoop[],
  alertas: AlertaReciente[] = [],
  ventana: 1 | 3 | 6 = 6,
  extra: { propio?: string | null; referencia?: string[] } = {},
) => construirDiscoverMap({ articulos, alertas, ahora: AHORA, ventana, ...extra });
const temas = (m: ReturnType<typeof mapa>) =>
  Object.fromEntries(m.temas.map((t) => [t.nombre, t])) as Record<string, TemaMapa>;

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
  it("la ventana admite 1, 3, 6 o 24 horas; por defecto, 6", () => {
    expect(ventanaValida(1)).toBe(1);
    expect(ventanaValida(24)).toBe(24);
    expect(ventanaValida(12)).toBe(6);
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
      [{ id: 7, entidad: "[SIN DISCOVER] Pablo Bustinduy", creada_en: hace(60) }],
    );
    const t = temas(m)["Pablo Bustinduy"]!;
    expect(t.medios).toBe(3);
    expect(t.alias).toEqual(["Figaredo"]); // los dos artículos de Figaredo también hablan de Bustinduy
    // elmundo.es ya lo tenía hace 2 horas: repetir el tema no cuenta como medio nuevo en la última hora.
    expect(t.mediosUltimaHora).toBe(2);
    expect(t.subiendo).toBe(true);
    expect(t.alerta).toEqual({ id: 7, creada_en: hace(60), reciente: true });
    expect(t.llegadas.map((l) => l.medio)).toEqual(["elmundo.es", "lasexta.com", "elpais.com"]); // por orden de llegada
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

  it("ordena por ritmo y dice con qué otros temas sale cada uno", () => {
    const m = mapa([
      art("elpais.com", "Abascal y Vox, contra los datos de Cornellà"),
      art("okdiario.com", "Abascal llena el mitin de Vox en Cornellá"),
      art("lasexta.com", "Abascal no se arrepiente"),
      art("elmundo.es", "Vox presenta su programa"),
      art("cadenaser.com", "Vox denuncia al portavoz"),
      art("libertaddigital.com", "Vox sube en las encuestas"),
      art("abc.es", "Pedro Sánchez promete permisos por amistad", 200),
      art("publico.es", "Sánchez avanza su programa", 200),
      art("rtve.es", "Sánchez, en Albacete", 200),
      art("elespanol.com", "Sánchez critica a Abascal", 200),
    ]);
    expect(m.temas.map((t) => t.nombre)).toEqual(["Vox", "Abascal", "Pedro Sánchez"]);
    expect(temas(m)["Pedro Sánchez"]!.relacionados.map((r) => r.nombre)).toEqual(["Abascal"]);
    expect(temas(m)["Pedro Sánchez"]!.mediosUltimaHora).toBe(0);
  });

  it("nosotros: puesto de llegada y nuestra pieza; no contamos como competencia", () => {
    const articulos = [
      art("elpais.com", "Yolanda Díaz deja la vicepresidencia", 50),
      art("nuestro.es", "Yolanda Díaz anuncia que deja el Gobierno", 40),
      art("elmundo.es", "Yolanda Díaz se va", 30),
      art("abc.es", "La marcha de Yolanda Díaz", 20),
    ];
    const t = temas(mapa(articulos, [], 6, { propio: "https://www.Nuestro.es/" }))["Yolanda Díaz"]!;
    expect(t.medios).toBe(3);
    expect(t.nosotros).toMatchObject({
      puesto: 2,
      titular: "Yolanda Díaz anuncia que deja el Gobierno",
    });
    expect(t.llegadas.map((l) => l.medio)).toEqual([
      "elpais.com",
      "nuestro.es",
      "elmundo.es",
      "abc.es",
    ]);
    expect(t.titulares.map((x) => x.medio)).not.toContain("nuestro.es");
    // Sin nuestro dominio no se sabe si estamos: contamos como un medio más.
    const sin = temas(mapa(articulos))["Yolanda Díaz"]!;
    expect(sin.nosotros).toBeNull();
    expect(sin.medios).toBe(4);
  });

  it("categorías de Snoop (de la más frecuente a la menos) y medios de referencia limpios", () => {
    const m = mapa(
      [
        art("elpais.com", "Yolanda Díaz sube el salario mínimo", 10, "Economía"),
        art("elmundo.es", "Acuerdo de Yolanda Díaz para el salario mínimo", 10, "Economía"),
        art("abc.es", "Yolanda Díaz lleva el salario mínimo al Congreso", 10, "Política"),
      ],
      [],
      6,
      { referencia: ["https://www.elpais.com/", "elmundo.es", "elmundo.es", ""] },
    );
    expect(m.temas[0]?.categorias).toEqual(["Economía", "Política"]);
    expect(m.categorias).toEqual(["Economía", "Política"]);
    expect(m.referencia).toEqual(["elpais.com", "elmundo.es"]);
  });

  it("distingue la alerta de esta vez de una anterior, de otra ocasión en que el tema fue noticia", () => {
    const articulos = [
      art("elpais.com", "María Tardón, en el foco", 40),
      art("elmundo.es", "Tardón responde a las críticas", 30),
      art("abc.es", "Tardón comparece hoy", 20),
    ];
    const anterior = { id: 45, entidad: "maría tardón", creada_en: hace(3 * 24 * 60) };
    const deHoy = { id: 60, entidad: "María Tardón", creada_en: hace(90) };
    expect(temas(mapa(articulos, [anterior]))["María Tardón"]?.alerta).toEqual({
      id: 45,
      creada_en: anterior.creada_en,
      reciente: false,
    });
    expect(temas(mapa(articulos, [anterior, deHoy]))["María Tardón"]?.alerta).toMatchObject({
      id: 60,
      reciente: true,
    });
  });

  it("dice cuántos artículos forman los temas y por qué se quedan fuera los demás", () => {
    const m = mapa([
      art("elpais.com", "Pedro Sánchez comparece en el Congreso"),
      art("elmundo.es", "Pedro Sánchez defiende la financiación"),
      art("abc.es", "Pedro Sánchez responde a la oposición"),
      art("lavanguardia.com", "La inflación se dispara en noviembre"),
      art("20minutos.es", "El precio de la luz baja mañana"),
      art("elconfidencial.com", "Ábalos recurre al Supremo", 200),
      art("publico.es", "Ábalos pide anular la causa", 200),
    ]);
    expect(m.temas.map((t) => t.nombre)).toEqual(["Pedro Sánchez"]);
    expect(m.resumen).toEqual({ enTemas: 3, sinNombre: 2, pocosMedios: 2, fueraDeLista: 0 });
  });

  it("sin artículos devuelve una lista vacía", () => {
    expect(mapa([])).toEqual({
      temas: [],
      categorias: [],
      referencia: [],
      propio: null,
      articulos: 0,
      resumen: { enTemas: 0, sinNombre: 0, pocosMedios: 0, fueraDeLista: 0 },
      ventana: 6,
      generado: AHORA.toISOString(),
    });
    expect(mapa([art("elpais.com", "Pablo Bustinduy en el debate", 7 * 60)]).temas).toEqual([]);
  });
});

const tema = (o: Partial<TemaMapa>): TemaMapa => ({
  id: "t",
  nombre: "Tema",
  alias: [],
  medios: 3,
  mediosUltimaHora: 0,
  subiendo: false,
  primeraVez: hace(30),
  llegadas: [],
  titulares: [],
  nosotros: null,
  categorias: [],
  relacionados: [],
  alerta: null,
  ...o,
});

describe("pestañas, radar y dominio", () => {
  it("cada pestaña reúne lo suyo", () => {
    const entrando = tema({ subiendo: true, medios: 4 });
    const saturado = tema({ subiendo: true, medios: 7 });
    const nuestro = tema({ nosotros: { puesto: 1, titular: "t", url: "u", hora: hace(5) } });
    expect(enPestana(entrando, "entrando")).toBe(true);
    expect(enPestana(saturado, "entrando")).toBe(false);
    expect(enPestana(saturado, "consolidados")).toBe(true);
    expect(enPestana(entrando, "sin_nosotros")).toBe(true);
    expect(enPestana(nuestro, "sin_nosotros")).toBe(false);
    expect(enPestana(nuestro, "todo")).toBe(true);
  });

  it("dice cuánto antes o después avisó el radar", () => {
    expect(textoRadar("2026-11-15T15:00:00Z", "2026-11-15T15:35:00Z")).toEqual({
      texto: "avisó 35 min antes",
      antes: true,
    });
    expect(textoRadar("2026-11-15T15:45:00Z", "2026-11-15T15:35:00Z")).toEqual({
      texto: "avisó 10 min después",
      antes: false,
    });
    expect(textoRadar("2026-11-15T12:00:00Z", "2026-11-15T15:00:00Z").texto).toBe(
      "avisó 3 h antes",
    );
  });

  it("limpia el dominio de Configuración", () => {
    expect(dominioDe("https://www.Nuestro.es/portada")).toBe("nuestro.es");
    expect(dominioDe(" nuestro.es ")).toBe("nuestro.es");
    expect(dominioDe("")).toBeNull();
    expect(dominioDe(null)).toBeNull();
    expect(dominioDe("nuestro")).toBeNull();
  });
});
