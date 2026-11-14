import { describe, expect, it } from "vitest";
import {
  aFilas,
  extraerElementos,
  limpiarDominio,
  MAX_CUERPO_BYTES,
  normalizarUrl,
  procesarEnvioSnoop,
  tokenValido,
  type SnoopFila,
} from "./snoopReceptor";

const SECRETO = "secreto-de-prueba-0123456789";
const CORREO = "persona@ejemplo.test";
const articulo = (extra: Record<string, unknown> = {}) => ({
  Alert_Name: "Prueba",
  Alert_ID: 1,
  Element_URL: "https://www.elpais.com/espana/2026-11-14/tema.html",
  Element_Title: "Titular de ejemplo",
  Element_Headline: "Entradilla de ejemplo",
  Element_Image: "https://x.test/i.jpg",
  Customer_email: CORREO,
  Customer_FirstName: "Nombre",
  Customer_LastName: "Apellido",
  ...extra,
});

type Opciones = {
  token?: string | null;
  secreto?: string | undefined;
  metodo?: string;
  largo?: number | null;
  falla?: boolean;
  crudo?: string;
};
async function enviar(cuerpo: unknown, o: Opciones = {}) {
  const guardadas: SnoopFila[][] = [];
  let leido = false;
  const resultado = await procesarEnvioSnoop({
    token: "token" in o ? (o.token ?? null) : SECRETO,
    secreto: "secreto" in o ? o.secreto : SECRETO,
    metodo: o.metodo ?? "POST",
    contentLength: o.largo ?? null,
    leerTexto: async () => {
      leido = true;
      return o.crudo ?? JSON.stringify(cuerpo);
    },
    guardar: async (filas) => {
      if (o.falla) throw new Error("boom");
      guardadas.push(filas);
      return filas.length;
    },
  });
  return { resultado, guardadas, leido };
}

describe("receptor de Snoop: seguridad", () => {
  it("sin secreto configurado rechaza todo (500)", async () => {
    const { resultado, guardadas } = await enviar(articulo(), { secreto: undefined });
    expect(resultado.status).toBe(500);
    expect(guardadas).toHaveLength(0);
  });
  it("token ausente, incorrecto o parecido: 401, no guarda y ni lee el cuerpo", async () => {
    for (const token of [null, "", "otro", SECRETO + "x", SECRETO.slice(0, -1)]) {
      const { resultado, guardadas, leido } = await enviar(articulo(), { token });
      expect(resultado.status).toBe(401);
      expect(guardadas).toHaveLength(0);
      expect(leido).toBe(false);
    }
  });
  it("método no admitido con token correcto: 405", async () => {
    const { resultado, guardadas } = await enviar(articulo(), { metodo: "DELETE" });
    expect(resultado.status).toBe(405);
    expect(guardadas).toHaveLength(0);
  });
  it("los datos de la cuenta de Snoop no se guardan, ni se devuelven, ni se registran", async () => {
    for (const cuerpo of [
      articulo(),
      [articulo()],
      { Elementos: [articulo()] },
      { raro: true, Customer_email: CORREO },
    ]) {
      const { resultado, guardadas } = await enviar(cuerpo);
      const todo = JSON.stringify({ resultado, guardadas });
      for (const secreto of [CORREO, "Nombre", "Apellido", "i.jpg"])
        expect(todo.includes(secreto)).toBe(false);
    }
  });
  it("tokenValido compara con distintos largos y sin secreto", async () => {
    expect(await tokenValido(SECRETO, SECRETO)).toBe(true);
    expect(await tokenValido("corto", SECRETO)).toBe(false);
    expect(await tokenValido("x".repeat(5000), SECRETO)).toBe(false);
    expect(await tokenValido(null, SECRETO)).toBe(false);
    expect(await tokenValido(SECRETO, undefined)).toBe(false);
    expect(await tokenValido(SECRETO, "")).toBe(false);
  });
});

describe("receptor de Snoop: datos", () => {
  it("un artículo suelto se guarda con el dominio limpio", async () => {
    const { resultado, guardadas } = await enviar(articulo());
    expect(resultado.status).toBe(200);
    expect(resultado.cuerpo["guardados"]).toBe(1);
    expect(guardadas[0]).toEqual([
      {
        url: "https://www.elpais.com/espana/2026-11-14/tema.html",
        medio: "elpais.com",
        titular: "Titular de ejemplo",
        entradilla: "Entradilla de ejemplo",
        alerta: "Prueba",
      },
    ]);
  });
  it("lista con duplicado, URL inválida y elementos raros: cuenta bien", async () => {
    const { resultado, guardadas } = await enviar([
      articulo(),
      articulo(),
      articulo({ Element_URL: "https://amp.expansion.com/a/b.html" }),
      articulo({ Element_URL: "no es una url" }),
      articulo({ Element_URL: "javascript:alert(1)" }),
      "basura",
      null,
      5,
    ]);
    expect(resultado.status).toBe(200);
    expect(guardadas[0]?.map((f) => f.medio)).toEqual(["elpais.com", "expansion.com"]);
    expect(resultado.cuerpo["descartados"]).toBe(2);
  });
  it("lista dentro de un objeto (otro posible formato)", async () => {
    const { guardadas } = await enviar({
      Elements: [articulo(), articulo({ Element_URL: "https://www.lavanguardia.com/a.html" })],
    });
    expect(guardadas[0]).toHaveLength(2);
  });
  it("dominios: www, amp, mayúsculas, punto final, anidados", () => {
    expect(limpiarDominio("WWW.Ejemplo.ES.")).toBe("ejemplo.es");
    expect(limpiarDominio("amp.expansion.com")).toBe("expansion.com");
    expect(limpiarDominio("www.amp.x.es")).toBe("x.es");
    expect(limpiarDominio("sub.medio.com")).toBe("sub.medio.com");
    expect(limpiarDominio("localhost")).toBeNull();
    expect(limpiarDominio("www.")).toBeNull();
    expect(limpiarDominio("")).toBeNull();
  });
  it("los dominios guardados cumplen la regla de la tabla (sin www. al principio ni / espacio :)", async () => {
    const urls = [
      "https://www.a.es/x",
      "https://amp.b.com:8080/x",
      "https://WWW.AMP.C.cat/x",
      "http://d.org/x?utm_source=z",
    ];
    const { guardadas } = await enviar(urls.map((u) => articulo({ Element_URL: u })));
    expect(guardadas[0]).toHaveLength(4);
    for (const fila of guardadas[0] ?? []) {
      expect(/^www\./.test(fila.medio)).toBe(false);
      expect(/[/ :]/.test(fila.medio)).toBe(false);
    }
  });
  it("URL: quita fragmento y parámetros de seguimiento, conserva el resto", () => {
    expect(
      normalizarUrl("https://x.es/a.html?utm_source=tw&id=7&fbclid=abc#seccion")?.toString(),
    ).toBe("https://x.es/a.html?id=7");
    expect(normalizarUrl("ftp://x.es/a")).toBeNull();
    expect(normalizarUrl("https://x.es/" + "a".repeat(3000))).toBeNull();
    expect(normalizarUrl(42)).toBeNull();
  });
  it("la misma noticia con y sin seguimiento cuenta como un solo artículo", async () => {
    const { guardadas } = await enviar([
      articulo({ Element_URL: "https://x.es/a.html?utm_source=a" }),
      articulo({ Element_URL: "https://x.es/a.html#comentarios" }),
    ]);
    expect(guardadas[0]).toHaveLength(1);
  });
  it("textos: se recortan y se limpian caracteres de control", async () => {
    const { guardadas } = await enviar(
      articulo({
        Element_Title: "a".repeat(5000),
        Element_Headline: "línea1\n\u0000línea2\t",
        Alert_Name: "  ",
      }),
    );
    const fila = guardadas[0]?.[0];
    expect(fila?.titular?.length).toBe(1000);
    expect(fila?.entradilla).toBe("línea1  línea2");
    expect(fila?.alerta).toBeNull();
  });
  it("máximo de elementos por envío", async () => {
    const muchos = Array.from({ length: 500 }, (_, i) => ({
      Element_URL: `https://m.es/a${i}.html`,
    }));
    const { guardadas } = await enviar(muchos);
    expect(guardadas[0]).toHaveLength(200);
  });
  it("entradas absurdas no lanzan", () => {
    for (const valor of [null, undefined, 5, "x", [], {}, [[]], { a: [] }, { a: [1, 2] }]) {
      expect(aFilas(extraerElementos(valor)).filas).toEqual([]);
    }
  });
});

describe("receptor de Snoop: casos de error", () => {
  it("JSON no válido con token correcto: 200 sin guardar (evita reintentos infinitos)", async () => {
    const { resultado, guardadas } = await enviar(null, { crudo: "{esto no es json" });
    expect(resultado.status).toBe(200);
    expect(resultado.cuerpo["motivo"]).toBe("json_no_valido");
    expect(guardadas).toHaveLength(0);
  });
  it("formato inesperado: 200, no guarda y el log solo trae nombres de campos, no valores", async () => {
    const { resultado, guardadas } = await enviar({
      Otro_Campo: "valor-secreto-123",
      Customer_email: CORREO,
    });
    expect(resultado.status).toBe(200);
    expect(resultado.cuerpo["motivo"]).toBe("sin_filas_validas");
    expect(guardadas).toHaveLength(0);
    expect(resultado.log ?? "").toMatch(/Otro_Campo/);
    expect((resultado.log ?? "").includes("valor-secreto-123")).toBe(false);
    expect((resultado.log ?? "").includes(CORREO)).toBe(false);
  });
  it("fallo de la base de datos: 502 (Snoop reintentará) sin detalles internos", async () => {
    const { resultado } = await enviar(articulo(), { falla: true });
    expect(resultado.status).toBe(502);
    expect(JSON.stringify(resultado).includes("boom")).toBe(false);
  });
  it("cuerpo demasiado grande: 413 por cabecera sin leerlo, y por tamaño real", async () => {
    const porCabecera = await enviar(articulo(), { largo: MAX_CUERPO_BYTES + 1 });
    expect(porCabecera.resultado.status).toBe(413);
    expect(porCabecera.leido).toBe(false);
    const real = await enviar(null, {
      crudo: JSON.stringify([articulo({ Element_Title: "x".repeat(MAX_CUERPO_BYTES) })]),
    });
    expect(real.resultado.status).toBe(413);
  });
});
