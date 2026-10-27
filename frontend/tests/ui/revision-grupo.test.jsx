// PB-18: revisión de un grupo en terreno, colmena por colmena.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const F = "2026-10-27T10:00:00";
const grupo = { id: 1, apiario_id: 1, nombre: "Fila norte", descripcion: null, activo: true, cantidad_colmenas: 3, fecha_creacion: F, fecha_actualizacion: F };
const fila = (orden, colmena_id, codigo, estado = "PENDIENTE", extra = {}) => ({
  orden, colmena_id, codigo, estado, inspeccion_id: null, estado_general: null, motivo_omision: null, ...extra,
});

function sesion({ usuario_id = 1, estado = "EN_CURSO", colmenas, siguiente }) {
  const contar = (e) => colmenas.filter((c) => c.estado === e).length;
  return {
    id: 7, apiario_id: 1, grupo_id: 1, grupo_nombre: "Fila norte", usuario_id, estado, id_cliente: null,
    fecha_inicio: F, fecha_fin: estado === "FINALIZADA" ? F : null,
    progreso: { total: colmenas.length, revisadas: contar("REVISADA"), omitidas: contar("OMITIDA"), pendientes: contar("PENDIENTE") },
    siguiente_colmena_id: siguiente, resumen_estados: {}, colmenas,
  };
}

const colmenas = [
  { id: 1, apiario_id: 1, codigo: "MAN-001", estado: "ACTIVA" },
  { id: 2, apiario_id: 1, codigo: "MAN-002", estado: "ACTIVA" },
  { id: 3, apiario_id: 1, codigo: "MAN-003", estado: "ACTIVA" },
];
const inicial = sesion({ colmenas: [fila(1, 1, "MAN-001"), fila(2, 2, "MAN-002"), fila(3, 3, "MAN-003")], siguiente: 1 });
const base = { "/apiarios/": [{ id: 1, nombre: "Mandinga" }], "/colmenas/": colmenas, "/grupos/": [grupo] };

it("inicia la revisión del grupo e inspecciona la siguiente colmena dentro de la sesión", async () => {
  let actual = inicial;
  const llamadas = simularBackend({
    usuario: ADMIN,
    datos: base,
    respuestas: {
      "POST /revisiones/": (_, json) => json(actual, 201),
      "GET /revisiones/7": (_, json) => json(actual),
      "POST /inspecciones/": (_, json) => {
        actual = sesion({
          colmenas: [fila(1, 1, "MAN-001", "REVISADA", { estado_general: "COMPLETA", inspeccion_id: 50 }), fila(2, 2, "MAN-002"), fila(3, 3, "MAN-003")],
          siguiente: 2,
        });
        return json({ id: 50 }, 201);
      },
    },
  });
  await montarApp();
  await irA("Grupos");
  const tarjeta = await screen.findByRole("article", { name: "Grupo Fila norte" });
  fireEvent.click(within(tarjeta).getByRole("button", { name: "Iniciar revisión" }));

  const d = await screen.findByRole("dialog", { name: "Revisión de Fila norte" });
  const post = llamadas.find((l) => l.metodo === "POST" && l.ruta === "/revisiones/");
  expect(post.cuerpo.grupo_id).toBe(1);
  expect(post.cuerpo.id_cliente).toMatch(/^[0-9a-f-]{36}$/);
  within(d).getByText("0 de 3 colmenas");

  fireEvent.click(within(d).getByRole("button", { name: "Inspeccionar MAN-001" }));
  const f = await screen.findByRole("dialog", { name: "Registrar inspección" });
  within(f).getByText(/Colmena MAN-001 · Revisión de Fila norte, colmena 1 de 3/);
  // La colmena viene fija: no se elige apiario ni colmena.
  expect(within(f).queryByLabelText(/^Apiario/)).toBeNull();
  fireEvent.click(within(f).getByRole("radio", { name: "Completa" }));
  fireEvent.click(within(f).getAllByRole("button", { name: "Registrar inspección" }).at(-1));

  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST" && l.ruta === "/inspecciones/")).toBeTruthy());
  expect(llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo).toMatchObject({ colmena_id: 1, sesion_revision_id: 7 });
  const r = await screen.findByRole("dialog", { name: "Revisión de Fila norte" });
  await within(r).findByText("1 de 3 colmenas");
  within(r).getByRole("button", { name: "Inspeccionar MAN-002" });
});

it("omite una colmena con motivo y finaliza con pendientes", async () => {
  let actual = inicial;
  const llamadas = simularBackend({
    usuario: ADMIN,
    datos: { ...base, "/revisiones/": [inicial] },
    respuestas: {
      "GET /revisiones/7": (_, json) => json(actual),
      "POST /revisiones/7/omitir": (l, json) => {
        actual = sesion({ colmenas: [fila(1, 1, "MAN-001", "OMITIDA", { motivo_omision: l.cuerpo.motivo }), fila(2, 2, "MAN-002"), fila(3, 3, "MAN-003")], siguiente: 2 });
        return json(actual);
      },
      "POST /revisiones/7/finalizar": (_, json) => json({ ...actual, estado: "FINALIZADA" }),
    },
  });
  await montarApp();
  await irA("Grupos");
  const tarjeta = await screen.findByRole("article", { name: "Grupo Fila norte" });
  within(tarjeta).getByText(/Revisión en curso · 0 de 3/);
  fireEvent.click(within(tarjeta).getByRole("button", { name: "Continuar revisión" }));

  const d = await screen.findByRole("dialog", { name: "Revisión de Fila norte" });
  fireEvent.click(await within(d).findByRole("button", { name: "Omitir" }));
  const o = screen.getByRole("dialog", { name: "Omitir MAN-001" });
  fireEvent.change(within(o).getByLabelText(/Motivo/), { target: { value: "Colmena muy agresiva" } });
  fireEvent.click(within(o).getByRole("button", { name: "Omitir colmena" }));
  await waitFor(() => expect(llamadas.find((l) => l.ruta === "/revisiones/7/omitir")?.cuerpo).toEqual({ colmena_id: 1, motivo: "Colmena muy agresiva" }));
  await within(d).findByText("Colmena muy agresiva");

  fireEvent.click(within(d).getByRole("button", { name: "Finalizar revisión" }));
  const c = screen.getByRole("dialog", { name: "¿Finalizar la revisión de Fila norte?" });
  within(c).getByText(/Quedan 2 colmenas sin revisar/);
  fireEvent.click(within(c).getByRole("button", { name: "Finalizar revisión" }));
  await waitFor(() => expect(llamadas.some((l) => l.ruta === "/revisiones/7/finalizar")).toBe(true));
});

it("si otra persona inició la revisión, el apicultor solo la ve", async () => {
  const ajena = sesion({ usuario_id: 1, colmenas: inicial.colmenas, siguiente: 1 });
  simularBackend({
    usuario: APICULTOR,
    datos: { ...base, "/revisiones/": [ajena] },
    respuestas: { "GET /revisiones/7": (_, json) => json(ajena) },
  });
  await montarApp();
  await irA("Grupos");
  fireEvent.click(await screen.findByRole("button", { name: "Continuar revisión" }));
  const d = await screen.findByRole("dialog", { name: "Revisión de Fila norte" });
  await within(d).findByText(/Solo esa persona o un administrador puede continuarla/);
  expect(within(d).queryByRole("button", { name: /Inspeccionar/ })).toBeNull();
  expect(within(d).queryByRole("button", { name: "Finalizar revisión" })).toBeNull();
});

it("no se puede iniciar la revisión de un grupo sin colmenas", async () => {
  simularBackend({ usuario: ADMIN, datos: { ...base, "/grupos/": [{ ...grupo, cantidad_colmenas: 0 }] } });
  await montarApp();
  await irA("Grupos");
  const tarjeta = await screen.findByRole("article", { name: "Grupo Fila norte" });
  expect(within(tarjeta).getByRole("button", { name: "Iniciar revisión" }).disabled).toBe(true);
});
