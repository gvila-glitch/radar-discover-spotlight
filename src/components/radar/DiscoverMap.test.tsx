import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { LeyendaDiscover, ListaDiscover, ResumenVentana, SelectorPestanas } from "./DiscoverMap";
import type { Pestana, TemaMapa } from "@/lib/discoverMap";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    search,
    className,
  }: {
    children: ReactNode;
    to: string;
    search?: { alerta?: number };
    className?: string;
  }) => (
    <a href={search?.alerta ? `${to}?alerta=${search.alerta}` : to} className={className}>
      {children}
    </a>
  ),
}));

const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const tema = (nombre: string, o: Partial<TemaMapa> = {}): TemaMapa => ({
  id: nombre.toLowerCase(),
  nombre,
  alias: [],
  medios: 4,
  mediosUltimaHora: 3,
  subiendo: true,
  primeraVez: hace(50),
  llegadas: [
    { medio: "abc.es", hora: hace(50) },
    { medio: "lavanguardia.com", hora: hace(40) },
    { medio: "elmundo.es", hora: hace(30) },
    { medio: "20minutos.es", hora: hace(20) },
  ],
  titulares: [
    {
      medio: "20minutos.es",
      titular: `La ${nombre} deja avisos naranjas`,
      url: "https://20minutos.es/a",
      recibido_en: hace(20),
    },
    {
      medio: "elmundo.es",
      titular: `Qué zonas estarán en aviso por la ${nombre}`,
      url: "https://elmundo.es/b",
      recibido_en: hace(30),
    },
  ],
  nosotros: null,
  categorias: ["Sociedad"],
  relacionados: [{ id: "aemet", nombre: "Aemet" }],
  alerta: { id: 42, creada_en: hace(85) },
  ...o,
});
const BORRASCA = tema("Borrasca Claudia");
const SALARIO = tema("Salario mínimo", {
  medios: 2,
  mediosUltimaHora: 2,
  categorias: ["Economía"],
  nosotros: {
    puesto: 1,
    titular: "Nuestra pieza del salario",
    url: "https://nuestro.es/s",
    hora: hace(25),
  },
  alerta: null,
  relacionados: [],
});

/** La lista es controlada: este envoltorio guarda qué fila está abierta, como la página. */
function Lista({
  propio = "nuestro.es",
  onAbrir,
}: {
  propio?: string | null;
  onAbrir?: (id: string | null) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <ListaDiscover
      temas={[BORRASCA, SALARIO]}
      referencia={["lavanguardia.com", "elmundo.es"]}
      propio={propio}
      abierto={abierto}
      onAbrir={(id) => {
        setAbierto(id);
        onAbrir?.(id);
      }}
    />
  );
}

afterEach(cleanup);

describe("ListaDiscover", () => {
  it("cada fila enseña la historia, el ritmo, los medios, si estamos y si el radar avisó antes", () => {
    render(<Lista />);
    const [fila1, fila2] = screen.getAllByRole("button", { expanded: false });
    expect(within(fila1!).getByText("Borrasca Claudia")).toBeInTheDocument();
    expect(within(fila1!).getByText("Sociedad")).toBeInTheDocument();
    expect(
      within(fila1!).getByText(/La Borrasca Claudia deja avisos naranjas/),
    ).toBeInTheDocument();
    expect(within(fila1!).getByText("+3 en 1 h")).toBeInTheDocument();
    expect(within(fila1!).getByText("4 medios · justo")).toBeInTheDocument();
    expect(within(fila1!).getByText("No")).toBeInTheDocument();
    expect(within(fila1!).getByText("hace 50 min")).toBeInTheDocument();
    expect(within(fila1!).getByText("avisó 35 min antes")).toBeInTheDocument();
    expect(within(fila2!).getByText("2 medios · vas a tiempo")).toBeInTheDocument();
    expect(within(fila2!).getByText("Sí · 1.º")).toBeInTheDocument();
    expect(within(fila2!).getByText("sin alerta")).toBeInTheDocument();
  });

  it("al pulsar una fila se despliega ahí mismo; al pulsarla otra vez, se pliega", () => {
    render(<Lista />);
    fireEvent.click(screen.getByRole("button", { name: /Borrasca Claudia/ }));
    expect(screen.getByRole("button", { name: /Borrasca Claudia/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const titulares = screen.getByRole("region", { name: "Titulares en Discover" });
    const enlaces = within(titulares).getAllByRole("link");
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0]).toHaveAttribute("href", "https://20minutos.es/a");
    expect(enlaces[0]).toHaveAttribute("target", "_blank");
    const llegadas = screen.getByRole("region", { name: "Medios por orden de llegada" });
    expect(within(llegadas).getAllByLabelText("medio de referencia")).toHaveLength(2);
    expect(within(llegadas).getByText("nuestro.es · todavía no")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver su alerta/ })).toHaveAttribute(
      "href",
      "/?alerta=42",
    );
    fireEvent.click(screen.getByRole("button", { name: /Borrasca Claudia/ }));
    expect(screen.queryByRole("region", { name: "Titulares en Discover" })).not.toBeInTheDocument();
  });

  it("si estamos, enseña nuestra pieza; «Sale junto a» abre el otro tema", () => {
    const onAbrir = vi.fn();
    render(<Lista onAbrir={onAbrir} />);
    fireEvent.click(screen.getByRole("button", { name: /Salario mínimo/ }));
    expect(screen.getByRole("link", { name: "Nuestra pieza del salario" })).toHaveAttribute(
      "href",
      "https://nuestro.es/s",
    );
    expect(screen.queryByText(/todavía no/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Borrasca Claudia/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aemet" }));
    expect(onAbrir).toHaveBeenLastCalledWith("aemet");
  });

  it("sin nuestro dominio en Configuración, «Nosotros» sale con un guion", () => {
    render(<Lista propio={null} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("No")).not.toBeInTheDocument();
    expect(screen.queryByText("Sí · 1.º")).not.toBeInTheDocument();
  });
});

describe("SelectorPestanas", () => {
  const cuentas: Record<Pestana, number> = {
    entrando: 5,
    sin_nosotros: 6,
    consolidados: 9,
    todo: 21,
  };
  it("enseña las cuatro pestañas con su recuento y avisa al cambiar", () => {
    const onCambio = vi.fn();
    render(
      <SelectorPestanas
        pestana="entrando"
        onCambio={onCambio}
        cuentas={cuentas}
        sinDominio={false}
      />,
    );
    expect(screen.getByRole("tab", { name: "Entrando ahora (5)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Sin nosotros (6)" }));
    expect(onCambio).toHaveBeenCalledWith("sin_nosotros");
    expect(screen.getByRole("tab", { name: "Todo (21)" })).toBeInTheDocument();
  });
  it("sin nuestro dominio, «Sin nosotros» queda desactivada", () => {
    render(
      <SelectorPestanas pestana="entrando" onCambio={() => {}} cuentas={cuentas} sinDominio />,
    );
    expect(screen.getByRole("tab", { name: "Sin nosotros (—)" })).toBeDisabled();
  });
});

describe("ResumenVentana", () => {
  it("dice cuántos artículos forman los temas y por qué se quedan fuera los demás", () => {
    const { container, rerender } = render(
      <ResumenVentana
        articulos={250}
        temas={28}
        resumen={{ enTemas: 90, sinNombre: 140, pocosMedios: 20, fueraDeLista: 0 }}
      />,
    );
    expect(container).toHaveTextContent(
      "250 artículos en la ventana: 90 forman los 28 temas de la lista; 140 no tienen nombre propio en el titular y 20 hablan de nombres que salen en menos de 3 medios.",
    );
    rerender(
      <ResumenVentana
        articulos={5}
        temas={1}
        resumen={{ enTemas: 5, sinNombre: 0, pocosMedios: 0, fueraDeLista: 0 }}
      />,
    );
    expect(container).toHaveTextContent("5 artículos en la ventana: 5 forman el tema de la lista.");
  });
});

describe("LeyendaDiscover", () => {
  it("está plegada y explica pestañas, ritmo, nosotros y radar", () => {
    const { container } = render(<LeyendaDiscover />);
    expect(container.querySelector("details")?.open).toBe(false);
    for (const t of ["Pestañas", "Ritmo", "Medios en Discover", "Nosotros", "Radar", "Qué cubre"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
  });
});
