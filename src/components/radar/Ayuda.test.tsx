import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EnlaceComoSeUsa, PrimerosPasos } from "./Ayuda";
import { usePrimerosPasos } from "./usePrimerosPasos";
import { LlegadaTag } from "./ui";
import { kpis, sinDatosDiscover } from "@/lib/metricas";
import type { Alerta } from "@/lib/types";

const CLAVE = "radar_primeros_pasos_v1";

// Como en la página: el enlace «¿Cómo se usa?» y los pasos debajo.
function Ayuda() {
  const p = usePrimerosPasos();
  return (
    <>
      <EnlaceComoSeUsa abiertos={p.abiertos} onPulsar={p.alternar} />
      {p.abiertos && <PrimerosPasos onCerrar={p.cerrar} />}
    </>
  );
}
const pasos = () => screen.queryByRole("region", { name: "Primeros pasos" });

describe("Primeros pasos y «¿Cómo se usa?»", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("salen solos la primera vez y explican los tres pasos", () => {
    render(<Ayuda />);
    expect(pasos()).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("al pulsar «Entendido» se cierran, no vuelven a salir solos y «¿Cómo se usa?» los abre otra vez", () => {
    const { unmount } = render(<Ayuda />);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(pasos()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLAVE)).toBe("1");
    unmount();
    render(<Ayuda />);
    expect(pasos()).not.toBeInTheDocument();
    const enlace = screen.getByRole("button", { name: /¿Cómo se usa\?/ });
    expect(enlace).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(enlace);
    expect(pasos()).toBeInTheDocument();
    expect(enlace).toHaveAttribute("aria-expanded", "true");
  });

  it("si el navegador no deja guardar, funciona igual (se cierran en esa visita)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<Ayuda />);
    expect(pasos()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(pasos()).not.toBeInTheDocument();
  });
});

const base = { entidad: "Abascal", medios_discover: 0 } as Alerta;
describe("llegada sin datos de Discover", () => {
  afterEach(cleanup);
  it("sinDatosDiscover reconoce el prefijo y no se equivoca con otros nombres", () => {
    expect(sinDatosDiscover({ entidad: "[SIN DISCOVER] Abascal" })).toBe(true);
    expect(sinDatosDiscover({ entidad: "[sin discover] abascal" })).toBe(true);
    expect(sinDatosDiscover({ entidad: "Abascal" })).toBe(false);
    expect(sinDatosDiscover({ entidad: "[PRUEBA] Abascal" })).toBe(false);
    expect(sinDatosDiscover({ entidad: "Sin Discover" })).toBe(false);
  });
  it("la etiqueta no se muestra cuando no hay datos, y sí cuando los hay", () => {
    const { container, rerender } = render(
      <LlegadaTag a={{ ...base, entidad: "[SIN DISCOVER] Abascal" }} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<LlegadaTag a={{ ...base, medios_discover: 0 }} />);
    expect(screen.getByText("1.º · a tiempo")).toBeInTheDocument();
    rerender(<LlegadaTag a={{ ...base, medios_discover: 4 }} />);
    // Al pasar el ratón, dice qué significa «5.º».
    expect(screen.getByText("5.º · justo")).toHaveAttribute(
      "title",
      "Ya hay 4 medios en Discover: llegaríamos los 5.º",
    );
  });
  it("la mediana de llegada solo cuenta alertas con datos de Discover", () => {
    const sin = {
      ...base,
      entidad: "[SIN DISCOVER] X",
      creada_en: "2026-01-01T10:00:00Z",
      estado: "pendiente",
    } as Alerta;
    const con = (m: number) => ({ ...sin, entidad: "Y", medios_discover: m }) as Alerta;
    expect(kpis([sin, sin], () => "x", "x").medianaLlegada).toBeNull();
    expect(kpis([sin, sin, con(4)], () => "x", "x").medianaLlegada).toBe(4);
    expect(kpis([sin, con(1), con(3)], () => "x", "x").medianaLlegada).toBe(2);
  });
});
