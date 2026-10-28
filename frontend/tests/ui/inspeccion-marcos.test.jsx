import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";

let llamadas, rechazarInspeccion;
const usuario = { id: 7, nombre: "Ana", email: "a@tp.cl", rol: "APICULTOR" };
const col = (id) => ({ id, apiario_id: 1, codigo: `COL-00${id}`, estado: "ACTIVA", cantidad_marcos: 0 });

beforeEach(() => {
  llamadas = []; rechazarInspeccion = null;
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
    if (ruta === "/inspecciones/" && o.method === "POST") {
      if (rechazarInspeccion) return json({ detail: rechazarInspeccion }, 404);
      return json({ id: 50 }, 201);
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

it("registra 10 marcos, alza y transferencias en una sola petición", async () => {
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
  elegir(d, "Completar los marcos sin registrar de Alza", "MIEL_Y_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 4 de Alza" }));
  elegir(d, "Colmena de destino del marco 4 de Alza", "3");
  within(d).getByText(/19 marcos/);
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada con 2 transferencias.");
  // El backend crea las transferencias al guardar la inspección: el frontend no las envía aparte.
  const posts = llamadas.filter((l) => l.metodo === "POST");
  expect(posts.map((l) => l.ruta)).toEqual(["/inspecciones/"]);
  const insp = posts[0].cuerpo;
  expect(insp).toMatchObject({ colmena_id: 1, usuario_id: 7, estado_general: "COMPLETA", cantidad_marcos: 19, tiene_alza: true });
  expect(insp.marcos).toHaveLength(20);
  expect(insp.marcos[0]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 1, contenido: "SOLO_CRIA", transferido_a_colmena_id: 2 });
  expect(insp.marcos[1]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 2, contenido: "SIN_MARCO", transferido_a_colmena_id: null });
  expect(insp.marcos.find((m) => m.ubicacion === "ALZA" && m.numero === 4)).toEqual({
    ubicacion: "ALZA", numero: 4, contenido: "MIEL_Y_CRIA", transferido_a_colmena_id: 3,
  });
});

it("sin detalle de marcos no pisa la cantidad de la colmena", async () => {
  const d = await abrirFormulario();
  enviar(d);
  await screen.findByText("Inspección de COL-001 registrada.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.cantidad_marcos).toBeNull();
  expect(insp.marcos).toEqual([]);
});

it("si el backend rechaza la transferencia, no se guarda nada y el formulario sigue abierto", async () => {
  rechazarInspeccion = "La colmena de destino no existe o está inactiva";
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 5 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 5 de Cámara de cría", "2");
  enviar(d);
  await within(d).findByText("La colmena de destino no existe o está inactiva");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(llamadas.filter((l) => l.metodo === "POST").map((l) => l.ruta)).toEqual(["/inspecciones/"]);
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

it("solo los marcos con cría se pueden transferir", async () => {
  const d = await abrirFormulario();
  const select = within(d).getByLabelText("Contenido del marco 1 de Cámara de cría");
  expect([...select.options].map((o) => o.textContent)).toContain("Cera untada");
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "CERA_UNTADA");
  const boton = within(d).getByRole("button", { name: "Transferir el marco 2 de Cámara de cría" });
  expect(boton.disabled).toBe(true);
  expect(boton.title).toBe("Solo se transfieren marcos con cría");
  // Sin el retiro activado, no aparece el botón de bodega.
  expect(within(d).queryByRole("button", { name: /Retirar a bodega/ })).toBeNull();

  elegir(d, "Contenido del marco 2 de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 2 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 2 de Cámara de cría", "3");
  // Si se cambia a un contenido que no se transfiere, la transferencia se quita.
  elegir(d, "Contenido del marco 2 de Cámara de cría", "SOLO_MIEL");
  expect(within(d).queryByLabelText("Colmena de destino del marco 2 de Cámara de cría")).toBeNull();
  enviar(d);
  await screen.findByText("Inspección de COL-001 registrada.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.marcos[1]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 2, contenido: "SOLO_MIEL", transferido_a_colmena_id: null });
  expect(llamadas.some((l) => l.ruta === "/transferencias-marcos/" && l.metodo === "POST")).toBe(false);
});

describe("con el retiro a bodega activado", () => {
  beforeEach(() => vi.stubEnv("VITE_RETIRO_A_BODEGA", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("los marcos de cera o miel se retiran a bodega y los de cría no", async () => {
    const d = await abrirFormulario();
    elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
    expect(within(d).queryByRole("button", { name: "Retirar a bodega el marco 9 de Cámara de cría" })).toBeNull();
    elegir(d, "Contenido del marco 9 de Cámara de cría", "SOLO_MIEL");
    elegir(d, "Contenido del marco 10 de Cámara de cría", "CERA_ESTAMPADA");
    fireEvent.click(within(d).getByRole("button", { name: "Retirar a bodega el marco 9 de Cámara de cría" }));
    fireEvent.click(within(d).getByRole("button", { name: "Retirar a bodega el marco 10 de Cámara de cría" }));
    within(d).getByText("Se retira y entra al stock como «Solo miel».");
    within(d).getByText(/10 marcos, 2 a bodega/);
    fireEvent.click(within(d).getByRole("button", { name: "No retirar el marco 10 de Cámara de cría" }));
    within(d).getByText(/10 marcos, 1 a bodega/);
    enviar(d);

    await screen.findByText("Inspección de COL-001 registrada.");
    const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
    expect(insp.marcos[0]).toMatchObject({ contenido: "SOLO_CRIA", retirar_a_bodega: false });
    expect(insp.marcos[8]).toEqual({
      ubicacion: "CAMARA_CRIA", numero: 9, contenido: "SOLO_MIEL", transferido_a_colmena_id: null, retirar_a_bodega: true,
    });
    expect(insp.marcos[9]).toMatchObject({ contenido: "CERA_ESTAMPADA", retirar_a_bodega: false });
  });
});
