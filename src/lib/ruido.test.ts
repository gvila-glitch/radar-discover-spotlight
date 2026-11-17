import { describe, expect, it } from "vitest";
import { MOTIVOS_RUIDO, motivoValido, sugerenciaNoCubrimos } from "./ruido";

describe("motivo del ruido", () => {
  it("solo admite los cuatro motivos", () => {
    expect(MOTIVOS_RUIDO.map((m) => m.id)).toEqual([
      "no_es_tema",
      "tarde",
      "ya_lo_teniamos",
      "nombre_confundido",
    ]);
    expect(motivoValido("tarde")).toBe("tarde");
    expect(motivoValido("otro")).toBeNull();
    expect(motivoValido(null)).toBeNull();
  });
  it("propone un criterio para completar, sin pasar de 300 caracteres", () => {
    expect(sugerenciaNoCubrimos(" Supervivientes ")).toBe(
      "No cubrimos temas como «Supervivientes»: explica aquí por qué no nos interesan.",
    );
    expect(sugerenciaNoCubrimos("x".repeat(400)).length).toBe(300);
  });
});
