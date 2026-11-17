import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AutoridadLista, AutoridadProvider, BloqueAutoridad, EtiquetaAutoridad } from "./Autoridad";
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

  it("autoridad alta: la mejor pieza con su enlace y, plegadas, las demás", () => {
    const { container } = conDatos(
      datos(["Yolanda Díaz"]),
      <BloqueAutoridad entidad="Yolanda Díaz" />,
    );
    expect(
      screen.getByRole("region", { name: "Nuestro historial en Discover" }),
    ).toBeInTheDocument();
    expect(container.querySelector("h3 svg")).not.toBeNull();
    expect(
      screen.getByText("Tráfico del 1 de septiembre al 15 de noviembre · Search Console"),
    ).toBeInTheDocument();
    const enlaces = screen.getAllByRole("link");
    expect(enlaces).toHaveLength(1);
    expect(enlaces[0]).toHaveAttribute(
      "href",
      "https://www.ejemplo.es/politica/candidatura-yolanda-diaz-oit_1_5000.html",
    );
    expect(enlaces[0]).toHaveAttribute("target", "_blank");
    // Plegado, dice qué hay dentro: cuántas piezas, los clics y cuándo fue la última.
    const pliegue = screen.getByRole("button", { name: /Ver las 4 piezas/ });
    expect(pliegue).toHaveAttribute("aria-expanded", "false");
    expect(pliegue.textContent).toContain("14.500 clics en total · la última, en noviembre");
    fireEvent.click(pliegue);
    expect(screen.getAllByRole("link")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Ver solo la mejor" }));
    expect(screen.getAllByRole("link")).toHaveLength(1);
    // Los umbrales están en «Cómo leer este panel», no en la ficha.
    expect(screen.queryByText(/Alta: 3 piezas o más/)).not.toBeInTheDocument();
  });

  it("autoridad media con una sola pieza, sin pliegue", () => {
    conDatos(datos(["Marcial Dorado"]), <BloqueAutoridad entidad="Marcial Dorado" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tema nuevo: lo dice en gris, sin piezas", () => {
    conDatos(datos(["[SIN DISCOVER] Pedri"]), <BloqueAutoridad entidad="[SIN DISCOVER] Pedri" />);
    expect(
      screen.getByText("No tenemos historial en Discover sobre «Pedri» en estas fechas."),
    ).toBeInTheDocument();
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

describe("EtiquetaAutoridad", () => {
  afterEach(cleanup);
  it("en la cabecera de la ficha: nivel y piezas, o tema nuevo; sin datos, nada", () => {
    conDatos(
      datos(["Yolanda Díaz", "Marcial Dorado", "Pedri"]),
      <>
        <EtiquetaAutoridad entidad="Yolanda Díaz" />
        <EtiquetaAutoridad entidad="Marcial Dorado" />
        <EtiquetaAutoridad entidad="Pedri" />
      </>,
    );
    expect(screen.getByText("Autoridad alta · 4 piezas")).toBeInTheDocument();
    expect(screen.getByText("Autoridad media · 1 pieza")).toBeInTheDocument();
    expect(screen.getByText("Tema nuevo para nosotros")).toBeInTheDocument();
    cleanup();
    expect(render(<EtiquetaAutoridad entidad="Ayuso" />).container).toBeEmptyDOMElement();
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
