// Dashboard: ver todos los apiarios juntos o uno a la vez.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const hoy = new Date().toISOString();
const insp = (id, colmena_id, estado_general) => ({ id, colmena_id, usuario_id: 1, estado_general, fecha_inspeccion: hoy, activo: true });

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga", ubicacion: "Linares" }, { id: 2, nombre: "Popeta" }],
  "/colmenas/": [
    { id: 1, apiario_id: 1, codigo: "MAN-001", estado: "ACTIVA" },
    { id: 2, apiario_id: 1, codigo: "MAN-002", estado: "ACTIVA" },
    { id: 3, apiario_id: 2, codigo: "POP-001", estado: "ACTIVA" },
  ],
  "/inspecciones/": [insp(1, 1, "COMPLETA"), insp(2, 2, "DEBIL"), insp(3, 3, "REQUIERE_REVISION")],
  "/tratamientos/": [{ id: 9, colmena_id: 3, estado: "EN_CURSO", tipo_tratamiento: "VARROA", fecha_inicio: "2026-10-01" }],
};

const panel = (titulo) => screen.getByRole("heading", { name: titulo }).closest("section");
const fila = (texto) => within(panel("Estado según última inspección")).getByText(texto).parentElement.textContent;
const tarjeta = (titulo) => screen.getAllByText(titulo).map((e) => e.closest("button")).find(Boolean).textContent;

it("por defecto muestra todos los apiarios", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await screen.findByText("Colmenas que requieren atención");
  expect(screen.getByRole("radio", { name: "Todos los apiarios" }).getAttribute("aria-checked")).toBe("true");
  expect(tarjeta("Colmenas en operación")).toContain("3");
  const alertas = panel("Colmenas que requieren atención");
  within(alertas).getByText("MAN-002");
  within(alertas).getByText("POP-001");
  expect(fila("Completa")).toContain("1 (33%)");
});

it("al elegir un apiario, todo el panel muestra solo ese apiario", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await screen.findByText("Colmenas que requieren atención");
  fireEvent.click(screen.getByRole("radio", { name: "Mandinga" }));

  expect(tarjeta("Apiario")).toContain("Mandinga");
  expect(tarjeta("Colmenas en operación")).toContain("2");
  expect(tarjeta("Requieren atención")).toContain("1");
  expect(tarjeta("Tratamientos en curso")).toContain("0");

  const alertas = panel("Colmenas que requieren atención");
  within(alertas).getByText("MAN-002");
  expect(within(alertas).queryByText("POP-001")).toBeNull();
  expect(fila("Completa")).toContain("1 (50%)");
  expect(fila("Débil")).toContain("1 (50%)");
  expect(fila("Requiere revisión")).toContain("0 (0%)");

  // La tabla por apiario sigue mostrando todos para comparar.
  within(panel("Resumen por apiario")).getByText("Popeta");
});

it("desde la tabla por apiario se puede ver ese apiario en el panel", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await screen.findByText("Colmenas que requieren atención");
  const filaPopeta = within(panel("Resumen por apiario")).getByText("Popeta").closest("tr");
  fireEvent.click(within(filaPopeta).getByRole("button", { name: "Ver en el panel" }));
  expect(screen.getByRole("radio", { name: "Popeta" }).getAttribute("aria-checked")).toBe("true");
  expect(fila("Requiere revisión")).toContain("1 (100%)");
  expect(tarjeta("Tratamientos en curso")).toContain("1");
});
