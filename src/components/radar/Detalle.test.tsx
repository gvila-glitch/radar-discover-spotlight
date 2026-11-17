import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Detalle } from "./Detalle";
import type { Alerta } from "@/lib/types";

const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const alerta = (o: Partial<Alerta>): Alerta => ({
  id: 1,
  creada_en: hace(25),
  entidad: "Tema",
  contexto: "",
  prioridad: "media",
  x_posicion: null,
  x_desde: null,
  trends_activo: false,
  trends_crecimiento: null,
  wikipedia_visitas: null,
  wikipedia_ratio: null,
  medios_discover: 0,
  medios_lista: [],
  titulares_seo: [],
  angulo: "Pendiente: aún sin IA",
  seccion_sugerida: "Sin sugerir",
  motivo_afinidad: "",
  estado: "pendiente",
  pieza_url: null,
  estado_actualizado_en: null,
  estado_por: null,
  ...o,
});

const YOLANDA = alerta({
  entidad: "Yolanda Díaz",
  prioridad: "alta",
  x_posicion: 4,
  x_desde: hace(32),
  trends_activo: true,
  trends_crecimiento: "20.000+",
  medios_discover: 2,
  medios_lista: ["elpais.com", "elmundo.es"],
  titulares_seo: [
    { medio: "elpais.com", titular: "Yolanda Díaz, a un paso de dirigir la OIT" },
    { medio: "elmundo.es", titular: "La candidatura de Yolanda Díaz suma apoyos" },
  ],
  contexto:
    "Se habla de: «Los sindicatos europeos respaldan a Yolanda Díaz» (Europa Press) · En tendencia en X España (puesto 4 · Política · 12.300 publicaciones) · Fuente: X",
  motivo_afinidad: "Encaja (IA, alto): vicepresidenta del Gobierno; política nacional.",
  seccion_sugerida: "Política",
});

const SUPER = alerta({
  id: 3,
  entidad: "Supervivientes",
  x_posicion: 7,
  x_desde: hace(160),
  medios_discover: 4,
  medios_lista: ["elmundo.es", "20minutos.es", "elconfidencial.com", "huffingtonpost.es"],
  titulares_seo: [
    { medio: "elmundo.es", titular: "La final de Supervivientes marca récord" },
    { medio: "20minutos.es", titular: "Quién ha ganado Supervivientes" },
    { medio: "elconfidencial.com", titular: "Telecinco gana el jueves con la final" },
  ],
  contexto: "En tendencia en X España (puesto 7 · Entretenimiento) · Fuente: X",
  motivo_afinidad: "Encaja (IA, medio): reality de televisión.",
  seccion_sugerida: "Televisión",
});

const nada = () => {};

describe("Detalle (ficha de la alerta)", () => {
  afterEach(cleanup);

  it("cabecera: nombre, etiquetas en palabras y por qué nos interesa, sin la jerga de la IA ni el ángulo", () => {
    const { container } = render(<Detalle a={YOLANDA} onValorar={nada} />);
    expect(screen.getByRole("heading", { level: 2, name: "Yolanda Díaz" })).toBeInTheDocument();
    expect(screen.getByText("2 medios en Discover · vas a tiempo")).toBeInTheDocument();
    expect(screen.getByText("Encaja mucho")).toBeInTheDocument();
    expect(screen.getByText(/vicepresidenta del Gobierno/)).toBeInTheDocument();
    expect(screen.getByText("Política")).toBeInTheDocument();
    expect(screen.queryByText(/Encaja \(IA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ángulo sugerido|Pendiente: aún sin IA/)).not.toBeInTheDocument();
    // «hace…» a la vista; la fecha completa, al pasar el ratón.
    const hora = container.querySelector("time");
    expect(hora?.textContent).toBe("hace 25 min");
    expect(hora?.getAttribute("title")).toBeTruthy();
  });

  it("por qué ahora (desplegado): titular, fuentes con señal y, en gris, las que no tienen", () => {
    render(<Detalle a={YOLANDA} onValorar={nada} />);
    const bloque = screen.getByRole("region", { name: "Por qué ahora" });
    expect(within(bloque).getByText(/Los sindicatos europeos respaldan/)).toBeInTheDocument();
    expect(within(bloque).getByText("(Europa Press)")).toBeInTheDocument();
    expect(
      within(bloque).getByText(/desde .*Política · 12\.300 publicaciones/),
    ).toBeInTheDocument();
    expect(within(bloque).getByText("20.000+")).toBeInTheDocument();
    expect(within(bloque).getByRole("link", { name: /Ver en X/ })).toHaveAttribute(
      "href",
      "https://x.com/search?q=Yolanda%20D%C3%ADaz",
    );
    expect(within(bloque).getByText("Sin señal en Wikipedia.")).toBeInTheDocument();
    expect(within(bloque).queryByRole("button")).not.toBeInTheDocument();
  });

  it("alerta de Wikipedia: qué es y la frase salen del contexto; nadie en Discover", () => {
    render(
      <Detalle
        a={alerta({
          entidad: "Marcial Dorado",
          wikipedia_ratio: 6,
          wikipedia_visitas: 19000,
          contexto:
            "Narcotraficante gallego · «Marcial Dorado es un empresario gallego.» · Pico en Wikipedia: 9.000 visitas, ×6 sobre su media de 7 días · Fuente: Wikipedia",
          motivo_afinidad: "Encaja por reglas: «narcotráfico»",
        })}
        onValorar={nada}
      />,
    );
    expect(screen.getByText("Narcotraficante gallego")).toBeInTheDocument();
    expect(screen.getByText("«Marcial Dorado es un empresario gallego.»")).toBeInTheDocument();
    expect(screen.queryByText(/Pico en Wikipedia/)).not.toBeInTheDocument();
    expect(screen.getByText("Sin señal en X ni en Google.")).toBeInTheDocument();
    expect(screen.getByText("19.000")).toBeInTheDocument();
    expect(screen.getByText("Nadie en Discover aún · vas a tiempo")).toBeInTheDocument();
    expect(
      screen.getByText("Ningún medio ha llegado todavía a Discover con este tema."),
    ).toBeInTheDocument();
    expect(screen.getByText("(por las reglas de Configuración)")).toBeInTheDocument();
  });

  it("competencia: dos titulares a la vista y el resto plegado, diciendo qué hay dentro", () => {
    render(<Detalle a={SUPER} onValorar={nada} />);
    expect(screen.getByText("4 medios en Discover · justo")).toBeInTheDocument();
    expect(screen.getByText("Puede encajar según el enfoque")).toBeInTheDocument();
    const bloque = screen.getByRole("region", { name: "Competencia en Discover" });
    expect(within(bloque).getAllByRole("listitem")).toHaveLength(2);
    const pliegue = within(bloque).getByRole("button", { name: /Ver 2 medios más/ });
    expect(pliegue).toHaveAttribute("aria-expanded", "false");
    expect(pliegue.textContent).toContain("elconfidencial.com, huffingtonpost.es");
    fireEvent.click(pliegue);
    expect(within(bloque).getAllByRole("listitem")).toHaveLength(3);
    expect(within(bloque).getByText("Sin titular todavía: huffingtonpost.es")).toBeInTheDocument();
    fireEvent.click(within(bloque).getByRole("button", { name: "Ver solo los dos primeros" }));
    expect(within(bloque).getAllByRole("listitem")).toHaveLength(2);
  });

  it("sin datos de Discover lo dice en la etiqueta y en la competencia", () => {
    render(
      <Detalle a={alerta({ entidad: "[SIN DISCOVER] Pedri", x_posicion: 2 })} onValorar={nada} />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Pedri" })).toBeInTheDocument();
    expect(screen.getByText("Sin datos de Discover todavía")).toBeInTheDocument();
    expect(screen.getByText("Sin datos de Discover todavía.")).toBeInTheDocument();
  });

  it("los botones valoran y «Publicamos» abre el hueco para el enlace solo al pulsarlo", () => {
    const onValorar = vi.fn();
    const { rerender } = render(<Detalle a={YOLANDA} onValorar={onValorar} />);
    expect(screen.getByText("¿Te sirve esta alerta?")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Enlace a nuestra pieza/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como pendiente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Útil" }));
    expect(onValorar).toHaveBeenLastCalledWith("util");
    fireEvent.click(screen.getByRole("button", { name: "Publicamos" }));
    expect(onValorar).toHaveBeenLastCalledWith("publicada", null);
    rerender(
      <Detalle
        a={{
          ...YOLANDA,
          estado: "publicada",
          estado_actualizado_en: hace(3),
          estado_por: "Equipo",
        }}
        onValorar={onValorar}
      />,
    );
    expect(screen.getByLabelText(/Enlace a nuestra pieza/)).toBeInTheDocument();
    expect(screen.getByText("Valorada hace 3 min por Equipo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como pendiente" }));
    expect(onValorar).toHaveBeenLastCalledWith("pendiente");
  });

  it("sin ninguna fuente con señal lo dice en una línea, y enseña tal cual el contexto que no reconoce", () => {
    render(<Detalle a={alerta({ contexto: "Aviso manual: revisar portada" })} onValorar={nada} />);
    const bloque = screen.getByRole("region", { name: "Por qué ahora" });
    expect(within(bloque).getByText("Aviso manual: revisar portada")).toBeInTheDocument();
    expect(within(bloque).getByText("Sin señal en X, Google ni Wikipedia.")).toBeInTheDocument();
    expect(within(bloque).queryByRole("list")).not.toBeInTheDocument();
  });
});
