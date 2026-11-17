import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Leyenda, PrimerosPasos } from "./Ayuda";
import { LlegadaTag } from "./ui";
import { kpis, sinDatosDiscover } from "@/lib/metricas";
import type { Alerta } from "@/lib/types";

const CLAVE = "radar_primeros_pasos_v1";

describe("PrimerosPasos", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sale la primera vez y explica los tres pasos", () => {
    render(<PrimerosPasos />);
    expect(screen.getByRole("region", { name: "Primeros pasos" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("al pulsar «Entendido» se cierra y no vuelve a salir", () => {
    const { unmount } = render(<PrimerosPasos />);
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CLAVE)).toBe("1");
    unmount();
    render(<PrimerosPasos />);
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });

  it("si el navegador no deja guardar, funciona igual (se cierra en esa visita)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<PrimerosPasos />);
    expect(screen.getByRole("region", { name: "Primeros pasos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
  });
});

describe("Leyenda", () => {
  afterEach(cleanup);
  it("está plegada por defecto y explica todos los conceptos", () => {
    const { container } = render(<Leyenda />);
    const detalles = container.querySelector("details");
    expect(detalles).not.toBeNull();
    expect(detalles?.open).toBe(false);
    expect(screen.getByText("Cómo leer este panel")).toBeInTheDocument();
    // ⓘ delante y flecha detrás: se ve que se puede pulsar y que se despliega.
    expect(container.querySelectorAll("summary svg")).toHaveLength(2);
    for (const t of [
      "Prioridad",
      "Señal",
      "Llegada",
      "Autoridad",
      "Por qué es afín",
      "Valoración",
      "Indicadores",
    ]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
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
    expect(screen.getByText("5.º · justo")).toBeInTheDocument();
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
