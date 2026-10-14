import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";

let llamadas, inspecciones;
const usuario = { id: 7, nombre: "Ana", email: "a@tp.cl", rol: "APICULTOR" };

beforeEach(() => {
  llamadas = [];
  inspecciones = [];
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
  globalThis.fetch = vi.fn(async (url, o = {}) => {
    const ruta = new URL(url).pathname;
    llamadas.push({ ruta, metodo: o.method, cuerpo: o.body ? JSON.parse(o.body) : null });
    const json = (c, s = 200) => new Response(JSON.stringify(c), { status: s });
    if (ruta === "/auth/me") return json(usuario);
    if (ruta === "/auth/csrf") return json({ csrf_token: "t" });
    if (ruta === "/apiarios/") return json([{ id: 1, nombre: "Mandinga" }]);
    if (ruta === "/colmenas/") return json([{ id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" }]);
    if (ruta === "/inspecciones/" && o.method === "GET") return json(inspecciones);
    if (o.method === "POST" || o.method === "PATCH") return json({ id: 5 }, 201);
    return json([]);
  });
});
afterEach(cleanup);

async function abrir() {
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
  const nav = (await screen.findAllByRole("navigation"))[0];
  fireEvent.click(within(nav).getByText("Inspecciones"));
}

it("registra postura, miel y alimentación", async () => {
  await abrir();
  fireEvent.click(await screen.findByRole("button", { name: "Registrar inspección" }));
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByLabelText(/^Colmena/), { target: { value: "1" } });
  fireEvent.click(within(d).getByRole("radio", { name: "Bueno" }));
  const postura = within(d).getByRole("radiogroup", { name: "¿Hay postura?" });
  fireEvent.click(within(postura).getByRole("radio", { name: "Sí" }));
  const miel = within(d).getByRole("radiogroup", { name: "Miel" });
  fireEvent.click(within(miel).getByRole("radio", { name: "Abundante" }));
  fireEvent.change(within(d).getByLabelText("Alimentación suministrada"), { target: { value: "  jarabe 1:1, 2 litros " } });
  fireEvent.click(within(d).getAllByRole("button", { name: "Registrar inspección" }).at(-1));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST")).toBeTruthy());
  expect(llamadas.find((l) => l.metodo === "POST").cuerpo).toMatchObject({
    postura: true, miel: "ABUNDANTE", alimentacion_suministrada: "jarabe 1:1, 2 litros" });
});

it("sin completar los campos nuevos envía null", async () => {
  await abrir();
  fireEvent.click(await screen.findByRole("button", { name: "Registrar inspección" }));
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByLabelText(/^Colmena/), { target: { value: "1" } });
  fireEvent.click(within(d).getByRole("radio", { name: "Regular" }));
  fireEvent.click(within(d).getAllByRole("button", { name: "Registrar inspección" }).at(-1));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST")).toBeTruthy());
  expect(llamadas.find((l) => l.metodo === "POST").cuerpo).toMatchObject({ postura: null, miel: null, alimentacion_suministrada: null });
});

it("muestra y edita los campos, conservando un valor de miel antiguo", async () => {
  inspecciones = [{ id: 3, colmena_id: 1, usuario_id: 7, estado_general: "BUENO", postura: false, miel: "2 marcos operculados",
    alimentacion_suministrada: "Fondant 1 kg", signos_enfermedad: false, fecha_inspeccion: new Date().toISOString(), activo: true }];
  await abrir();
  await screen.findByText(/Fondant 1 kg/);
  screen.getByText("2 marcos operculados");
  fireEvent.click(screen.getByRole("button", { name: "Editar" }));
  const d = screen.getByRole("dialog");
  const miel = within(d).getByRole("radiogroup", { name: "Miel" });
  expect(within(miel).getByRole("radio", { name: "2 marcos operculados" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(within(miel).getByRole("radio", { name: "Poca" }));
  fireEvent.click(within(d).getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "PATCH")).toBeTruthy());
  const patch = llamadas.find((l) => l.metodo === "PATCH");
  expect(patch.ruta).toBe("/inspecciones/3");
  expect(patch.cuerpo).toMatchObject({ postura: false, miel: "POCA", alimentacion_suministrada: "Fondant 1 kg" });
  expect(patch.cuerpo.colmena_id).toBeUndefined();
});

it("pide las tiras de medicamento solo con signos de enfermedad", async () => {
  await abrir();
  fireEvent.click(await screen.findByRole("button", { name: "Registrar inspección" }));
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByLabelText(/^Colmena/), { target: { value: "1" } });
  fireEvent.click(within(d).getByRole("radio", { name: "Crítico" }));
  expect(within(d).queryByRole("radiogroup", { name: "Tiras de medicamento aplicadas" })).toBeNull();
  const signos = within(d).getByRole("radiogroup", { name: "¿Hay signos de enfermedad?" });
  fireEvent.click(within(signos).getByRole("radio", { name: "Sí" }));
  fireEvent.change(within(d).getByLabelText(/Qué se observó/), { target: { value: "Varroa" } });
  const tiras = within(d).getByRole("radiogroup", { name: "Tiras de medicamento aplicadas" });
  fireEvent.click(within(tiras).getByRole("radio", { name: "2" }));
  fireEvent.click(within(d).getAllByRole("button", { name: "Registrar inspección" }).at(-1));
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "POST")).toBeTruthy());
  expect(llamadas.find((l) => l.metodo === "POST").cuerpo).toMatchObject({ signos_enfermedad: true, enfermedad_observada: "Varroa", tiras_medicamento: 2 });
});
