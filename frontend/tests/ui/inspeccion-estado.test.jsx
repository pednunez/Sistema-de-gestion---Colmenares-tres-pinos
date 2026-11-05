// PB-08: estado de la colmena en la inspección (H005-E4).
import { afterEach, expect, it } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { ADMIN, irA, montarApp, simularBackend } from "./apoyo";
import { calcularAlertas } from "../../src/utils/alertas";
import { ESTADO_GENERAL } from "../../src/utils/etiquetas";

afterEach(cleanup);

const hoy = new Date().toISOString();
const colmena = (id) => ({ id, apiario_id: 1, codigo: `COL-00${id}`, estado: "ACTIVA" });
const insp = (id, colmena_id, estado_general) => ({ id, colmena_id, usuario_id: 1, estado_general, fecha_inspeccion: hoy, activo: true });

it("ofrece los cinco estados acordados con el cliente", () => {
  expect(Object.values(ESTADO_GENERAL).map((e) => e.texto)).toEqual([
    "Completa", "En desarrollo", "Donante", "Débil", "Requiere revisión",
  ]);
});

it("requiere revisión es prioridad alta; débil, revisar; el resto no alerta", () => {
  const colmenas = [1, 2, 3, 4, 5].map(colmena);
  const alertas = calcularAlertas(colmenas, [
    insp(1, 1, "REQUIERE_REVISION"), insp(2, 2, "DEBIL"), insp(3, 3, "COMPLETA"), insp(4, 4, "DONANTE"), insp(5, 5, "EN_DESARROLLO"),
  ]);
  expect(alertas.map((a) => [a.colmena.id, a.prioridad])).toEqual([[1, "alta"], [2, "media"]]);
  expect(alertas[0].motivos).toContain("Última inspección: requiere revisión");
  expect(alertas[1].motivos).toContain("Última inspección: colmena débil");
});

it("la escala anterior sigue generando alertas", () => {
  const alertas = calcularAlertas([colmena(1)], [insp(1, 1, "CRITICO")]);
  expect(alertas[0].prioridad).toBe("alta");
});

it("el Dashboard reparte las colmenas por estado y agrupa la escala anterior", async () => {
  simularBackend({
    usuario: ADMIN,
    datos: {
      "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
      "/colmenas/": [1, 2, 3, 4].map(colmena),
      "/inspecciones/": [insp(1, 1, "COMPLETA"), insp(2, 2, "COMPLETA"), insp(3, 3, "BUENO")],
    },
  });
  await montarApp();
  const panel = (await screen.findByRole("heading", { name: "Estado según última inspección" })).closest("section");
  const fila = (texto) => within(panel).getByText(texto).parentElement.textContent;
  expect(fila("Completa")).toContain("2 (50%)");
  expect(fila("Escala anterior")).toContain("1 (25%)");
  expect(fila("Sin inspección")).toContain("1 (25%)");
  expect(fila("Requiere revisión")).toContain("0 (0%)");
});

it("las inspecciones antiguas se muestran con su estado anterior", async () => {
  simularBackend({
    usuario: ADMIN,
    datos: {
      "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
      "/colmenas/": [colmena(1)],
      "/inspecciones/": [insp(1, 1, "REGULAR")],
    },
  });
  await montarApp();
  await irA("Inspecciones");
  expect((await screen.findAllByText("Regular (escala anterior)")).length).toBeGreaterThan(0);
});
