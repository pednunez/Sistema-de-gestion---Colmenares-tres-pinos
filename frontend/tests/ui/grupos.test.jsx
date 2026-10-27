// PB-06: grupos de colmenas por apiario.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const F = "2026-10-27T10:00:00";
const grupo = (id, apiario_id, nombre, cantidad, extra = {}) => ({
  id, apiario_id, nombre, descripcion: null, activo: true, cantidad_colmenas: cantidad,
  fecha_creacion: F, fecha_actualizacion: F, fecha_eliminacion: null, ...extra,
});
const item = (colmena_id, codigo) => ({ colmena_id, codigo, estado: "ACTIVA", fecha_asignacion: F });

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }, { id: 2, nombre: "Popeta" }],
  "/colmenas/": [
    { id: 1, apiario_id: 1, codigo: "MAN-001", estado: "ACTIVA" },
    { id: 2, apiario_id: 1, codigo: "MAN-002", estado: "ACTIVA" },
    { id: 3, apiario_id: 1, codigo: "MAN-003", estado: "ACTIVA" },
    { id: 4, apiario_id: 1, codigo: "MAN-004", estado: "INACTIVA" },
    { id: 5, apiario_id: 2, codigo: "POP-001", estado: "ACTIVA" },
  ],
  "/grupos/": [grupo(1, 1, "Fila norte", 1, { descripcion: "Junto al estero" }), grupo(2, 1, "Fila sur", 1), grupo(3, 2, "Grupo 1", 0)],
  "/grupos/1": { ...grupo(1, 1, "Fila norte", 1), colmenas: [item(1, "MAN-001")] },
  "/grupos/2": { ...grupo(2, 1, "Fila sur", 1), colmenas: [item(2, "MAN-002")] },
};

it("lista los grupos y filtra por apiario", async () => {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Grupos");
  await screen.findByRole("article", { name: "Grupo Fila norte" });
  screen.getByRole("article", { name: "Grupo Grupo 1" });
  fireEvent.click(screen.getByRole("radio", { name: "Popeta" }));
  expect(screen.queryByRole("article", { name: "Grupo Fila norte" })).toBeNull();
  screen.getByRole("article", { name: "Grupo Grupo 1" });
});

it("crea un grupo validando el nombre repetido en el mismo apiario", async () => {
  const llamadas = simularBackend({
    usuario: ADMIN,
    datos,
    respuestas: { "POST /grupos/": (l, json) => json({ ...grupo(9, 1, l.cuerpo.nombre, 0), colmenas: [] }, 201) },
  });
  await montarApp();
  await irA("Grupos");
  fireEvent.click(await screen.findByRole("button", { name: "Nuevo grupo" }));
  const d = screen.getByRole("dialog", { name: "Nuevo grupo" });
  fireEvent.change(within(d).getByLabelText(/^Apiario/), { target: { value: "1" } });
  fireEvent.change(within(d).getByLabelText(/^Nombre/), { target: { value: "fila NORTE" } });
  fireEvent.click(within(d).getByRole("button", { name: "Crear grupo" }));
  await within(d).findByText("Ya existe un grupo con ese nombre en este apiario.");
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);

  fireEvent.change(within(d).getByLabelText(/^Nombre/), { target: { value: "  Fila   centro " } });
  fireEvent.click(within(d).getByRole("button", { name: "Crear grupo" }));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST")?.cuerpo).toEqual({ apiario_id: 1, nombre: "Fila centro", descripcion: null }));
  await screen.findByText(/Grupo Fila centro creado/);
});

it("agrega colmenas del mismo apiario y avisa las que se mueven de otro grupo", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Grupos");
  fireEvent.click(await screen.findByRole("heading", { name: "Fila norte" }));
  const d = await screen.findByRole("dialog", { name: "Fila norte" });
  await within(d).findByText("MAN-001");
  fireEvent.click(within(d).getByRole("button", { name: "Agregar colmenas" }));

  const a = await screen.findByRole("dialog", { name: "Agregar colmenas a Fila norte" });
  // Solo activas de Mandinga que no están en el grupo: MAN-002 (en Fila sur) y MAN-003.
  expect(within(a).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"))).toEqual(["Agregar MAN-002", "Agregar MAN-003"]);
  within(a).getByText("En Fila sur");
  fireEvent.click(within(a).getByRole("checkbox", { name: "Agregar MAN-002" }));
  within(a).getByText(/1 colmena elegida está en otro grupo y se moverá a Fila norte/);
  fireEvent.click(within(a).getByRole("button", { name: "Elegir la que no tiene grupo" }));
  fireEvent.click(within(a).getByRole("button", { name: "Agregar 2 colmenas" }));

  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST")).toBeTruthy());
  expect(llamadas.find((l) => l.metodo === "POST")).toMatchObject({ ruta: "/grupos/1/colmenas", cuerpo: { colmena_ids: [2, 3] } });
  await screen.findByText("2 colmenas agregadas a Fila norte.");
});

it("quita una colmena del grupo", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Grupos");
  fireEvent.click(await screen.findByRole("heading", { name: "Fila norte" }));
  const d = await screen.findByRole("dialog", { name: "Fila norte" });
  fireEvent.click(await within(d).findByRole("button", { name: "Quitar MAN-001 del grupo" }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === "DELETE" && l.ruta === "/grupos/1/colmenas/1")).toBe(true));
});

it("elimina un grupo con confirmación", async () => {
  const llamadas = simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Grupos");
  const tarjeta = await screen.findByRole("article", { name: "Grupo Fila sur" });
  fireEvent.click(within(tarjeta).getByRole("button", { name: "Eliminar" }));
  const c = screen.getByRole("dialog", { name: "¿Eliminar el grupo Fila sur?" });
  within(c).getByText(/quedarán sin grupo/);
  fireEvent.click(within(c).getByRole("button", { name: "Eliminar grupo" }));
  await waitFor(() => expect(llamadas.some((l) => l.metodo === "DELETE" && l.ruta === "/grupos/2")).toBe(true));
});

it("el apicultor ve los grupos y sus colmenas, sin editar", async () => {
  simularBackend({ usuario: APICULTOR, datos });
  await montarApp();
  await irA("Grupos");
  await screen.findByRole("article", { name: "Grupo Fila norte" });
  expect(screen.queryByRole("button", { name: "Nuevo grupo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Ver colmenas" })[0]);
  const d = await screen.findByRole("dialog");
  await within(d).findByText("MAN-001");
  expect(within(d).queryByRole("button", { name: "Agregar colmenas" })).toBeNull();
  expect(within(d).queryByRole("button", { name: /Quitar/ })).toBeNull();
});
