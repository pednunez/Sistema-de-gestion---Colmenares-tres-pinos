// Módulo Stock, paso 1: inventario por material.
import { afterEach, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { armarInventario } from "../../src/utils/stock";

afterEach(cleanup);

const STOCK = [
  { material: "ALZA", disponible: 12, danado: 3 },
  { material: "MARCO_VACIO", disponible: 40, danado: 1 },
  { material: "MARCO_CERA_ESTIRADA", disponible: 25, danado: 0 },
  { material: "MARCO_CERA_UNTADA", disponible: 15 },
  { material: "TECHO_AMERICANO", disponible: 8, danado: 0 },
  { material: "ENTRETAPA", disponible: 6, danado: 2 },
];

it("muestra todos los materiales, aunque el backend no traiga alguno", () => {
  const inv = armarInventario(STOCK);
  expect(inv.items).toHaveLength(7);
  expect(inv.items.find((i) => i.material === "PISO")).toMatchObject({ disponible: 0, danado: 0 });
  expect(inv.totalDisponible).toBe(106);
  expect(inv.totalDanado).toBe(6);
  expect(inv.marcosListos).toBe(80);
});

it("no acepta cantidades negativas ni daño en marcos con cera", () => {
  const inv = armarInventario([
    { material: "ALZA", disponible: -4, danado: "2" },
    { material: "MARCO_CERA_UNTADA", disponible: 5, danado: 9 },
  ]);
  expect(inv.items.find((i) => i.material === "ALZA")).toMatchObject({ disponible: 0, danado: 2 });
  expect(inv.items.find((i) => i.material === "MARCO_CERA_UNTADA").danado).toBe(0);
});

it("la pantalla Stock muestra el inventario y el material dañado", async () => {
  simularBackend({ usuario: ADMIN, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");

  const alzas = await screen.findByRole("article", { name: "Alzas" });
  within(alzas).getByText("12");
  within(alzas).getByText("3 alzas por reparar");
  within(screen.getByRole("article", { name: "Pisos" })).getByText("Sin material dañado");

  const panel = screen.getByRole("heading", { name: "Material dañado", level: 3 }).closest("section");
  within(panel).getByText("Entretapas");
  within(panel).getByText("2 entretapas");
  within(panel).getByText("Marcos rotos");
  within(panel).getByText("1 marco");
});

it("explica que el módulo falta en el servidor si /stock/ responde 404", async () => {
  simularBackend({
    usuario: ADMIN,
    respuestas: { "GET /stock/": (_, json) => json({ detail: "Not Found" }, 404) },
  });
  await montarApp();
  await irA("Stock");
  expect(await screen.findByText("El inventario todavía no está disponible")).toBeTruthy();
});

it("el apicultor también ve el módulo Stock", async () => {
  simularBackend({ usuario: APICULTOR, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");
  expect(await screen.findByRole("article", { name: "Alzas" })).toBeTruthy();
});
