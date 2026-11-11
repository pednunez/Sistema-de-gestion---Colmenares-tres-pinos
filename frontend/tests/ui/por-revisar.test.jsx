// S4-T04: listado de colmenas que requieren revisión.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const hace = (dias) => new Date(Date.now() - dias * 86_400_000).toISOString();
const col = (id, apiario_id, extra = {}) => ({ id, apiario_id, codigo: `COL-00${id}`, estado: "ACTIVA", ...extra });

const COLMENAS = [col(1, 1), col(2, 1), col(3, 1), col(4, 2), col(5, 1, { estado: "INACTIVA" })];
const datos = {
  "/apiarios/": [
    { id: 1, nombre: "Mandinga" },
    { id: 2, nombre: "Culibrán" },
  ],
  "/colmenas/": COLMENAS,
  "/inspecciones/": [
    // COL-001: inspección reciente que quedó en «Requiere revisión».
    { id: 11, colmena_id: 1, fecha_inspeccion: hace(3), estado_general: "REQUIERE_REVISION" },
    // COL-002: al día y en buen estado.
    { id: 12, colmena_id: 2, fecha_inspeccion: hace(5), estado_general: "COMPLETA" },
    // COL-003: última inspección hace 45 días.
    { id: 13, colmena_id: 3, fecha_inspeccion: hace(45), estado_general: "DEBIL" },
    // COL-005 está inactiva: no se lista aunque haya quedado en «Requiere revisión».
    { id: 15, colmena_id: 5, fecha_inspeccion: hace(2), estado_general: "REQUIERE_REVISION" },
  ],
};

// Lo que responde el backend según el período y el apiario pedidos.
const sinRevision = (llamada, json) => {
  const dias = Number(llamada.params.dias);
  const filas = [
    { ...COLMENAS[3], ultima_inspeccion: null, dias_sin_revision: null },
    ...(dias <= 30 ? [{ ...COLMENAS[2], ultima_inspeccion: hace(45), dias_sin_revision: 45 }] : []),
  ];
  const apiario = llamada.params.apiario_id;
  return json(apiario ? filas.filter((f) => String(f.apiario_id) === apiario) : filas);
};

async function abrir(usuario = ADMIN, respuestas = { "GET /colmenas/sin-revision": sinRevision }) {
  const llamadas = simularBackend({ usuario, datos, respuestas });
  await montarApp();
  await irA("Por revisar");
  const tabla = await screen.findByRole("table", { name: "Colmenas que requieren revisión" });
  return { llamadas, tabla };
}

const codigos = (tabla) =>
  within(tabla)
    .getAllByRole("row")
    .slice(1)
    .map((fila) => within(fila).getAllByRole("cell")[0].textContent);

it("junta las colmenas sin inspección en el período y las que quedaron en «Requiere revisión»", async () => {
  const { llamadas, tabla } = await abrir();
  expect(llamadas.find((l) => l.ruta === "/colmenas/sin-revision").params).toEqual({ dias: "30" });

  // Primero «Requiere revisión», después la nunca inspeccionada y luego la de más días.
  expect(codigos(tabla)).toEqual(["COL-001", "COL-004", "COL-003"]);
  const [, primera, segunda, tercera] = within(tabla).getAllByRole("row");
  within(primera).getByText("Quedó en «Requiere revisión»");
  within(segunda).getByText("Nunca inspeccionada");
  within(segunda).getByText("Sin inspecciones");
  within(tercera).getByText("45 días sin inspección");
  within(tercera).getByText("Débil");
  screen.getByText("3 colmenas");
});

it("filtra por apiario y por período, y lo pide al backend", async () => {
  const { llamadas } = await abrir();
  fireEvent.click(screen.getByRole("radio", { name: "Mandinga" }));
  await screen.findByText("2 colmenas");
  expect(codigos(screen.getByRole("table"))).toEqual(["COL-001", "COL-003"]);
  expect(llamadas.filter((l) => l.ruta === "/colmenas/sin-revision").at(-1).params).toEqual({ dias: "30", apiario_id: "1" });

  fireEvent.change(screen.getByLabelText("Sin inspección en los últimos"), { target: { value: "60" } });
  await screen.findByText("1 colmena");
  expect(codigos(screen.getByRole("table"))).toEqual(["COL-001"]);
  expect(llamadas.filter((l) => l.ruta === "/colmenas/sin-revision").at(-1).params).toEqual({ dias: "60", apiario_id: "1" });
});

it("desde la fila se abre la colmena o se registra su inspección", async () => {
  const { tabla } = await abrir(APICULTOR);
  fireEvent.click(within(tabla).getByRole("button", { name: "Registrar inspección de COL-004" }));
  const formulario = await screen.findByRole("dialog");
  expect(within(formulario).getByLabelText(/^Colmena/).value).toBe("4");

  fireEvent.click(within(formulario).getAllByRole("button", { name: /Cerrar|Cancelar/ })[0]);
  await irA("Por revisar");
  fireEvent.click(within(await screen.findByRole("table")).getByRole("button", { name: "COL-003" }));
  await screen.findByRole("dialog", { name: "Colmena COL-003" });
});

it("si el backend falla, avisa y muestra las que quedaron en «Requiere revisión»", async () => {
  await abrir(ADMIN, { "GET /colmenas/sin-revision": (_, json) => json({ detail: "Error interno" }, 500) });
  await screen.findByText(/No se pudo consultar las colmenas sin inspección/);
  expect(codigos(screen.getByRole("table"))).toEqual(["COL-001"]);
  screen.getByRole("button", { name: "Reintentar" });
});
