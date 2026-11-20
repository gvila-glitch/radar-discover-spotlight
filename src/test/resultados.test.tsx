import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Resultados } from "@/routes/_authenticated/resultados";
import { crearDemoAlertas } from "@/data/demoAlertas";

vi.mock("@/lib/alertasRepo", () => ({ listAlertas: vi.fn(async () => crearDemoAlertas()) }));

describe("Resultados", () => {
  it("enseña los cuatro indicadores del piloto con los últimos 7 días", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Resultados />
      </QueryClientProvider>,
    );
    const indicadores = await screen.findByRole("region", { name: "Indicadores" });
    for (const t of ["Alertas hoy", "Útiles", "Acabaron en pieza", "Medios en Discover"]) {
      expect(indicadores).toHaveTextContent(t);
    }
    // Ejemplo: 5 valoradas, 4 útiles o publicadas → 80 %.
    expect(screen.getByText("80 %")).toBeInTheDocument();
  });
});
