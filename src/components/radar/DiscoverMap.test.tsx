import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { FichaTema, LeyendaMapa, MapaDiscover } from "./DiscoverMap";
import { filtrarGrupos, type GrupoMapa, type TemaMapa } from "@/lib/discoverMap";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const tema = (nombre: string, o: Partial<TemaMapa> = {}): TemaMapa => ({
  id: nombre.toLowerCase(),
  nombre,
  alias: [],
  medios: 3,
  mediosUltimaHora: 0,
  subiendo: false,
  primeraVez: new Date().toISOString(),
  listaMedios: ["elpais.com", "elmundo.es", "abc.es"],
  titulares: [
    {
      medio: "elpais.com",
      titular: `Titular sobre ${nombre}`,
      url: `https://elpais.com/${nombre}`,
      recibido_en: new Date().toISOString(),
    },
  ],
  relacionados: [],
  hayAlerta: false,
  ...o,
});
const GRUPOS: GrupoMapa[] = [
  {
    id: "vox",
    nombre: "Vox",
    temas: [
      tema("Vox", { medios: 7 }),
      tema("Abascal", { medios: 4, mediosUltimaHora: 2, subiendo: true }),
    ],
  },
  {
    id: "otros",
    nombre: "Otros temas",
    temas: [
      tema("Pedro Sánchez", { medios: 10, mediosUltimaHora: 5, subiendo: true, hayAlerta: true }),
    ],
  },
];

afterEach(cleanup);

describe("MapaDiscover (burbujas)", () => {
  const burbuja = (nombre: RegExp | string) => screen.getByRole("button", { name: nombre });
  const radio = (el: HTMLElement) => Number(el.querySelectorAll("circle")[0]?.getAttribute("r"));

  it("pinta una burbuja por tema, con su grupo, y marca la seleccionada, las que suben y las que tienen alerta", () => {
    const { container } = render(
      <MapaDiscover grupos={GRUPOS} seleccion="vox" onSeleccion={() => {}} />,
    );
    expect(screen.getByRole("group", { name: "Mapa de temas en Discover" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByText("Otros temas")).toBeInTheDocument();
    expect(burbuja("Vox: 7 medios")).toHaveAttribute("aria-pressed", "true");
    expect(burbuja("Abascal: 4 medios, sube 2 en la última hora")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      burbuja(/Pedro Sánchez: 10 medios, sube 5 en la última hora, ya tiene alerta/),
    ).toBeInTheDocument();
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-alerta]")).toHaveLength(1);
  });

  it("al pulsar una burbuja, o con Intro, avisa de qué tema es", () => {
    const onSeleccion = vi.fn();
    render(<MapaDiscover grupos={GRUPOS} seleccion={undefined} onSeleccion={onSeleccion} />);
    fireEvent.click(burbuja(/^Abascal/));
    fireEvent.keyDown(burbuja(/^Vox/), { key: "Enter" });
    expect(onSeleccion.mock.calls).toEqual([["abascal"], ["vox"]]);
  });

  it("más medios, burbuja más grande; y el filtro «solo lo que sube»", () => {
    const tamanos = [2, 3, 5, 7, 10].map((medios) => tema(`T${medios}`, { medios }));
    render(
      <MapaDiscover
        grupos={[{ id: "otros", nombre: "Otros temas", temas: tamanos }]}
        seleccion={undefined}
        onSeleccion={() => {}}
      />,
    );
    const radios = tamanos.map((t) => radio(burbuja(`${t.nombre}: ${t.medios} medios`)));
    expect([...radios].sort((x, y) => x - y)).toEqual(radios);
    expect(new Set(radios).size).toBe(5);
    const sube = filtrarGrupos(GRUPOS, true);
    expect(sube.map((g) => g.temas.map((t) => t.nombre))).toEqual([["Abascal"], ["Pedro Sánchez"]]);
    expect(filtrarGrupos(GRUPOS, false)).toBe(GRUPOS);
  });
});

describe("FichaTema", () => {
  it("enseña cifras, medios por orden de llegada, titulares con enlace y temas relacionados", () => {
    const onSeleccion = vi.fn();
    const t = tema("Pedro Sánchez", {
      medios: 12,
      mediosUltimaHora: 5,
      subiendo: true,
      alias: ["Unión de amistad"],
      listaMedios: Array.from({ length: 12 }, (_, i) => `medio${i + 1}.es`),
      relacionados: [{ id: "psoe", nombre: "PSOE" }],
    });
    render(<FichaTema tema={t} onSeleccion={onSeleccion} />);
    expect(screen.getByRole("heading", { name: "Pedro Sánchez" })).toBeInTheDocument();
    expect(screen.getByText("Misma historia: Unión de amistad")).toBeInTheDocument();
    expect(screen.getByText("Subiendo")).toBeInTheDocument();
    expect(screen.getByText("sin alerta en el radar", { exact: false })).toBeInTheDocument();
    expect(
      screen.getAllByRole("listitem").filter((li) => li.textContent?.startsWith("medio")),
    ).toHaveLength(10);
    expect(screen.getByText("y 2 más")).toBeInTheDocument();
    const enlace = screen.getByRole("link", { name: "Titular sobre Pedro Sánchez" });
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "PSOE" }));
    expect(onSeleccion).toHaveBeenCalledWith("psoe");
  });
  it("si ya hay alerta, enlaza con Alertas", () => {
    render(<FichaTema tema={tema("Abascal", { hayAlerta: true })} onSeleccion={() => {}} />);
    expect(screen.getByRole("link", { name: "ya hay alerta en el radar" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("LeyendaMapa", () => {
  it("está plegada y explica tamaño, grupos, subida y alerta", () => {
    const { container } = render(<LeyendaMapa />);
    expect(container.querySelector("details")?.open).toBe(false);
    for (const t of ["Tamaño", "Grupos", "Número rojo", "Campana", "Qué cubre", "Cómo se detecta"])
      expect(screen.getByText(t)).toBeInTheDocument();
  });
});
