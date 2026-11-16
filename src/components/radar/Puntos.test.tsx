import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DesglosePuntos } from "./Puntos";

const P = {
  puntos: 5,
  prioridad: "alta" as const,
  partes: [
    { texto: "Google 2000+", puntos: 1 },
    { texto: "nadie en Discover todavía", puntos: 1 },
    { texto: "encaja con la línea editorial", puntos: 3 },
  ],
};

// jsdom no trae PointerEvent: sin él, los eventos de prueba no dicen si son de ratón o de dedo.
if (!("PointerEvent" in window)) {
  class PointerEventPrueba extends MouseEvent {
    pointerType: string;
    constructor(tipo: string, init: PointerEventInit = {}) {
      super(tipo, init);
      this.pointerType = init.pointerType ?? "";
    }
  }
  Object.assign(window, { PointerEvent: PointerEventPrueba });
}

afterEach(cleanup);

describe("Desglose de puntos", () => {
  it("enseña el total y, al pulsar, el desglose con la regla; Esc lo cierra", () => {
    render(<DesglosePuntos p={P} titulo="Prioridad por puntos" nota="Alta: 5 puntos o más." />);
    const boton = screen.getByRole("button", { name: "5 puntos: ver el desglose" });
    expect(screen.queryByText("Prioridad por puntos")).not.toBeInTheDocument();
    fireEvent.click(boton);
    expect(screen.getByText("Prioridad por puntos")).toBeInTheDocument();
    expect(screen.getByText("Google 2000+")).toBeInTheDocument();
    expect(screen.getByText("Nadie en Discover todavía")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Alta: 5 puntos o más.")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByText("Prioridad por puntos")).not.toBeInTheDocument();
  });
  it("se abre al pasar el ratón; con el dedo no (en móvil se abre al pulsar)", () => {
    render(<DesglosePuntos p={P} titulo="Prioridad por puntos" />);
    const boton = screen.getByRole("button", { name: "5 puntos: ver el desglose" });
    fireEvent.pointerEnter(boton, { pointerType: "touch" });
    expect(screen.queryByText("Prioridad por puntos")).not.toBeInTheDocument();
    fireEvent.pointerEnter(boton, { pointerType: "mouse" });
    expect(screen.getByText("Prioridad por puntos")).toBeInTheDocument();
    // Abierto con el ratón, el clic lo deja fijo en vez de cerrarlo.
    fireEvent.click(boton);
    expect(screen.getByText("Prioridad por puntos")).toBeInTheDocument();
  });
  it("con un punto dice «1 punto» y, sin partes, lo explica", () => {
    render(<DesglosePuntos p={{ puntos: 0, prioridad: "media", partes: [] }} titulo="Fuerza" />);
    fireEvent.click(screen.getByRole("button", { name: "0 puntos: ver el desglose" }));
    expect(screen.getByText("Nada suma ni resta puntos.")).toBeInTheDocument();
    cleanup();
    render(
      <DesglosePuntos
        p={{ puntos: 1, prioridad: "media", partes: [{ texto: "X, puesto 20", puntos: 1 }] }}
        titulo="Fuerza"
      />,
    );
    expect(screen.getByRole("button", { name: "1 punto: ver el desglose" })).toBeInTheDocument();
  });
});
