// Módulo Stock, paso 2: movimientos e historial.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { armarInventario, stockResultante, validarMovimiento } from "../../src/utils/stock";

afterEach(cleanup);

const STOCK = [
  { material: "ALZA", disponible: 12, danado: 3 },
  { material: "MARCO_VACIO", disponible: 40, danado: 1 },
  { material: "MARCO_CERA_UNTADA", disponible: 15 },
];
const MOVIMIENTOS = [
  { id: 2, material: "ALZA", tipo: "ENVIO", cantidad: 2, apiario_id: 1, colmena_id: 1, observaciones: "Colmena nueva", usuario_id: 1, fecha: "2026-10-20T15:00:00" },
  { id: 1, material: "MARCO_VACIO", tipo: "INGRESO", cantidad: 50, apiario_id: null, colmena_id: null, observaciones: null, usuario_id: 1, fecha: "2026-10-19T10:00:00" },
];
const datos = {
  "/stock/": STOCK,
  "/stock/movimientos/": MOVIMIENTOS,
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": [{ id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" }],
};
const vacio = { tipo: "", material: "", cantidad: "", apiario_id: "", colmena_id: "", observaciones: "" };
const inv = armarInventario(STOCK);

it("no deja que el stock quede negativo", () => {
  expect(validarMovimiento({ ...vacio, tipo: "ENVIO", material: "ALZA", cantidad: "13", apiario_id: "1" }, inv).cantidad).toBe("Solo hay 12 alzas disponibles.");
  expect(validarMovimiento({ ...vacio, tipo: "REPARACION", material: "ALZA", cantidad: "4" }, inv).cantidad).toBe("Solo hay 3 alzas por reparar.");
  expect(validarMovimiento({ ...vacio, tipo: "INGRESO", material: "ALZA", cantidad: "500" }, inv).cantidad).toBeUndefined();
  expect(validarMovimiento({ ...vacio, tipo: "INGRESO", material: "ALZA", cantidad: "2.5" }, inv).cantidad).toMatch(/entero/);
  expect(validarMovimiento({ ...vacio, tipo: "ENVIO", material: "ALZA", cantidad: "1" }, inv).apiario_id).toBeTruthy();
  expect(validarMovimiento({ ...vacio, tipo: "DESCARTE", material: "MARCO_CERA_UNTADA", cantidad: "1" }, inv).material).toBeTruthy();
});

it("calcula cómo queda el material", () => {
  const alza = inv.items.find((i) => i.material === "ALZA");
  expect(stockResultante(alza, "DANO", 2)).toEqual({ disponible: 10, danado: 5 });
  expect(stockResultante(alza, "REPARACION", 3)).toEqual({ disponible: 15, danado: 0 });
  expect(stockResultante(alza, "DESCARTE", 1)).toEqual({ disponible: 12, danado: 2 });
});

it("el administrador registra un envío a un apiario", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar movimiento" }));
  const dialogo = await screen.findByRole("dialog");

  fireEvent.click(within(dialogo).getByRole("radio", { name: "Envío" }));
  fireEvent.change(within(dialogo).getByLabelText(/Material/), { target: { value: "ALZA" } });
  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "20" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));

  await within(dialogo).findByText("Solo hay 12 alzas disponibles.");
  within(dialogo).getByText("Elige el apiario de destino.");
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);

  fireEvent.change(within(dialogo).getByLabelText(/Cantidad/), { target: { value: "2" } });
  within(dialogo).getByText(/Después: 10 disponibles, 3 dañados/);
  fireEvent.change(within(dialogo).getByLabelText(/Apiario de destino/), { target: { value: "1" } });
  fireEvent.change(within(dialogo).getByLabelText(/Colmena/), { target: { value: "1" } });
  fireEvent.change(within(dialogo).getByLabelText(/Observaciones/), { target: { value: "  Colmena nueva " } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Registrar movimiento" }));

  await waitFor(() => expect(llamadas.some((l) => l.metodo === "POST")).toBe(true));
  expect(llamadas.find((l) => l.metodo === "POST")).toMatchObject({
    ruta: "/stock/movimientos/",
    cuerpo: { material: "ALZA", tipo: "ENVIO", cantidad: 2, apiario_id: 1, colmena_id: 1, observaciones: "Colmena nueva" },
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // Después de guardar se vuelve a pedir el inventario y el historial.
  await waitFor(() => expect(llamadas.filter((l) => l.ruta === "/stock/").length).toBeGreaterThan(1));
});

it("los botones Reparar abren el formulario con el material elegido", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Reparar marcos rotos" }));
  const dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByRole("radio", { name: "Reparación" }).getAttribute("aria-checked")).toBe("true");
  expect(within(dialogo).getByLabelText(/Material/).value).toBe("MARCO_VACIO");
  // Los marcos con cera no se ofrecen para reparar.
  expect(within(within(dialogo).getByLabelText(/Material/)).queryByText("Marcos con cera untada")).toBeNull();
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

it("muestra el historial y filtra en el backend", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Stock");
  const panel = (await screen.findByRole("heading", { name: "Historial de movimientos" })).closest("section");
  await within(panel).findByText("Colmena nueva");
  within(panel).getByText("Mandinga · COL-001");
  within(panel).getByText("+50");

  fireEvent.change(within(panel).getByLabelText("Filtrar por tipo de movimiento"), { target: { value: "DANO" } });
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta === "/stock/movimientos/" && l.params?.tipo === "DANO")).toBe(true)
  );
});

it("el apicultor ve el stock pero no registra movimientos", async () => {
  simularBackend({ usuario: APICULTOR, datos });
  await montarApp();
  await irA("Stock");
  await screen.findByRole("article", { name: "Alzas" });
  expect(screen.queryByRole("button", { name: "Registrar movimiento" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Reparar/ })).toBeNull();
});
