// S4-T06: cada alerta del dashboard abre la colmena y el registro que la originó.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, montarApp, simularBackend } from "./apoyo";
import { calcularAlertas } from "../../src/utils/alertas";

afterEach(cleanup);

const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
const col = (id, extra = {}) => ({ id, apiario_id: 1, codigo: `COL-00${id}`, estado: "ACTIVA", ...extra });

const COLMENAS = [col(1), col(2), col(3, { estado: "EN_OBSERVACION" })];
const INSPECCIONES = [
  { id: 21, colmena_id: 1, fecha_inspeccion: hace(1), estado_general: "REQUIERE_REVISION", signos_enfermedad: true, enfermedad_observada: "Varroa" },
  // La inspección anterior de COL-001 no origina la alerta: manda la última.
  { id: 20, colmena_id: 1, fecha_inspeccion: hace(20), estado_general: "COMPLETA" },
  { id: 31, colmena_id: 3, fecha_inspeccion: hace(2), estado_general: "COMPLETA" },
];
const datos = { "/apiarios/": [{ id: 1, nombre: "Mandinga" }], "/colmenas/": COLMENAS, "/inspecciones/": INSPECCIONES };

it("cada motivo indica de qué registro viene", () => {
  const alertas = calcularAlertas(COLMENAS, INSPECCIONES);
  const de = (id) => alertas.find((a) => a.colmena.id === id);
  expect(de(1).ultima.id).toBe(21);
  expect(de(1).detalles).toEqual([
    { texto: "Última inspección: requiere revisión", prioridad: "alta", origen: "INSPECCION" },
    { texto: "Signos de enfermedad: Varroa", prioridad: "alta", origen: "INSPECCION" },
  ]);
  expect(de(2)).toMatchObject({ prioridad: "media", ultima: null, motivos: ["Sin inspecciones registradas"] });
  expect(de(2).detalles[0].origen).toBe("SIN_INSPECCION");
  expect(de(3).detalles).toEqual([{ texto: "Marcada en observación", prioridad: "media", origen: "COLMENA" }]);
});

async function abrirDashboard() {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  return screen.findByText("Colmenas que requieren atención");
}

it("desde la alerta se abre la inspección que la originó", async () => {
  await abrirDashboard();
  screen.getByText("Signos de enfermedad: Varroa");
  expect(screen.getAllByText(/· inspección del/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Ver la inspección que originó la alerta de COL-001" }));
  const detalle = await screen.findByRole("dialog", { name: "Inspección de COL-001" });
  within(detalle).getByText("Varroa");

  // Una alerta por el estado de la colmena no tiene inspección que abrir.
  expect(screen.queryByRole("button", { name: "Ver la inspección que originó la alerta de COL-003" })).toBeNull();
  screen.getByText("· estado de la colmena");
});

it("desde la alerta se abre la colmena o, si nunca se inspeccionó, su primera inspección", async () => {
  await abrirDashboard();
  fireEvent.click(screen.getByRole("button", { name: "Registrar inspección de COL-002" }));
  const formulario = await screen.findByRole("dialog");
  expect(within(formulario).getByLabelText(/^Colmena/).value).toBe("2");
});

it("«Ver colmena» abre la ficha de la colmena", async () => {
  await abrirDashboard();
  fireEvent.click(screen.getByRole("button", { name: "Ver colmena COL-003" }));
  await screen.findByRole("dialog", { name: "Colmena COL-003" });
});

it("con más de 10 alertas, «Ver todas en Colmenas» abre Colmenas filtrada por las que requieren atención", async () => {
  const muchas = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, apiario_id: 1, codigo: `COL-${100 + i}`, estado: "ACTIVA" }));
  simularBackend({ usuario: ADMIN, datos: { ...datos, "/colmenas/": muchas, "/inspecciones/": [] } });
  await montarApp();
  await screen.findByText("Y 2 colmenas más.");
  fireEvent.click(screen.getByRole("button", { name: "Ver todas en Colmenas" }));
  expect((await screen.findByLabelText("Solo las que requieren atención")).checked).toBe(true);
  await screen.findByText("12 de 12 colmenas coinciden con los filtros.");
});
