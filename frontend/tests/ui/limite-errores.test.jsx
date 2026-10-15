import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LimiteErrores from "../../src/components/ui/LimiteErrores";
import { erroresRegistrados } from "../../src/services/registroErrores";

function Rompe() { throw new Error("falla de prueba"); }

it("muestra el aviso con código y registra el error de UI", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<LimiteErrores><Rompe /></LimiteErrores>);
  screen.getByText("Esta pantalla tuvo un problema");
  const r = erroresRegistrados().at(-1);
  expect(r).toMatchObject({ tipo: "UI", mensaje: "falla de prueba" });
  expect(screen.getByText(r.correlationId.slice(0, 8))).toBeTruthy();
});
