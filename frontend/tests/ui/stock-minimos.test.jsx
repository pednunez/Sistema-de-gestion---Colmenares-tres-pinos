// Módulo Stock, paso 3: mínimos y aviso de stock bajo.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { armarInventario, validarMinimo } from "../../src/utils/stock";

afterEach(cleanup);

const STOCK = [
  { material: "ALZA", disponible: 3, danado: 0, minimo: 5 },
  { material: "MARCO_VACIO", disponible: 40, danado: 0, minimo: 20 },
  { material: "ENTRETAPA", disponible: 0, danado: 0, minimo: 2 },
  { material: "PISO", disponible: 4, danado: 0, minimo: null },
];

it("marca como stock bajo solo lo que está bajo su mínimo", () => {
  const { bajos, items } = armarInventario(STOCK);
  expect(bajos.map((i) => i.material)).toEqual(["ALZA", "ENTRETAPA"]);
  expect(items.find((i) => i.material === "PISO")).toMatchObject({ minimo: null, bajoMinimo: false });
  // Igual al mínimo no es stock bajo.
  expect(armarInventario([{ material: "ALZA", disponible: 5, minimo: 5 }]).bajos).toHaveLength(0);
});

it("valida el mínimo", () => {
  expect(validarMinimo("")).toBeUndefined();
  expect(validarMinimo("0")).toBeUndefined();
  expect(validarMinimo("-1")).toBeTruthy();
  expect(validarMinimo("2.5")).toBeTruthy();
});

it("la pantalla Stock avisa el stock bajo y permite cambiar el mínimo", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");

  await screen.findByText("2 materiales están bajo su mínimo");
  screen.getByText("Alzas: 3 de un mínimo de 5");
  within(screen.getByRole("article", { name: "Alzas" })).getByText("Stock bajo");
  expect(within(screen.getByRole("article", { name: "Marcos vacíos" })).queryByText("Stock bajo")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Cambiar mínimo de pisos" }));
  const dialogo = await screen.findByRole("dialog");
  const campo = within(dialogo).getByLabelText("Cantidad mínima");
  fireEvent.change(campo, { target: { value: "-2" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar mínimo" }));
  await within(dialogo).findByText(/entero de 0 o más/);

  fireEvent.change(campo, { target: { value: "6" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar mínimo" }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === "PATCH")).toBe(true));
  expect(llamadas.find((l) => l.metodo === "PATCH")).toMatchObject({ ruta: "/stock/PISO", cuerpo: { minimo: 6 } });
});

it("dejar el mínimo vacío lo quita", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");
  fireEvent.click(await screen.findByRole("button", { name: "Cambiar mínimo de alzas" }));
  const dialogo = await screen.findByRole("dialog");
  fireEvent.change(within(dialogo).getByLabelText("Cantidad mínima"), { target: { value: "" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar mínimo" }));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "PATCH")?.cuerpo).toEqual({ minimo: null }));
});

it("el Dashboard avisa el stock bajo y lleva a Stock", async () => {
  simularBackend({ usuario: ADMIN, datos: { "/stock/": STOCK } });
  await montarApp();
  await screen.findByText("2 materiales están bajo su mínimo");
  fireEvent.click(screen.getByRole("button", { name: "Ver stock" }));
  await waitFor(() => expect(screen.getAllByRole("heading", { level: 1 })[0].textContent).toBe("Stock"));
});

it("el Dashboard no muestra nada si el backend aún no tiene stock", async () => {
  simularBackend({ usuario: ADMIN, respuestas: { "GET /stock/": (_, json) => json({ detail: "Not Found" }, 404) } });
  await montarApp();
  await screen.findByText("Colmenas que requieren atención");
  expect(screen.queryByText(/bajo su mínimo/)).toBeNull();
});

it("el apicultor ve el aviso pero no cambia mínimos", async () => {
  simularBackend({ usuario: APICULTOR, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");
  await screen.findByText("2 materiales están bajo su mínimo");
  expect(screen.queryByRole("button", { name: /Cambiar mínimo/ })).toBeNull();
});
