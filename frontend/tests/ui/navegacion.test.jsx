import { it, expect, afterEach } from "vitest";
import { screen, within, cleanup, waitFor } from "@testing-library/react";
import { ADMIN, APICULTOR, simularBackend, montarApp, irA } from "./apoyo";

afterEach(cleanup);

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": [{ id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" }],
};

it("el administrador recorre todas las pantallas sin errores", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await screen.findByText("Colmenas que requieren atención");
  for (const seccion of ["Apiarios", "Colmenas", "Inspecciones", "Tratamientos", "Transferencias", "Stock", "Grupos", "Códigos QR", "Auditoría", "Usuarios"]) {
    await irA(seccion);
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 })[0].textContent).toBe(seccion));
  }
  expect(screen.queryByText("Esta pantalla tuvo un problema")).toBeNull();
});

it("el apicultor no ve las secciones de administración (RF-09)", async () => {
  simularBackend({ usuario: APICULTOR, datos });
  await montarApp();
  const nav = (await screen.findAllByRole("navigation"))[0];
  for (const oculta of ["Dashboard", "Apiarios", "Auditoría", "Usuarios"]) {
    expect(within(nav).queryByText(oculta)).toBeNull();
  }
  within(nav).getByText("Inspecciones");
  expect(screen.queryByRole("button", { name: "Nueva colmena" })).toBeNull();
});
