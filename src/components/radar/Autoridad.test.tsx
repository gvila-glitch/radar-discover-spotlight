import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AutoridadLista, AutoridadProvider, BloqueAutoridad } from "./Autoridad";
import { calcularAutoridad, type Autoridad, type FilaAutoridad } from "@/lib/autoridad";

const fila = (
  slug: string,
  clics: number,
  desde = "2026-09-01",
  hasta = "2026-09-30",
): FilaAutoridad => ({
  url: `https://www.ejemplo.es/politica/${slug}_1_${clics}.html`,
  clics,
  desde,
  hasta,
});
const FILAS = [
  fila("candidatura-yolanda-diaz-oit", 5000, "2026-11-01", "2026-11-15"),
  fila("garamendi-yolanda-diaz", 4000),
  fila("protesta-oit-yolanda-diaz", 3000),
  fila("sindicatos-yolanda-diaz", 2500),
  fila("subasta-marcial-dorado", 1500),
  fila("almeida-noria", 6000),
];
const datos = (entidades: string[]): Autoridad => calcularAutoridad(FILAS, entidades);
const conDatos = (a: Autoridad | null, ui: React.ReactNode) =>
  render(<AutoridadProvider value={a}>{ui}</AutoridadProvider>);

describe("BloqueAutoridad", () => {
  afterEach(cleanup);

  it("autoridad alta: nivel, piezas, clics, la última y las 3 mejores con su enlace", () => {
    conDatos(datos(["Yolanda Díaz"]), <BloqueAutoridad entidad="Yolanda Díaz" />);
    expect(screen.getByText("Nuestra autoridad en Discover")).toBeInTheDocument();
    expect(screen.getByText("Autoridad alta")).toBeInTheDocument();
    expect(screen.getByText(/con tráfico de Discover/).textContent).toBe(
      "4 piezas con tráfico de Discover",
    );
    expect(screen.getByText("la última, en noviembre")).toBeInTheDocument();
    const enlaces = screen.getAllByRole("link");
    expect(enlaces).toHaveLength(3);
    expect(enlaces[0]).toHaveAttribute(
      "href",
      "https://www.ejemplo.es/politica/candidatura-yolanda-diaz-oit_1_5000.html",
    );
    expect(enlaces[0]).toHaveAttribute("target", "_blank");
    expect(
      screen.getByText(
        "Search Console · Discover · del 1 de septiembre al 15 de noviembre. Alta: 3 piezas o más; media: 1 o 2.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver las 4 piezas" }));
    expect(screen.getAllByRole("link")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Ver solo las 3 mejores" }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("autoridad media, sin botón para ver más", () => {
    conDatos(datos(["Marcial Dorado"]), <BloqueAutoridad entidad="Marcial Dorado" />);
    expect(screen.getByText("Autoridad media")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tema nuevo: lo dice en gris, sin piezas", () => {
    conDatos(datos(["[SIN DISCOVER] Pedri"]), <BloqueAutoridad entidad="[SIN DISCOVER] Pedri" />);
    expect(screen.getByText("Tema nuevo para nosotros")).toBeInTheDocument();
    expect(screen.getByText(/Ninguna pieza nuestra sobre «Pedri»/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("avisa si el nombre es una sola palabra", () => {
    conDatos(datos(["Almeida"]), <BloqueAutoridad entidad="Almeida" />);
    expect(
      screen.getByText(
        "«Almeida» es una sola palabra: comprueba que las piezas hablan de la misma persona.",
      ),
    ).toBeInTheDocument();
  });

  it("sin datos cargados, sin proveedor o con un nombre que no sirve, no enseña nada", () => {
    const vacio = calcularAutoridad([], ["Ayuso"]);
    expect(conDatos(vacio, <BloqueAutoridad entidad="Ayuso" />).container).toBeEmptyDOMElement();
    cleanup();
    expect(render(<BloqueAutoridad entidad="Ayuso" />).container).toBeEmptyDOMElement();
    cleanup();
    expect(conDatos(datos(["J"]), <BloqueAutoridad entidad="J" />).container).toBeEmptyDOMElement();
  });
});

describe("AutoridadLista", () => {
  afterEach(cleanup);
  it("en la lista solo sale si hay autoridad (alta o media)", () => {
    const a = datos(["Yolanda Díaz", "Marcial Dorado", "Pedri"]);
    conDatos(
      a,
      <>
        <AutoridadLista entidad="Yolanda Díaz" />
        <AutoridadLista entidad="Marcial Dorado" />
        <AutoridadLista entidad="Pedri" />
      </>,
    );
    expect(screen.getByText("Autoridad alta")).toBeInTheDocument();
    expect(screen.getByText("Autoridad media")).toBeInTheDocument();
    expect(screen.queryByText("Tema nuevo para nosotros")).not.toBeInTheDocument();
  });
});
