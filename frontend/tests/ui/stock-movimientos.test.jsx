// Módulo Stock: movimientos (ingreso, salida, daño, a reparación, reparado, merma) e historial.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, irA, montarApp, simularBackend } from "./apoyo";
import { armarInventario, stockResultante, validarMovimiento } from "../../src/utils/stock";

afterEach(cleanup);

const STOCK = [
  { material: "ALZA", disponible: 12, danado: 3, en_reparacion: 2, merma: 1 },
  { material: "MARCO_VACIO", disponible: 40, danado: 1, en_reparacion: 0, merma: 0 },
  { material: "MARCO_CERA_UNTADA", disponible: 15 },
];
const MOVIMIENTOS = [
  { id: 3, material: "ALZA", tipo: "DESCARTE", cantidad: 1, estado_origen: "EN_REPARACION", usuario_id: 1, fecha: "2026-10-21T10:00:00" },
  { id: 2, material: "ALZA", tipo: "ENVIO", cantidad: 2, apiario_id: 1, colmena_id: 1, observaciones: "Colmena nueva", usuario_id: 1, fecha: "2026-10-20T15:00:00" },
  { id: 1, material: "MARCO_VACIO", tipo: "INGRESO", cantidad: 50, usuario_id: 1, fecha: "2026-10-19T10:00:00" },
];
const datos = {
  "/stock/": STOCK,
  "/stock/movimientos/": MOVIMIENTOS,
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": [{ id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" }],
};
const vacio = { tipo: "", material: "", estado_origen: "", cantidad: "", apiario_id: "", colmena_id: "", observaciones: "" };
const inv = armarInventario(STOCK);
const alza = inv.items.find((i) => i.material === "ALZA");

it("cada unidad pasa por un solo estado", () => {
  expect(stockResultante(alza, "DANO", 2)).toEqual({ disponible: 10, danado: 5, enReparacion: 2, merma: 1 });
  expect(stockResultante(alza, "ENVIO_REPARACION", 3)).toEqual({ disponible: 12, danado: 0, enReparacion: 5, merma: 1 });
  expect(stockResultante(alza, "REPARACION", 2)).toEqual({ disponible: 14, danado: 3, enReparacion: 0, merma: 1 });
  expect(stockResultante(alza, "DESCARTE", 1, "DANADO")).toEqual({ disponible: 12, danado: 2, enReparacion: 2, merma: 2 });
  expect(stockResultante(alza, "DESCARTE", 1, "EN_REPARACION")).toEqual({ disponible: 12, danado: 3, enReparacion: 1, merma: 2 });
});

it("no deja que ningún estado quede negativo", () => {
  const v = (extra) => validarMovimiento({ ...vacio, material: "ALZA", ...extra }, inv);
  expect(v({ tipo: "ENVIO", cantidad: "13" }).cantidad).toBe("Solo hay 12 alzas disponibles.");
  expect(v({ tipo: "ENVIO_REPARACION", cantidad: "4" }).cantidad).toBe("Solo hay 3 alzas por reparar.");
  expect(v({ tipo: "REPARACION", cantidad: "3" }).cantidad).toBe("Solo hay 2 alzas en reparación.");
  expect(v({ tipo: "DESCARTE", cantidad: "1" }).estado_origen).toBeTruthy();
  expect(v({ tipo: "DESCARTE", cantidad: "3", estado_origen: "EN_REPARACION" }).cantidad).toBe("Solo hay 2 alzas en reparación.");
  // La salida no exige apiario: el stock es de la bodega central.
  expect(v({ tipo: "ENVIO", cantidad: "1" })).toMatchObject({ cantidad: undefined });
  expect(validarMovimiento({ ...vacio, tipo: "REPARACION", material: "MARCO_CERA_UNTADA", cantidad: "1" }, inv).material).toBeTruthy();
});

it("registra una salida de bodega sin destino", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar movimiento" }));
  const dialogo = await screen.findByRole("dialog");

  fireEvent.click(within(dialogo).getByRole("radio", { name: "Salida" }));
  fireEvent.change(within(dialogo).getByLabelText(/Material/), { target: { value: "ALZA" } });
  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "20" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));
  await within(dialogo).findByText("Solo hay 12 alzas disponibles.");
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);

  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "2" } });
  within(dialogo).getByText(/Después: 10 disponibles, 3 por reparar, 2 en reparación/);
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));

  await waitFor(() => expect(llamadas.some((l) => l.metodo === "POST")).toBe(true));
  expect(llamadas.find((l) => l.metodo === "POST")).toMatchObject({
    ruta: "/stock/movimientos/",
    cuerpo: { material: "ALZA", tipo: "ENVIO", cantidad: 2, apiario_id: null, colmena_id: null, estado_origen: null },
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(llamadas.filter((l) => l.ruta === "/stock/").length).toBeGreaterThan(1));
});

it("la salida puede indicar apiario y colmena", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar movimiento" }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.click(within(dialogo).getByRole("radio", { name: "Salida" }));
  fireEvent.change(within(dialogo).getByLabelText(/Material/), { target: { value: "ALZA" } });
  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "1" } });
  fireEvent.change(within(dialogo).getByLabelText(/Apiario/), { target: { value: "1" } });
  fireEvent.change(within(dialogo).getByLabelText(/Colmena/), { target: { value: "1" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST")?.cuerpo).toMatchObject({ apiario_id: 1, colmena_id: 1 }));
});

it("las acciones del panel abren el formulario listo: a reparación, reparado y merma", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");

  fireEvent.click(await screen.findByRole("button", { name: "Llevar a reparación marcos rotos" }));
  let dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByRole("radio", { name: "A reparación" }).getAttribute("aria-checked")).toBe("true");
  expect(within(dialogo).getByLabelText(/Material/).value).toBe("MARCO_VACIO");
  expect(within(within(dialogo).getByLabelText(/Material/)).queryByText("Marcos con cera untada")).toBeNull();
  fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

  fireEvent.click(screen.getByRole("button", { name: "Marcar reparados alzas" }));
  dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByRole("radio", { name: "Reparado" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

  fireEvent.click(screen.getByRole("button", { name: "Merma de alzas en reparación" }));
  dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByRole("radio", { name: "En reparación" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "1" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));
  await waitFor(() =>
    expect(llamadas.find((l) => l.metodo === "POST")?.cuerpo).toMatchObject({ tipo: "DESCARTE", material: "ALZA", estado_origen: "EN_REPARACION", cantidad: 1 })
  );
});

it("muestra un mensaje claro si el backend aún no tiene la opción (501)", async () => {
  simularBackend({
    usuario: ADMIN,
    datos,
    respuestas: { "POST /stock/movimientos/": (_, json) => json({ detail: "ENVIO aún no implementado" }, 501) },
  });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar movimiento" }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.click(within(dialogo).getByRole("radio", { name: "Salida" }));
  fireEvent.change(within(dialogo).getByLabelText(/Material/), { target: { value: "ALZA" } });
  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "1" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));
  await within(dialogo).findByText("Esta opción todavía no está disponible en el servidor.");
});

it("muestra un error del backend sin cerrar el formulario", async () => {
  simularBackend({
    usuario: ADMIN,
    datos,
    respuestas: { "POST /stock/movimientos/": (_, json) => json({ detail: "No hay stock suficiente de alzas" }, 409) },
  });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar movimiento" }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.change(within(dialogo).getByLabelText(/Material/), { target: { value: "ALZA" } });
  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "5" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));
  await within(dialogo).findByText("No hay stock suficiente de alzas");
});

it("muestra el historial con destino u origen y filtra en el backend", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");
  const panel = (await screen.findByRole("heading", { name: "Historial de movimientos" })).closest("section");
  await within(panel).findByText("Colmena nueva");
  within(panel).getByText("Mandinga · COL-001");
  within(panel).getByText("Desde en reparación");
  within(panel).getByText("+50");

  fireEvent.change(within(panel).getByLabelText("Filtrar por tipo de movimiento"), { target: { value: "ENVIO_REPARACION" } });
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta === "/stock/movimientos/" && l.params?.tipo === "ENVIO_REPARACION")).toBe(true)
  );
});
