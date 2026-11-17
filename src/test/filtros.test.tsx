import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Index } from "@/routes/_authenticated/index";
import { valorar } from "@/lib/alertasRepo";
import { toast } from "sonner";

import { crearDemoAlertas } from '@/data/demoAlertas';
vi.mock('@/lib/alertasRepo', () => ({ listAlertas: vi.fn(async () => crearDemoAlertas()), valorar: vi.fn() }));
// El aviso al marcar «ruido» se comprueba sin pintarlo.
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
// Datos de ejemplo: 8 alertas en los últimos 7 días (la más antigua, hace 65 h).
// estado "ruido" -> 1 (Comparecencia en el Congreso); prioridad "alta" -> 4.
function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Index />
    </QueryClientProvider>,
  );
}

async function alertasVisibles() {
  const lista = await screen.findByRole("listbox", { name: "Alertas" });
  return within(lista).queryAllByRole("option");
}

const selector = (nombre: string) => screen.getByLabelText(nombre) as HTMLSelectElement;

describe("selectores de filtros", () => {
  it("arrancan en Prioridad Todas, Estado Todos y Periodo 7 días", async () => {
    renderPanel();
    await alertasVisibles();
    expect(selector("Prioridad").value).toBe("todas");
    expect(selector("Estado").value).toBe("todos");
    expect(selector("Periodo").value).toBe("7d");
    expect(screen.getByText("8 de 8")).toBeInTheDocument();
  });

  it("Estado Ruido deja solo la alerta de ruido", async () => {
    renderPanel();
    await alertasVisibles();
    fireEvent.change(selector("Estado"), { target: { value: "ruido" } });
    await waitFor(() => expect(screen.getByText("1 de 8")).toBeInTheDocument());
    const visibles = await alertasVisibles();
    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.textContent).toContain("Comparecencia en el Congreso");
  });

  it("Prioridad Alta deja las 4 alertas altas", async () => {
    renderPanel();
    await alertasVisibles();
    fireEvent.change(selector("Prioridad"), { target: { value: "alta" } });
    await waitFor(() => expect(screen.getByText("4 de 8")).toBeInTheDocument());
    expect(await alertasVisibles()).toHaveLength(4);
  });

  it("Restablecer filtros vuelve a los valores por defecto y solo aparece si algo está filtrado", async () => {
    renderPanel();
    await alertasVisibles();
    expect(screen.queryByText("Restablecer filtros")).not.toBeInTheDocument();

    fireEvent.change(selector("Estado"), { target: { value: "publicada" } });
    await waitFor(() => expect(screen.getByText("2 de 8")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Restablecer filtros"));

    await waitFor(() => expect(screen.getByText("8 de 8")).toBeInTheDocument());
    expect(selector("Estado").value).toBe("todos");
    expect(selector("Prioridad").value).toBe("todas");
    expect(selector("Periodo").value).toBe("7d");
    expect(screen.queryByText("Restablecer filtros")).not.toBeInTheDocument();
  });

  it("«Todos menos ruido» deja fuera solo la alerta de ruido", async () => {
    renderPanel();
    await alertasVisibles();
    fireEvent.change(selector("Estado"), { target: { value: "sin_ruido" } });
    await waitFor(() => expect(screen.getByText("7 de 8")).toBeInTheDocument());
    const textos = (await alertasVisibles()).map((o) => o.textContent ?? "");
    expect(textos.some((t) => t.includes("Comparecencia en el Congreso"))).toBe(false);
  });

  it("Fuente: «X» es tener señal en X; «Varias fuentes», dos o más", async () => {
    renderPanel();
    await alertasVisibles();
    expect(selector("Fuente").value).toBe("todas");
    fireEvent.change(selector("Fuente"), { target: { value: "varias" } });
    await waitFor(() => expect(screen.getByText("4 de 8")).toBeInTheDocument());
    fireEvent.change(selector("Fuente"), { target: { value: "google" } });
    await waitFor(() => expect(screen.getByText("5 de 8")).toBeInTheDocument());
    fireEvent.change(selector("Fuente"), { target: { value: "wikipedia" } });
    await waitFor(() => expect(screen.getByText("No hay alertas con estos filtros.")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Restablecer filtros"));
    await waitFor(() => expect(screen.getByText("8 de 8")).toBeInTheDocument());
    expect(selector("Fuente").value).toBe("todas");
  });

  it("sin datos de Search Console no sale el filtro de Autoridad", async () => {
    renderPanel();
    await alertasVisibles();
    expect(screen.queryByLabelText("Autoridad")).not.toBeInTheDocument();
  });

  it("al marcar «No, es ruido» avisa de que la alerta sigue en la lista (o de que el filtro la oculta)", async () => {
    vi.mocked(valorar).mockImplementation(async (id, cambios) => ({
      ...crearDemoAlertas().find((a) => a.id === id)!,
      ...cambios,
    }));
    renderPanel();
    await alertasVisibles();
    fireEvent.click(screen.getByRole("button", { name: "No, es ruido" }));
    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenLastCalledWith(expect.stringContaining("Sigue en la lista")),
    );
    fireEvent.change(selector("Estado"), { target: { value: "sin_ruido" } });
    await waitFor(() => expect(screen.getByText(/de 8/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "No, es ruido" }));
    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenLastCalledWith(expect.stringContaining("deja de verse")),
    );
  });
});
