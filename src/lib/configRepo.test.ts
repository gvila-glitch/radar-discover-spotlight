import { describe, expect, it } from "vitest";
import { normalizarDominio } from "./configRepo";
describe("normalizarDominio", () => {
  it("quita protocolo, www y ruta", () => { expect(normalizarDominio(" https://www.ElPais.com/espana/ ")).toBe("elpais.com"); });
});
