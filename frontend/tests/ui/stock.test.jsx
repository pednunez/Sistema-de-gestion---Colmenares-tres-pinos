// Módulo Stock: inventario de la bodega central por material y estado.
import { afterEach, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { armarInventario, cantidadCon } from "../../src/utils/stock";

afterEach(cleanup);

const STOCK = [
  { material: "CAJON", disponible: 4, danado: 1, en_reparacion: 0, merma: 0 },
  { material: "ALZA", disponible: 12, danado: 3, en_reparacion: 2, merma: 1 },
  { material: "MARCO_VACIO", disponible: 40, danado: 1, en_reparacion: 0, merma: 5 },
  { material: "MARCO_CERA_ESTIRADA", disponible: 25 },
  { material: "MARCO_CERA_UNTADA", disponible: 15, danado: 9, en_reparacion: 9 },
  { material: "TECHO_AMERICANO", disponible: 8 },
  { material: "ENTRETAPA", disponible: 6, danado: 0, en_reparacion: 2 },
];

it("muestra los once materiales, aunque el backend no traiga alguno", () => {
  const inv = armarInventario(STOCK);
  expect(inv.items).toHaveLength(11);
  expect(inv.items.find((i) => i.material === "TECHO")).toMatchObject({ disponible: 0, danado: 0, enReparacion: 0, merma: 0 });
  expect(inv.totalDisponible).toBe(110);
  expect(inv.totalDanado).toBe(5);
  expect(inv.totalEnReparacion).toBe(4);
  expect(inv.totalMerma).toBe(6);
  expect(inv.marcosListos).toBe(80);
  // Los marcos con cera no llevan estados propios.
  expect(inv.items.find((i) => i.material === "MARCO_CERA_UNTADA")).toMatchObject({ danado: 0, enReparacion: 0 });
  expect(inv.conPendientes.map((i) => i.material)).toEqual(["CAJON", "ALZA", "ENTRETAPA", "MARCO_VACIO"]);
});

it("los materiales nuevos quedan pendientes si el backend no los trae", () => {
  const inv = armarInventario(STOCK);
  expect(inv.items.find((i) => i.material === "MARCO_MIEL").pendienteServidor).toBe(true);
  expect(inv.items.find((i) => i.material === "MARCO_CERA_ESTAMPADA").pendienteServidor).toBe(true);
  // Un material de siempre que no viene se muestra en 0, no como pendiente.
  expect(inv.items.find((i) => i.material === "TECHO").pendienteServidor).toBe(false);
  const conNuevos = armarInventario([...STOCK, { material: "MARCO_MIEL", disponible: 6 }, { material: "MARCO_CERA_ESTAMPADA", disponible: 3 }]);
  expect(conNuevos.items.find((i) => i.material === "MARCO_MIEL")).toMatchObject({ pendienteServidor: false, disponible: 6 });
  // Los marcos con miel no cuentan como listos para usar: primero van a extracción.
  expect(conNuevos.marcosListos).toBe(83);
});

it("no acepta cantidades negativas y usa el plural correcto", () => {
  const inv = armarInventario([{ material: "ALZA", disponible: -4, danado: "2" }]);
  expect(inv.items.find((i) => i.material === "ALZA")).toMatchObject({ disponible: 0, danado: 2 });
  const cajon = inv.items.find((i) => i.material === "CAJON");
  expect(cantidadCon(1, cajon)).toBe("1 cajón");
  expect(cantidadCon(2, cajon)).toBe("2 cajones");
});

it("la pantalla Stock muestra cada estado y el panel de reparaciones", async () => {
  simularBackend({ usuario: ADMIN, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");

  const alzas = await screen.findByRole("article", { name: "Alzas" });
  within(alzas).getByText("12");
  expect(within(alzas).getByText("Dañados (por reparar)").nextSibling.textContent).toBe("3");
  expect(within(alzas).getByText("En reparación").nextSibling.textContent).toBe("2");
  expect(within(alzas).getByText("Merma acumulada").nextSibling.textContent).toBe("1");
  screen.getByRole("article", { name: "Techos" });
  screen.getByRole("article", { name: "Cajones" });

  const panel = screen.getByRole("heading", { name: "Dañado y en reparación" }).closest("section");
  within(panel).getByText("Marcos rotos");
  within(panel).getByText("1 cajón");
  within(panel).getByText("2 entretapas");
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

it("el apicultor ve el stock sin acciones", async () => {
  simularBackend({ usuario: APICULTOR, datos: { "/stock/": STOCK } });
  await montarApp();
  await irA("Stock");
  await screen.findByRole("article", { name: "Alzas" });
  expect(screen.queryByRole("button", { name: "Registrar movimiento" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^(Llevar a reparación|Merma de|Marcar reparados)/ })).toBeNull();
});
