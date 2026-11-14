import { describe, expect, it } from "vitest";
import { comprobarCambio, normalizarEmail, validarRol } from "./usuariosReglas";
const m = [{ email: "a@x.es", rol: "admin" as const }, { email: "b@x.es", rol: "usuario" as const }];
describe("reglas de usuarios", () => {
  it("solo acepta roles admin o usuario", () => { expect(validarRol("admin")).toBe("admin"); expect(() => validarRol("root")).toThrow(); });
  it("normaliza emails y rechaza inválidos", () => { expect(normalizarEmail(" A@X.es ")).toBe("a@x.es"); expect(() => normalizarEmail("nope")).toThrow(); });
  it("un admin no puede quitarse acceso ni rol", () => {
    expect(() => comprobarCambio(m, "a@x.es", "a@x.es", null)).toThrow();
    expect(() => comprobarCambio(m, "a@x.es", "a@x.es", "usuario")).toThrow();
  });
  it("siempre queda al menos un admin", () => {
    expect(() => comprobarCambio(m, "b@x.es", "a@x.es", "usuario")).toThrow("al menos un admin");
  });
  it("permite dar de baja a un usuario normal", () => { expect(() => comprobarCambio(m, "a@x.es", "b@x.es", null)).not.toThrow(); });
});
