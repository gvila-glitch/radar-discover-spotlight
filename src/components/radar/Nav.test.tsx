import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// El enrutador y la consulta de administrador, simulados: la prueba cambia «ruta» para navegar.
let ruta = "/";
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    onClick,
    className,
    title,
  }: {
    children: ReactNode;
    to: string;
    onClick?: () => void;
    className?: string;
    title?: string;
  }) => (
    <a
      href={to}
      className={className}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
  useLocation: ({ select }: { select: (l: { pathname: string }) => unknown }) =>
    select({ pathname: ruta }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: true }) }));
vi.mock("@/lib/configRepo", () => ({ esAdmin: vi.fn() }));

const { Sidebar } = await import("./Nav");
const CLAVE = "radar_menu_abierto_v1";
const desplegado = () => screen.queryByRole("button", { name: "Plegar menú" }) !== null;

describe("Menú lateral", () => {
  beforeEach(() => {
    window.localStorage.clear();
    ruta = "/";
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sale plegado la primera vez y recuerda lo que elige cada persona", async () => {
    const { unmount } = render(<Sidebar />);
    expect(desplegado()).toBe(false);
    expect(screen.queryByText("Alertas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desplegar menú" }));
    expect(screen.getByText("Alertas")).toBeInTheDocument();
    expect(window.localStorage.getItem(CLAVE)).toBe("1");
    unmount();
    render(<Sidebar />);
    expect(await screen.findByRole("button", { name: "Plegar menú" })).toBeInTheDocument();
  });

  it("en Configuración se despliega solo, con sus apartados, y al salir vuelve a como estaba", () => {
    const { rerender } = render(<Sidebar />);
    fireEvent.click(screen.getByRole("link", { name: "Configuración" }));
    ruta = "/configuracion";
    rerender(<Sidebar />);
    expect(desplegado()).toBe(true);
    expect(screen.getByRole("link", { name: "Perfil editorial" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usuarios" })).toBeInTheDocument();
    // El despliegue es temporal: no cambia lo que la persona eligió.
    expect(window.localStorage.getItem(CLAVE)).toBeNull();
    ruta = "/";
    rerender(<Sidebar />);
    expect(desplegado()).toBe(false);
  });

  it("si lo pliegas dentro de Configuración, se queda plegado hasta que vuelvas a pulsar Configuración", () => {
    ruta = "/configuracion";
    render(<Sidebar />);
    expect(desplegado()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Plegar menú" }));
    expect(desplegado()).toBe(false);
    expect(window.localStorage.getItem(CLAVE)).toBe("0");
    fireEvent.click(screen.getByRole("link", { name: "Configuración" }));
    expect(desplegado()).toBe(true);
  });

  it("si el navegador no deja guardar, funciona igual en esa visita", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<Sidebar />);
    expect(desplegado()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Desplegar menú" }));
    expect(desplegado()).toBe(true);
  });
});
