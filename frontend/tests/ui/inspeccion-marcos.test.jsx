import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";

let llamadas, fallarDestino;
const usuario = { id: 7, nombre: "Ana", email: "a@tp.cl", rol: "APICULTOR" };
const col = (id) => ({ id, apiario_id: 1, codigo: `COL-00${id}`, estado: "ACTIVA", cantidad_marcos: 0 });

beforeEach(() => {
  llamadas = []; fallarDestino = null;
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
  globalThis.fetch = vi.fn(async (url, o = {}) => {
    const ruta = new URL(url).pathname;
    const cuerpo = o.body ? JSON.parse(o.body) : null;
    llamadas.push({ ruta, metodo: o.method, cuerpo });
    const json = (c, s = 200) => new Response(JSON.stringify(c), { status: s });
    if (ruta === "/auth/me") return json(usuario);
    if (ruta === "/auth/csrf") return json({ csrf_token: "t" });
    if (ruta === "/apiarios/") return json([{ id: 1, nombre: "Mandinga" }]);
    if (ruta === "/colmenas/") return json([col(1), col(2), col(3)]);
    if (ruta === "/inspecciones/" && o.method === "POST") return json({ id: 50 }, 201);
    if (ruta === "/transferencias-marcos/" && o.method === "POST") {
      if (cuerpo.colmena_destino_id === fallarDestino) return json({ detail: "La colmena de destino no existe o está inactiva" }, 404);
      return json({ id: 1 }, 201);
    }
    return json([]);
  });
});
afterEach(cleanup);

async function abrirFormulario() {
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
  const nav = (await screen.findAllByRole("navigation"))[0];
  fireEvent.click(within(nav).getByText("Inspecciones"));
  fireEvent.click(await screen.findByRole("button", { name: "Registrar inspección" }));
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByLabelText(/^Apiario/), { target: { value: "1" } });
  fireEvent.change(within(d).getByLabelText(/^Colmena/), { target: { value: "1" } });
  fireEvent.click(within(d).getByRole("radio", { name: "Completa" }));
  return d;
}
const elegir = (d, etiqueta, valor) => fireEvent.change(within(d).getByLabelText(etiqueta), { target: { value: valor } });
const enviar = (d) => fireEvent.click(within(d).getAllByRole("button", { name: "Registrar inspección" }).at(-1));

it("registra 10 marcos, alza y transferencias, y las guarda después de la inspección", async () => {
  const d = await abrirFormulario();
  elegir(d, "Contenido del marco 1 de Cámara de cría", "SOLO_CRIA");
  elegir(d, "Contenido del marco 2 de Cámara de cría", "SIN_MARCO");
  enviar(d);
  await within(d).findByText(/Falta registrar los marcos 3, 4, 5, 6, 7, 8, 9, 10 de la cámara de cría/);
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);

  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "MIEL_Y_CRIA");
  expect(within(d).getByRole("button", { name: "Transferir el marco 2 de Cámara de cría" }).disabled).toBe(true);
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 1 de Cámara de cría" }));
  enviar(d);
  await within(d).findByText("Elige la colmena de destino del marco 1 de la cámara de cría.");
  const destino = within(d).getByLabelText("Colmena de destino del marco 1 de Cámara de cría");
  expect([...destino.options].map((o) => o.value)).toEqual(["", "2", "3"]);
  fireEvent.change(destino, { target: { value: "2" } });

  fireEvent.click(within(d).getAllByRole("radio", { name: "Sí" }).at(-1));
  enviar(d);
  await within(d).findByText(/Registra los 10 marcos del alza/);
  elegir(d, "Completar los marcos sin registrar de Alza", "SOLO_MIEL");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 4 de Alza" }));
  elegir(d, "Colmena de destino del marco 4 de Alza", "3");
  within(d).getByText(/19 marcos/);
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada con 2 transferencias.");
  const posts = llamadas.filter((l) => l.metodo === "POST");
  expect(posts.map((l) => l.ruta)).toEqual(["/inspecciones/", "/transferencias-marcos/", "/transferencias-marcos/"]);
  const insp = posts[0].cuerpo;
  expect(insp).toMatchObject({ colmena_id: 1, usuario_id: 7, estado_general: "COMPLETA", cantidad_marcos: 19, tiene_alza: true });
  expect(insp.marcos).toHaveLength(20);
  expect(insp.marcos[0]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 1, contenido: "SOLO_CRIA", transferido_a_colmena_id: 2 });
  expect(insp.marcos[1]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 2, contenido: "SIN_MARCO", transferido_a_colmena_id: null });
  expect(posts[1].cuerpo).toMatchObject({ colmena_origen_id: 1, colmena_destino_id: 2, usuario_id: 7, cantidad_marcos: 1, tipo_marco: "CRIA", inspeccion_id: 50, numero_marco: 1, observaciones: "Marco 1 de cámara de cría: solo cría." });
  expect(posts[2].cuerpo).toMatchObject({ colmena_destino_id: 3, tipo_marco: "MIEL", ubicacion: "ALZA", numero_marco: 4 });
});

it("sin detalle de marcos no pisa la cantidad de la colmena", async () => {
  const d = await abrirFormulario();
  enviar(d);
  await screen.findByText("Inspección de COL-001 registrada.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.cantidad_marcos).toBeNull();
  expect(insp.marcos).toEqual([]);
});

it("si una transferencia falla, la inspección no se duplica y se informa cuál falló", async () => {
  fallarDestino = 2;
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 5 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 5 de Cámara de cría", "2");
  enviar(d);
  await screen.findByText(/quedó guardada, pero no se pudo completar lo siguiente/);
  screen.getByText(/Transferencia: Marco 5 de cámara de cría: solo cría, hacia COL-002\. La colmena de destino no existe/);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(llamadas.filter((l) => l.ruta === "/inspecciones/" && l.metodo === "POST")).toHaveLength(1);
});

it("Transferencias es solo lectura", async () => {
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
  const nav = (await screen.findAllByRole("navigation"))[0];
  fireEvent.click(within(nav).getByText("Transferencias"));
  await screen.findByText(/Historial de marcos movidos/);
  expect(screen.queryByRole("button", { name: /Registrar transferencia/ })).toBeNull();
});

it("ofrece cera untada y la transfiere como marco vacío", async () => {
  const d = await abrirFormulario();
  const select = within(d).getByLabelText("Contenido del marco 1 de Cámara de cría");
  expect([...select.options].map((o) => o.textContent)).toContain("Cera untada");
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "CERA_UNTADA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 2 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 2 de Cámara de cría", "3");
  enviar(d);
  await screen.findByText(/registrada con 1 transferencia/);
  const t = llamadas.find((l) => l.ruta === "/transferencias-marcos/" && l.metodo === "POST").cuerpo;
  expect(t).toMatchObject({ tipo_marco: "VACIO", contenido: "CERA_UNTADA", observaciones: "Marco 2 de cámara de cría: cera untada." });
});
