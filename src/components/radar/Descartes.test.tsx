import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Descarte } from "@/lib/descartes";
import type { Alerta } from "@/lib/types";

const marcar = vi.fn();
const excepcion = vi.fn();
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (f: { nombre: string }) => (f.nombre === "marcar" ? marcar : excepcion),
}));
vi.mock("@/lib/descartes.functions", () => ({
  marcarDescarte: { nombre: "marcar" },
  anadirExcepcion: { nombre: "excepcion" },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { SelectorVistas, VistaDescartes, VistaTodas, FichaDescarte } = await import("./Descartes");

const descarte = (o: Partial<Descarte> = {}): Descarte => ({
  id: 1,
  dia: "2026-11-16",
  clave: "pedri",
  tema: "Pedri",
  fuente: "x_trends",
  creada_en: "2026-11-16T09:15:00Z",
  actualizada_en: "2026-11-16T09:15:00Z",
  puntos: 4,
  fuerte: true,
  x_posicion: 1,
  x_desde: "2026-11-16T09:05:00Z",
  trends_crecimiento: null,
  wikipedia_visitas: null,
  wikipedia_ratio: null,
  contexto: "En tendencia en X España (puesto 1)",
  motivo_ia: "Fútbol sin dimensión pública",
  seccion_ia: "Deportes",
  agencia: false,
  modelo: "gemini-3.8-flash",
  veredicto: null,
  veredicto_por: null,
  veredicto_en: null,
  nota: null,
  excepcion: null,
  excepcion_tipo: null,
  excepcion_por: null,
  excepcion_en: null,
  ...o,
});
const alerta = (o: Partial<Alerta> = {}): Alerta => ({
  id: 7,
  creada_en: "2026-11-16T10:15:00Z",
  entidad: "Yolanda Díaz",
  contexto: "Contexto de la alerta",
  prioridad: "alta",
  x_posicion: 4,
  x_desde: null,
  trends_activo: false,
  trends_crecimiento: null,
  medios_discover: 0,
  medios_lista: [],
  titulares_seo: [],
  angulo: "Pendiente",
  seccion_sugerida: "Política",
  motivo_afinidad: "Encaja (IA, alto): x",
  estado: "pendiente",
  pieza_url: null,
  estado_actualizado_en: null,
  estado_por: null,
  ...o,
});
const conQuery = (n: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>
);

beforeEach(() => {
  marcar.mockReset();
  excepcion.mockReset();
});
afterEach(cleanup);

describe("SelectorVistas", () => {
  it("tres pestañas con el número entre paréntesis", () => {
    const onCambio = vi.fn();
    render(
      <SelectorVistas
        vista="alertas"
        onCambio={onCambio}
        cuentas={{ alertas: 12, descartes: 7, todas: 19 }}
      />,
    );
    expect(screen.getByRole("tab", { name: "Alertas (12)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Descartadas por la IA (7)" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Todas (19)" }));
    expect(onCambio).toHaveBeenCalledWith("todas");
  });
});

describe("Descartes", () => {
  it("lista con puntos y señal, y ficha con el motivo de la IA", () => {
    render(
      conQuery(
        <VistaDescartes
          descartes={[
            descarte(),
            descarte({
              id: 2,
              tema: "#FelizLunes",
              puntos: 3,
              x_posicion: 2,
              veredicto: "deberia_pasar",
            }),
          ]}
          cargando={false}
          error={false}
          esAdmin={false}
        />,
      ),
    );
    expect(screen.getByText("4 pts · X #1")).toBeInTheDocument();
    expect(screen.getAllByText("Debería haber pasado").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Pedri" })).toBeInTheDocument();
    expect(screen.getByText("Por qué la IA lo dejó fuera")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en X" })).toHaveAttribute(
      "href",
      "https://x.com/search?q=Pedri",
    );
  });
  it("«Debería haber pasado» guarda la marca con la nota", async () => {
    marcar.mockResolvedValue(descarte({ veredicto: "deberia_pasar", nota: "dinero público" }));
    render(conQuery(<FichaDescarte d={descarte()} esAdmin={false} />));
    fireEvent.change(screen.getByLabelText("Nota (opcional): por qué nos interesaba"), {
      target: { value: "dinero público" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Debería haber pasado" }));
    await waitFor(() =>
      expect(marcar).toHaveBeenCalledWith({
        data: { id: 1, marcar: true, nota: "dinero público" },
      }),
    );
  });
  it("ya marcado: el administrador puede añadir un criterio como excepción; quien no lo es, no", async () => {
    const marcado = descarte({
      veredicto: "deberia_pasar",
      veredicto_por: "editora@ejemplo.es",
      nota: "si hay dinero público",
    });
    excepcion.mockResolvedValue({ ...marcado, excepcion: "x", excepcion_tipo: "criterio" });
    const { unmount } = render(conQuery(<FichaDescarte d={marcado} esAdmin={false} />));
    expect(screen.queryByRole("region", { name: "Añadir como excepción" })).not.toBeInTheDocument();
    unmount();
    render(conQuery(<FichaDescarte d={marcado} esAdmin />));
    expect(screen.getByLabelText("Criterio de la excepción")).toHaveValue(
      "Temas como «Pedri»: si hay dinero público",
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar excepción" }));
    await waitFor(() =>
      expect(excepcion).toHaveBeenCalledWith({
        data: { id: 1, tipo: "criterio", texto: "Temas como «Pedri»: si hay dinero público" },
      }),
    );
    fireEvent.click(screen.getByLabelText(/Avisar siempre de «Pedri»/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar excepción" }));
    await waitFor(() =>
      expect(excepcion).toHaveBeenLastCalledWith({
        data: { id: 1, tipo: "nombre", texto: "Temas como «Pedri»: si hay dinero público" },
      }),
    );
  });
  it("si ya tiene excepción, se enseña quién la añadió y no se puede quitar la marca", () => {
    render(
      conQuery(
        <FichaDescarte
          d={descarte({
            veredicto: "deberia_pasar",
            excepcion: "pedri",
            excepcion_tipo: "nombre",
            excepcion_por: "admin@ejemplo.es",
          })}
          esAdmin
        />,
      ),
    );
    expect(screen.getByText(/Excepción añadida por admin@ejemplo.es/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar la marca" })).not.toBeInTheDocument();
  });
});

describe("Todas", () => {
  it("mezcla alertas y descartes por hora y abre la ficha de cada uno", () => {
    render(
      conQuery(
        <VistaTodas
          alertas={[alerta()]}
          descartes={[descarte()]}
          esAdmin={false}
          onValorar={() => {}}
        />,
      ),
    );
    const filas = screen
      .getAllByRole("button", { pressed: false })
      .concat(screen.getAllByRole("button", { pressed: true }));
    expect(filas.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Descartada por la IA")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yolanda Díaz" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pedri/ }));
    expect(screen.getByRole("heading", { name: "Pedri" })).toBeInTheDocument();
  });
});
