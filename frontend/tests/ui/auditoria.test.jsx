// S4-T13: auditoría para el administrador con filtros por módulo, acción, usuario y fechas.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, irA, montarApp, simularBackend } from "./apoyo";
import { filtrarAuditoria } from "../../src/utils/auditoria";

afterEach(cleanup);

// Fechas a mediodía en hora local para que el día no dependa de la zona horaria.
const dia = (aaaammdd) => new Date(`${aaaammdd}T12:00:00`).toISOString();
const REGISTROS = [
  { id: 1, fecha: dia("2026-11-02"), usuario_id: 1, accion: "CREAR", entidad: "COLMENA", entidad_id: 5, datos_nuevos: { codigo: "COL-005" } },
  { id: 2, fecha: dia("2026-11-05"), usuario_id: 7, accion: "MODIFICAR", entidad: "INSPECCION", entidad_id: 9, datos_nuevos: { colmena_id: 5 } },
  { id: 3, fecha: dia("2026-11-10"), usuario_id: 1, accion: "ELIMINAR", entidad: "COLMENA", entidad_id: 6, datos_anteriores: { codigo: "COL-006" } },
];
const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": [{ id: 5, apiario_id: 1, codigo: "COL-005", estado: "ACTIVA" }],
  "/usuarios/": [
    { id: 1, nombres: "Carlos", apellidos: "Núñez", rol: "ADMIN" },
    { id: 7, nombres: "Ana", apellidos: "Pérez", rol: "APICULTOR" },
  ],
  "/auditoria/": REGISTROS,
};

it("filtra por fechas incluyendo el día completo y ordena del más reciente al más antiguo", () => {
  const vacio = { entidad: "", accion: "", usuario: "", desde: "", hasta: "" };
  expect(filtrarAuditoria(REGISTROS, vacio).map((r) => r.id)).toEqual([3, 2, 1]);
  expect(filtrarAuditoria(REGISTROS, { ...vacio, desde: "2026-11-05", hasta: "2026-11-10" }).map((r) => r.id)).toEqual([3, 2]);
  expect(filtrarAuditoria(REGISTROS, { ...vacio, hasta: "2026-11-05" }).map((r) => r.id)).toEqual([2, 1]);
  expect(filtrarAuditoria(REGISTROS, { ...vacio, entidad: "COLMENA", usuario: "1" }).map((r) => r.id)).toEqual([3, 1]);
});

const filas = () => screen.getAllByRole("row").slice(1);

it("el administrador combina filtros, ve cuántos coinciden y los limpia", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Auditoría");
  await screen.findByText(/3 registros: quién hizo qué cambio y cuándo/);
  expect(within(filas()[0]).getByText("COL-006")).toBeTruthy();
  // El detalle de cada registro sigue abriéndose.
  fireEvent.click(within(filas()[0]).getByRole("button", { name: "Ver detalle" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getAllByRole("button", { name: /Cerrar/ })[0]);

  fireEvent.change(screen.getByLabelText("Filtrar por módulo"), { target: { value: "COLMENA" } });
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-03" } });
  await screen.findByText(/1 de 3 registros coinciden con los filtros/);
  expect(filas()).toHaveLength(1);
  within(filas()[0]).getByText("Baja");

  // Un rango imposible avisa y no muestra registros.
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-01" } });
  await screen.findByText("Debe ser anterior a «Hasta».");
  screen.getByText("No hay registros con estos filtros");

  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  await screen.findByText(/3 registros: quién hizo qué cambio y cuándo/);
  expect(screen.getByLabelText("Desde").value).toBe("");
  expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
});
