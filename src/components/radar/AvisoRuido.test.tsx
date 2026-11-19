import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AvisoRuido } from "./AvisoRuido";

describe("AvisoRuido", () => {
  afterEach(cleanup);

  it("dice que la alerta sale de la lista, dónde verla y deja deshacer", () => {
    const onDeshacer = vi.fn();
    render(
      <AvisoRuido nombre="Supervivientes" saleDeLista onDeshacer={onDeshacer} onMotivo={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "«Supervivientes» marcada como ruido. Ya no sale en la lista.",
    );
    expect(screen.getByText("Para volver a verla: Estado › Ruido.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(onDeshacer).toHaveBeenCalledOnce();
  });

  it("si la alerta sigue en la lista (filtro «Todos» o «Ruido»), no dice que sale", () => {
    render(<AvisoRuido nombre="X" saleDeLista={false} onDeshacer={vi.fn()} onMotivo={vi.fn()} />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Ya no sale en la lista");
    expect(screen.queryByText(/Para volver a verla/)).not.toBeInTheDocument();
  });

  it("el motivo se elige con un clic y otro clic en el mismo lo quita", () => {
    const onMotivo = vi.fn();
    render(<AvisoRuido nombre="X" saleDeLista onDeshacer={vi.fn()} onMotivo={onMotivo} />);
    const grupo = screen.getByRole("group", { name: "Por qué es ruido" });
    const tarde = within(grupo).getByRole("button", { name: "Llegamos tarde" });
    fireEvent.click(tarde);
    expect(onMotivo).toHaveBeenLastCalledWith("tarde");
    expect(tarde).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(tarde);
    expect(onMotivo).toHaveBeenLastCalledWith(null);
    expect(tarde).toHaveAttribute("aria-pressed", "false");
  });
});
