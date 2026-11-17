import { describe, it, expect, vi } from "vitest";
import {
  conNoticia,
  conResumen,
  detalleX,
  elegirNoticia,
  enlaceX,
  leerContexto,
  leerNoticiasGoogle,
  leerResumenWikipedia,
  primeraFrase,
  sinPrefijo,
  textoDeBusqueda,
} from "./contexto";
import { AGENTE, buscarNoticiaGoogle, buscarResumenWikipedia } from "./contexto.server";
import { planificarAlertasTrends } from "./trendsAlertas";

const RSS = `<?xml version="1.0"?><rss><channel><title>"Yolanda Díaz" when:1d - Google Noticias</title>
<item><title>Yolanda Díaz presenta el programa de Sumar &quot;para la gente&quot; - eldiario.es</title>
<link>https://news.google.com/a</link><source url="https://www.eldiario.es">eldiario.es</source></item>
<item><title>Otra noticia - El País</title><source url="https://elpais.com">El País</source></item></channel></rss>`;

describe("piezas de contexto", () => {
  it("resumen de Wikipedia: descripción con mayúscula y primera frase; nada si es desambiguación", () => {
    expect(
      leerResumenWikipedia({
        type: "standard",
        description: "política española",
        extract:
          "Marina Valverde (Madrid, 1980) es una política española. Fue diputada en la XIV legislatura.",
      }),
    ).toEqual({
      descripcion: "Política española",
      frase: "Marina Valverde (Madrid, 1980) es una política española.",
    });
    expect(
      leerResumenWikipedia({ type: "disambiguation", description: "x", extract: "y" }),
    ).toBeNull();
    expect(leerResumenWikipedia({ type: "standard" })).toBeNull();
    expect(leerResumenWikipedia("no es un objeto")).toBeNull();
  });
  it("primera frase: corta en el primer punto y recorta las muy largas", () => {
    expect(primeraFrase("Nació en 1990. Es actriz.")).toBe("Nació en 1990.");
    expect(primeraFrase("Una sola frase sin punto final")).toBe("Una sola frase sin punto final");
    expect(primeraFrase("palabra ".repeat(60))!.endsWith("…")).toBe(true);
    expect(primeraFrase("   ")).toBeNull();
  });
  it("Google Noticias: primer titular sin el nombre del medio al final y con las comillas bien", () => {
    expect(leerNoticiasGoogle(RSS)[0]).toEqual({
      titular: 'Yolanda Díaz presenta el programa de Sumar "para la gente"',
      medio: "eldiario.es",
    });
    expect(leerNoticiasGoogle("<rss><channel></channel></rss>")).toEqual([]);
    expect(leerNoticiasGoogle(RSS)).toHaveLength(2);
  });
  it("primera frase: no corta en iniciales ni abreviaturas", () => {
    expect(
      primeraFrase(
        "Pedri es un futbolista español que juega en el F. C. Barcelona. Debutó en 2020.",
      ),
    ).toBe("Pedri es un futbolista español que juega en el F. C. Barcelona.");
    expect(primeraFrase("Vive en EE. UU. desde 2010. Es actor.")).toBe(
      "Vive en EE. UU. desde 2010.",
    );
    expect(primeraFrase("La entrevistó la Dra. Pérez en 2019. Luego se fue.")).toBe(
      "La entrevistó la Dra. Pérez en 2019.",
    );
  });
  it("solo vale un titular que habla del tema", () => {
    const n = (titular: string) => ({ titular, medio: "M" });
    expect(elegirNoticia([n("Cocinar para ser y hacer feliz")], "#FelizLunes")).toBeNull();
    expect(
      elegirNoticia([n("Recetas felices"), n("Feliz lunes: el meme del día")], "#FelizLunes")
        ?.titular,
    ).toBe("Feliz lunes: el meme del día");
    expect(elegirNoticia([n("Yolanda Diaz retira su candidatura")], "Yolanda Díaz")?.titular).toBe(
      "Yolanda Diaz retira su candidatura",
    );
    expect(elegirNoticia([n("El PP gana en Galicia")], "PP")?.titular).toBe(
      "El PP gana en Galicia",
    );
    expect(elegirNoticia([], "Pedri")).toBeNull();
  });
  it("hashtags se buscan como palabras; detalle de X; frases montadas; enlace a X", () => {
    expect(textoDeBusqueda("#SanchezFueraDeControl")).toBe("Sanchez Fuera De Control");
    expect(textoDeBusqueda("#LaHora16N")).toBe("La Hora 16N");
    expect(textoDeBusqueda("Yolanda Díaz")).toBe("Yolanda Díaz");
    expect(detalleX({ posicion: 4, categoria: "Política", publicaciones: 12300 })).toBe(
      "puesto 4 · Política · 12.300 publicaciones",
    );
    expect(detalleX({ posicion: 9, categoria: "", publicaciones: 0 })).toBe("puesto 9");
    expect(
      conNoticia("En tendencia en X España (puesto 4) · Fuente: X", {
        titular: "Titular",
        medio: "El País",
      }),
    ).toBe("Se habla de: «Titular» (El País) · En tendencia en X España (puesto 4) · Fuente: X");
    expect(
      conResumen("Pico en Wikipedia · Fuente: Wikipedia", {
        descripcion: "Cantante española",
        frase: "Es cantante.",
      }),
    ).toBe("Cantante española · «Es cantante.» · Pico en Wikipedia · Fuente: Wikipedia");
    expect(conResumen("C", { descripcion: null, frase: null })).toBe("C");
    expect(enlaceX("Yolanda Díaz")).toBe("https://x.com/search?q=Yolanda%20D%C3%ADaz");
    expect(sinPrefijo("[SIN DISCOVER] Pedri")).toBe("Pedri");
  });
});

describe("llamadas a internet (simuladas)", () => {
  it("Wikipedia: pide el resumen con la identificación genérica y nunca rompe", async () => {
    const pedir = vi.fn(async () =>
      Response.json({
        type: "standard",
        description: "futbolista español",
        extract: "Pedri es futbolista.",
      }),
    );
    expect(
      await buscarResumenWikipedia("Pedro González López", pedir as unknown as typeof fetch),
    ).toEqual({ descripcion: "Futbolista español", frase: "Pedri es futbolista." });
    const [url, opciones] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://es.wikipedia.org/api/rest_v1/page/summary/Pedro_Gonz%C3%A1lez_L%C3%B3pez",
    );
    expect((opciones.headers as Record<string, string>)["User-Agent"]).toBe(AGENTE);
    expect(AGENTE).not.toMatch(/radar/i);
    expect(
      await buscarResumenWikipedia(
        "X",
        (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await buscarResumenWikipedia("X", (async () => {
        throw new Error("red");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
  it("Google Noticias: busca en España y en las últimas 24 h; ante un fallo devuelve nada", async () => {
    const pedir = vi.fn(async () => new Response(RSS, { status: 200 }));
    expect(
      await buscarNoticiaGoogle("Yolanda Díaz", pedir as unknown as typeof fetch),
    ).toMatchObject({ medio: "eldiario.es" });
    const url = (pedir.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain("q=Yolanda%20D%C3%ADaz%20when%3A1d");
    expect(url).toContain("hl=es&gl=ES&ceid=ES:es");
    expect(
      await buscarNoticiaGoogle(
        "X",
        (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await buscarNoticiaGoogle("X", (async () => {
        throw new Error("tiempo");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});

describe("contexto de las alertas de X", () => {
  it("lleva la categoría y las publicaciones que da X", () => {
    const now = new Date("2026-11-16T10:00:00Z");
    const plan = planificarAlertasTrends({
      now,
      config: { max_alertas_dia: "8", hora_inicio: "7", hora_fin: "24" },
      exclusiones: [],
      alertas: [],
      totalHoy: 0,
      trends: [],
      xTendencias: [
        {
          id: 1,
          nombre: "Yolanda Díaz",
          posicion: 4,
          capturado_en: "2026-11-16T09:50:00Z",
          categoria: "Política",
          publicaciones: 12300,
        },
      ],
    });
    expect(plan.nuevas[0]?.contexto).toBe(
      "En tendencia en X España (puesto 4 · Política · 12.300 publicaciones) · Fuente: X",
    );
  });
});

describe("leerContexto (partes del contexto para la ficha)", () => {
  const base = { trends_activo: false, wikipedia_ratio: null };
  const vacio = { queEs: null, frase: null, seHabla: null, x: null, resto: null };
  const soloX = `En tendencia en X España (${detalleX({ posicion: 4, categoria: "Política", publicaciones: 12300 })}) · Fuente: X`;

  it("alerta de X con noticia: titular, medio, categoría y publicaciones", () => {
    const contexto = conNoticia(soloX, {
      titular: "Los sindicatos respaldan a Yolanda Díaz",
      medio: "Europa Press",
    });
    expect(leerContexto({ ...base, contexto })).toEqual({
      ...vacio,
      seHabla: { titular: "Los sindicatos respaldan a Yolanda Díaz", medio: "Europa Press" },
      x: { categoria: "Política", publicaciones: "12.300 publicaciones" },
    });
  });

  it("alerta de X sin noticia y combinada después con otra fuente", () => {
    expect(
      leerContexto({
        ...base,
        contexto:
          "En tendencia en X España (puesto 7 · Entretenimiento) · Fuente: X · También en Wikipedia",
      }),
    ).toEqual({ ...vacio, x: { categoria: "Entretenimiento", publicaciones: null } });
    expect(
      leerContexto({ ...base, contexto: "En tendencia en X España (puesto 0) · Fuente: X" }),
    ).toEqual(vacio);
  });

  it("alerta de Trends: el titular es de lo que se habla; con X, sus datos salen de «Fuentes»", () => {
    const trends = { ...base, trends_activo: true };
    expect(
      leerContexto({
        ...trends,
        contexto:
          "La final de Supervivientes (Telecinco) · Fuentes: Google Trends y X (puesto 3 · 31.000 publicaciones)",
      }),
    ).toEqual({
      ...vacio,
      seHabla: { titular: "La final de Supervivientes (Telecinco)", medio: null },
      x: { categoria: null, publicaciones: "31.000 publicaciones" },
    });
    expect(
      leerContexto({ ...trends, contexto: "Tendencia en Google España · Fuente: Google Trends" }),
    ).toEqual(vacio);
  });

  it("alerta de Wikipedia: qué es y primera frase, cada una por separado", () => {
    const pico =
      "Pico en Wikipedia: 9.000 visitas, ×6 sobre su media de 7 días · Fuente: Wikipedia";
    const wiki = { ...base, wikipedia_ratio: 6 };
    const con = (descripcion: string | null, frase: string | null) =>
      leerContexto({ ...wiki, contexto: conResumen(pico, { descripcion, frase }) });
    expect(con("Narcotraficante gallego", "Marcial Dorado es un empresario gallego.")).toEqual({
      ...vacio,
      queEs: "Narcotraficante gallego",
      frase: "Marcial Dorado es un empresario gallego.",
    });
    expect(con("Narcotraficante gallego", null)).toEqual({
      ...vacio,
      queEs: "Narcotraficante gallego",
    });
    expect(con(null, "Marcial Dorado es un empresario gallego.")).toEqual({
      ...vacio,
      frase: "Marcial Dorado es un empresario gallego.",
    });
    expect(con(null, null)).toEqual(vacio);
  });

  it("al combinar alertas manda la fuente que la creó, no los campos que se añaden después", () => {
    // Nació en Wikipedia y luego llegó Google: la descripción sigue siendo «qué es», no un titular.
    const wikiMasGoogle = conResumen(
      "Pico en Wikipedia: 9.000 visitas, ×6 sobre su media de 7 días · Fuente: Wikipedia · También en Google Trends",
      { descripcion: "Narcotraficante gallego", frase: null },
    );
    expect(
      leerContexto({ contexto: wikiMasGoogle, trends_activo: true, wikipedia_ratio: 6 }),
    ).toEqual({ ...vacio, queEs: "Narcotraficante gallego" });
    // Nació en Google y luego llegó Wikipedia: el texto sigue siendo el titular.
    expect(
      leerContexto({
        contexto: "Final de Supervivientes · Fuente: Google Trends · También en Wikipedia",
        trends_activo: true,
        wikipedia_ratio: 4,
      }),
    ).toEqual({ ...vacio, seHabla: { titular: "Final de Supervivientes", medio: null } });
    // Nació en X sin noticia y luego llegó Google: no hay titular que enseñar.
    expect(
      leerContexto({
        contexto: "En tendencia en X España (puesto 7) · Fuente: X · También en Google Trends",
        trends_activo: true,
        wikipedia_ratio: null,
      }),
    ).toEqual(vacio);
  });

  it("lo que no reconoce lo devuelve tal cual, para no perderlo", () => {
    expect(leerContexto({ ...base, contexto: "Aviso manual: revisar portada" })).toEqual({
      ...vacio,
      resto: "Aviso manual: revisar portada",
    });
    expect(leerContexto({ ...base, contexto: "" })).toEqual(vacio);
  });
});
