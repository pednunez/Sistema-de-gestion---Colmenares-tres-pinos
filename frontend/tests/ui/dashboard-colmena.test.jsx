// S4-T03: dashboard con filtro por colmena y gráfico por estado.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
const col = (id, apiario_id) => ({ id, apiario_id, codigo: `COL-00${id}`, estado: "ACTIVA" });
const datos = {
  "/apiarios/": [
    { id: 1, nombre: "Mandinga" },
    { id: 2, nombre: "Culibrán" },
  ],
  "/colmenas/": [col(1, 1), col(2, 1), col(3, 2)],
  "/inspecciones/": [
    { id: 1, colmena_id: 1, fecha_inspeccion: hace(40), estado_general: "DEBIL" },
    { id: 2, colmena_id: 1, fecha_inspeccion: hace(20), estado_general: "EN_DESARROLLO" },
    { id: 3, colmena_id: 1, fecha_inspeccion: hace(2), estado_general: "COMPLETA" },
    { id: 4, colmena_id: 2, fecha_inspeccion: hace(3), estado_general: "REQUIERE_REVISION" },
    { id: 5, colmena_id: 3, fecha_inspeccion: hace(4), estado_general: "COMPLETA" },
  ],
};

async function abrir() {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await screen.findByText("Estado según última inspección");
}

it("el gráfico resume las colmenas por el estado de su última inspección", async () => {
  await abrir();
  screen.getByRole("img", { name: "Colmenas por estado. Completa: 2, Requiere revisión: 1." });
  const detalle = screen.getByRole("list", { name: "Detalle por estado" });
  within(detalle).getByText("Completa");
  expect(within(detalle).getByText("Completa").closest("li").textContent).toContain("2 (67%)");

  // Con un apiario elegido, el gráfico y la lista de colmenas se acotan a él.
  fireEvent.click(screen.getByRole("radio", { name: "Mandinga" }));
  screen.getByRole("img", { name: "Colmenas por estado. Completa: 1, Requiere revisión: 1." });
  const colmenas = screen.getByLabelText("Colmena");
  expect([...colmenas.options].map((o) => o.textContent)).toEqual(["Todas las de Mandinga", "COL-001", "COL-002"]);
});

it("con una colmena elegida muestra su estado en cada inspección y abre el detalle", async () => {
  await abrir();
  fireEvent.change(screen.getByLabelText("Colmena"), { target: { value: "1" } });
  await screen.findByText("Estado de COL-001 en sus inspecciones");
  screen.getByText("COL-001 está al día.");
  screen.getByText(/Última inspección: .* · Completa/);

  const estados = screen.getByRole("list", { name: /Estado en cada inspección/ });
  const botones = within(estados).getAllByRole("button");
  expect(botones.map((b) => b.getAttribute("aria-label").split(": ")[1])).toEqual(["Débil", "En desarrollo", "Completa"]);
  fireEvent.click(botones[0]);
  await screen.findByRole("dialog", { name: "Inspección de COL-001" });
});

it("al cambiar a otro apiario se quita la colmena elegida", async () => {
  await abrir();
  fireEvent.change(screen.getByLabelText("Colmena"), { target: { value: "2" } });
  await screen.findByText("Estado de COL-002 en sus inspecciones");
  screen.getByText("Última inspección: requiere revisión");
  fireEvent.click(screen.getByRole("radio", { name: "Culibrán" }));
  await screen.findByText("Estado según última inspección");
  expect(screen.getByLabelText("Colmena").value).toBe("");
});
