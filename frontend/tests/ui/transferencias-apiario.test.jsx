// Transferencias: ver todas o solo las de un apiario.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { ADMIN, irA, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const t = (id, origen, destino) => ({
  id, colmena_origen_id: origen, colmena_destino_id: destino, cantidad_marcos: 1, tipo_marco: "CRIA",
  usuario_id: 1, fecha_transferencia: "2026-10-26T10:00:00", observaciones: `Transferencia ${id}`,
});

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }, { id: 2, nombre: "Popeta" }, { id: 3, nombre: "El Peumo" }],
  "/colmenas/": [
    { id: 1, apiario_id: 1, codigo: "MAN-001", estado: "ACTIVA" },
    { id: 2, apiario_id: 1, codigo: "MAN-002", estado: "ACTIVA" },
    { id: 3, apiario_id: 2, codigo: "POP-001", estado: "ACTIVA" },
    { id: 4, apiario_id: 3, codigo: "PEU-001", estado: "ACTIVA" },
  ],
  // Dentro de Mandinga, de Mandinga a Popeta, y de Popeta a El Peumo.
  "/transferencias-marcos/": [t(1, 1, 2), t(2, 1, 3), t(3, 3, 4)],
};

it("por defecto muestra todas las transferencias con el apiario de cada colmena", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Transferencias");
  await screen.findByText("Transferencia 1");
  screen.getByText("Transferencia 3");
  expect(screen.getByRole("radio", { name: "Todos los apiarios" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getAllByText("Mandinga").length).toBeGreaterThan(1);
});

it("con un apiario elegido muestra las que salieron o llegaron a sus colmenas", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Transferencias");
  await screen.findByText("Transferencia 1");

  fireEvent.click(screen.getByRole("radio", { name: "Popeta" }));
  expect(screen.queryByText("Transferencia 1")).toBeNull();
  screen.getByText("Transferencia 2");
  screen.getByText("Transferencia 3");
  screen.getByText(/Popeta: 2 transferencias · 1 salida de sus colmenas · 1 llegada a sus colmenas/);

  fireEvent.click(screen.getByRole("radio", { name: "Mandinga" }));
  screen.getByText("Transferencia 1");
  screen.getByText("Transferencia 2");
  expect(screen.queryByText("Transferencia 3")).toBeNull();
});

it("la búsqueda por código se combina con el apiario", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Transferencias");
  await screen.findByText("Transferencia 1");
  fireEvent.click(screen.getByRole("radio", { name: "Mandinga" }));
  fireEvent.change(screen.getByLabelText("Buscar por código de colmena"), { target: { value: "pop" } });
  screen.getByText("Transferencia 2");
  expect(screen.queryByText("Transferencia 1")).toBeNull();
});
