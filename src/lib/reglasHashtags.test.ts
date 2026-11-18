import { describe, expect, it } from "vitest";
import {
  clasificarPorReglas,
  lecturasDeHashtag,
  parsearReglas,
  type Reglas,
} from "./trendsAlertas";

const reglas = (si: string, no = ""): Reglas => ({
  si: parsearReglas(si),
  no: parsearReglas(no),
  modo: "permisivo",
});
const decide = (termino: string, r: Reglas, titular: string | null = null) =>
  clasificarPorReglas(termino, titular, r).decision;

describe("reglas de Configuración en hashtags", () => {
  it("separa las palabras por las mayúsculas y prueba las dos lecturas de unas siglas pegadas", () => {
    expect(lecturasDeHashtag("#FelizMiercoles")).toEqual(["feliz miercoles"]);
    expect(lecturasDeHashtag("#ApoyoERC")).toEqual(["apoyo erc"]);
    expect(lecturasDeHashtag("#PSOEyFrente")).toContain("psoe y frente");
    expect(lecturasDeHashtag("#CNNEspañol")).toContain("cnn espanol");
    expect(lecturasDeHashtag("#Elecciones28A")).toEqual(["elecciones 28a"]);
    expect(lecturasDeHashtag("#8M")).toEqual(["8m"]);
  });

  it("unas siglas cortas no saltan dentro de otra palabra: #FelizMiercoles no es ERC", () => {
    const r = reglas("erc => /politica/");
    expect(decide("#FelizMiercoles", r)).toBe("sin_clasificar");
    expect(decide("#felizmiercoles", r)).toBe("sin_clasificar");
    expect(decide("#FELIZMIERCOLES", r)).toBe("sin_clasificar");
  });

  it("las siglas sueltas sí saltan, también pegadas a otra palabra con mayúscula", () => {
    const r = reglas("erc => /politica/; psoe; 8m; g20");
    for (const t of ["#ERC", "#ApoyoERC", "#ERCyJunts", "#PSOEyFrente", "#8M", "#G20"])
      expect(decide(t, r), t).toBe("afin");
  });

  it("palabras completas, nombres de varias palabras y reglas que empiezan por", () => {
    const r = reglas("pedro sanchez; vivienda; independent*");
    expect(decide("#PedroSanchezDimision", r)).toBe("afin");
    expect(decide("#ViviendaDigna", r)).toBe("afin");
    expect(decide("#IndependentistasEnLaCalle", r)).toBe("afin");
    expect(decide("#SanchezDimision", r)).toBe("sin_clasificar");
  });

  it("las reglas de 5 letras o más se buscan también dentro del hashtag sin separar", () => {
    expect(decide("#antiayuso", reglas("ayuso"))).toBe("afin");
    expect(decide("#pedrosanchezdimision", reglas("pedro sanchez"))).toBe("afin");
    expect(decide("#GobiernoDeSanchezyFeijoo", reglas("sanchez"))).toBe("afin");
  });

  it("vale igual para las reglas de «no»", () => {
    const r = reglas("", "erc; primitiva");
    expect(decide("#FelizMiercoles", r)).toBe("sin_clasificar");
    expect(decide("#BoteDeLaPrimitiva", r)).toBe("descartar");
  });

  it("los términos que no son hashtags siguen igual", () => {
    const r = reglas("erc; ayus*");
    expect(decide("Mercado laboral", r)).toBe("sin_clasificar");
    expect(decide("ERC", r)).toBe("afin");
    expect(decide("Isabel Díaz Ayuso", r)).toBe("afin");
    expect(decide("Huelga general", r, "ERC pide adelantar el debate")).toBe("afin");
  });
});
