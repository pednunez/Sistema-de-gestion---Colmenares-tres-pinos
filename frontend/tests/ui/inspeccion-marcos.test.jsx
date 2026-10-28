import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";

let llamadas, rechazarInspeccion, marcosActuales;
const usuario = { id: 7, nombre: "Ana", email: "a@tp.cl", rol: "APICULTOR" };
const col = (id, apiario_id = 1) => ({ id, apiario_id, codigo: `COL-00${id}`, estado: "ACTIVA", cantidad_marcos: 0 });

beforeEach(() => {
  llamadas = []; rechazarInspeccion = null; marcosActuales = {};
  window.scrollTo = () => {};
  window.history.replaceState(null, "", "/");
  globalThis.fetch = vi.fn(async (url, o = {}) => {
    const ruta = new URL(url).pathname;
    const cuerpo = o.body ? JSON.parse(o.body) : null;
    llamadas.push({ ruta, metodo: o.method, cuerpo });
    const json = (c, s = 200) => new Response(JSON.stringify(c), { status: s });
    if (ruta === "/auth/me") return json(usuario);
    if (ruta === "/auth/csrf") return json({ csrf_token: "t" });
    if (ruta === "/apiarios/") return json([{ id: 1, nombre: "Mandinga" }, { id: 2, nombre: "Culibrán" }]);
    if (ruta === "/colmenas/") return json([col(1), col(2), col(3), col(4, 2)]);
    const conMarcos = ruta.match(/^\/colmenas\/(\d+)\/marcos$/);
    if (conMarcos) {
      const actuales = marcosActuales[conMarcos[1]];
      return actuales ? json(actuales) : json({ detail: "Not Found" }, 404);
    }
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
  await within(d).findByText("Elige el destino del marco 1 de la cámara de cría.");
  const destino = within(d).getByLabelText("Colmena de destino del marco 1 de Cámara de cría");
  // Solo colmenas del apiario elegido (COL-004 es de otro apiario).
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
  expect(insp.marcos[0]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 1, contenido: "SOLO_CRIA", transferido_a_colmena_id: 2, retirar_a_bodega: false, ubicacion_destino: "CAMARA_CRIA", marco_desplazado_numero: null });
  expect(insp.marcos[1]).toEqual({ ubicacion: "CAMARA_CRIA", numero: 2, contenido: "SIN_MARCO", transferido_a_colmena_id: null, retirar_a_bodega: false });
  expect(insp.marcos.find((m) => m.ubicacion === "ALZA" && m.numero === 4)).toEqual({
    ubicacion: "ALZA", numero: 4, contenido: "MIEL_Y_CRIA", transferido_a_colmena_id: 3, retirar_a_bodega: false,
    ubicacion_destino: "CAMARA_CRIA", marco_desplazado_numero: null,
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

it("cualquier marco va a otra colmena y los de cera o miel también pueden ir a bodega", async () => {
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "CERA_UNTADA");
  // Una posición sin marco no se transfiere.
  elegir(d, "Contenido del marco 3 de Cámara de cría", "SIN_MARCO");
  const vacio = within(d).getByRole("button", { name: "Transferir el marco 3 de Cámara de cría" });
  expect(vacio.disabled).toBe(true);
  expect(vacio.title).toBe("No hay marco en esta posición");

  // Un marco de miel se puede transferir a una colmena débil…
  elegir(d, "Contenido del marco 2 de Cámara de cría", "SOLO_MIEL");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 2 de Cámara de cría" }));
  const grupo = within(d).getByRole("radiogroup", { name: "Destino del marco 2 de Cámara de cría" });
  expect(within(grupo).getByRole("radio", { name: "Colmena" }).getAttribute("aria-checked")).toBe("true");
  elegir(d, "Colmena de destino del marco 2 de Cámara de cría", "3");
  // …o a bodega: se elige una sola de las dos opciones.
  fireEvent.click(within(grupo).getByRole("radio", { name: "Bodega" }));
  expect(within(grupo).getByRole("radio", { name: "Bodega" }).getAttribute("aria-checked")).toBe("true");
  expect(within(grupo).getByRole("radio", { name: "Colmena" }).getAttribute("aria-checked")).toBe("false");
  expect(within(d).queryByLabelText("Colmena de destino del marco 2 de Cámara de cría")).toBeNull();
  within(d).getByText(/Entra al stock como «Solo miel»\. El servidor todavía no lo suma/);
  within(d).getByText(/9 marcos, 1 a bodega/);

  // Los marcos con cría solo van a colmenas: no ofrecen bodega.
  elegir(d, "Contenido del marco 4 de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 4 de Cámara de cría" }));
  expect(within(d).queryByRole("radiogroup", { name: "Destino del marco 4 de Cámara de cría" })).toBeNull();
  elegir(d, "Colmena de destino del marco 4 de Cámara de cría", "3");
  within(d).getByText(/9 marcos, 1 para transferir, 1 a bodega/);

  // Si un marco que iba a bodega pasa a tener cría, hay que elegir otra vez el destino.
  elegir(d, "Contenido del marco 2 de Cámara de cría", "MIEL_Y_CRIA");
  expect(within(d).queryByRole("radiogroup", { name: "Destino del marco 2 de Cámara de cría" })).toBeNull();
  expect(within(d).getByLabelText("Colmena de destino del marco 2 de Cámara de cría").value).toBe("");
  enviar(d);
  await within(d).findByText("Elige el destino del marco 2 de la cámara de cría.");
  elegir(d, "Colmena de destino del marco 2 de Cámara de cría", "3");
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada con 2 transferencias.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.marcos[1]).toEqual({
    ubicacion: "CAMARA_CRIA", numero: 2, contenido: "MIEL_Y_CRIA", transferido_a_colmena_id: 3, retirar_a_bodega: false,
    ubicacion_destino: "CAMARA_CRIA", marco_desplazado_numero: null,
  });
  expect(insp.marcos[3]).toMatchObject({ contenido: "SOLO_CRIA", transferido_a_colmena_id: 3, retirar_a_bodega: false });
});

it("los marcos de cera o miel enviados a bodega viajan en la inspección", async () => {
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  elegir(d, "Contenido del marco 9 de Cámara de cría", "SOLO_MIEL");
  elegir(d, "Contenido del marco 10 de Cámara de cría", "CERA_ESTAMPADA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 9 de Cámara de cría" }));
  fireEvent.click(within(d).getByRole("radiogroup", { name: "Destino del marco 9 de Cámara de cría" }).querySelector("[aria-checked=false]"));
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 10 de Cámara de cría" }));
  fireEvent.click(within(d).getByRole("radiogroup", { name: "Destino del marco 10 de Cámara de cría" }).querySelector("[aria-checked=false]"));
  within(d).getByText(/10 marcos, 2 a bodega/);
  fireEvent.click(within(d).getByRole("button", { name: "No transferir el marco 10 de Cámara de cría" }));
  within(d).getByText(/10 marcos, 1 a bodega/);
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.marcos[0]).toMatchObject({ contenido: "SOLO_CRIA", retirar_a_bodega: false });
  expect(insp.marcos[8]).toEqual({
    ubicacion: "CAMARA_CRIA", numero: 9, contenido: "SOLO_MIEL", transferido_a_colmena_id: null, retirar_a_bodega: true,
  });
  expect(insp.marcos[9]).toMatchObject({ contenido: "CERA_ESTAMPADA", retirar_a_bodega: false });
  expect(llamadas.some((l) => l.ruta === "/transferencias-marcos/" && l.metodo === "POST")).toBe(false);
});

describe("con el retiro a bodega activo en el servidor", () => {
  beforeEach(() => vi.stubEnv("VITE_RETIRO_A_BODEGA", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("no muestra el aviso de registrar también en Stock", async () => {
    const d = await abrirFormulario();
    elegir(d, "Contenido del marco 1 de Cámara de cría", "SOLO_MIEL");
    fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 1 de Cámara de cría" }));
    fireEvent.click(within(d).getByRole("radiogroup", { name: "Destino del marco 1 de Cámara de cría" }).querySelector("[aria-checked=false]"));
    within(d).getByText("Entra al stock como «Solo miel».");
    expect(within(d).queryByText(/El servidor todavía no lo suma/)).toBeNull();
  });
});

// Límite de 10 marcos por piso en la colmena que recibe.
const piso = (contenidos) => contenidos.map((contenido, i) => ({ numero: i + 1, contenido }));
const LLENA = piso(["SOLO_CRIA", "SOLO_CRIA", "SOLO_CRIA", "SOLO_CRIA", "MIEL_Y_CRIA", "SOLO_MIEL", "SOLO_MIEL", "CERA_ESTIRADA", "CERA_UNTADA", "SOLO_MIEL"]);

it("sin datos del servidor, la transferencia es simple y lo avisa", async () => {
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 1 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 1 de Cámara de cría", "2");
  await within(d).findByText("No se pudo revisar cuántos marcos tiene COL-002: el servidor todavía no lo informa.");
  enviar(d);
  await screen.findByText("Inspección de COL-001 registrada con 1 transferencia.");
});

it("con espacio en el destino, muestra cuántos marcos tiene", async () => {
  marcosActuales = { 2: { colmena_id: 2, camara_cria: piso(["SOLO_CRIA", "SOLO_CRIA", "SIN_MARCO", "SIN_MARCO", "SOLO_MIEL", "SIN_MARCO", "SIN_MARCO", "SIN_MARCO", "SIN_MARCO", "SIN_MARCO"]), alza: null } };
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 1 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 1 de Cámara de cría", "2");
  await within(d).findByText("Cámara de cría de COL-002: 3 de 10 marcos. Hay espacio.");
  // Sin alza en el destino no se ofrece elegir piso.
  expect(within(d).queryByRole("radiogroup", { name: /Piso de COL-002/ })).toBeNull();
});

it("si el destino está lleno, pide el marco que sale y explica qué pasa con él", async () => {
  marcosActuales = { 2: { colmena_id: 2, camara_cria: LLENA, alza: piso(Array(10).fill("SIN_MARCO")) } };
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 4 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 4 de Cámara de cría", "2");
  await within(d).findByText("Cámara de cría de COL-002: 10 de 10 marcos. Está llena: elige qué marco sale de COL-002.");

  enviar(d);
  await within(d).findByText(
    "COL-002 tiene la cámara de cría llena: elige qué marco sale de ella para recibir el marco 4 de la cámara de cría."
  );

  const sale = within(d).getByLabelText("Marco que sale de COL-002 para recibir el marco 4 de Cámara de cría");
  expect(sale.options).toHaveLength(11);
  // Un marco de miel que sale va a bodega…
  fireEvent.change(sale, { target: { value: "6" } });
  within(d).getByText("El marco 6 de COL-002 se retira a bodega.");
  // …y uno con cría vuelve a esta colmena, al lugar que dejó el transferido.
  fireEvent.change(sale, { target: { value: "2" } });
  within(d).getByText("Intercambio: el marco 2 de COL-002 vuelve a COL-001, al marco 4 de la cámara de cría.");
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada con 1 transferencia.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.marcos[3]).toMatchObject({
    transferido_a_colmena_id: 2, ubicacion_destino: "CAMARA_CRIA", marco_desplazado_numero: 2,
  });
});

it("si el destino tiene alza, se puede mandar el marco al alza con espacio", async () => {
  marcosActuales = { 2: { colmena_id: 2, camara_cria: LLENA, alza: piso(["SOLO_MIEL", ...Array(9).fill("SIN_MARCO")]) } };
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  fireEvent.click(within(d).getByRole("button", { name: "Transferir el marco 4 de Cámara de cría" }));
  elegir(d, "Colmena de destino del marco 4 de Cámara de cría", "2");
  const pisos = await within(d).findByRole("radiogroup", { name: "Piso de COL-002 que recibe el marco 4 de Cámara de cría" });
  fireEvent.click(within(pisos).getByRole("radio", { name: "Alza" }));
  within(d).getByText("Alza de COL-002: 1 de 10 marcos. Hay espacio.");
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada con 1 transferencia.");
  const insp = llamadas.find((l) => l.ruta === "/inspecciones/" && l.metodo === "POST").cuerpo;
  expect(insp.marcos[3]).toMatchObject({ ubicacion_destino: "ALZA", marco_desplazado_numero: null });
});

it("dos marcos al mismo destino con un solo espacio: el segundo pide el que sale", async () => {
  const nueve = piso([...LLENA.slice(0, 9).map((m) => m.contenido), "SIN_MARCO"]);
  marcosActuales = { 3: { colmena_id: 3, camara_cria: nueve, alza: null } };
  const d = await abrirFormulario();
  elegir(d, "Completar los marcos sin registrar de Cámara de cría", "SOLO_CRIA");
  for (const n of [1, 2]) {
    fireEvent.click(within(d).getByRole("button", { name: `Transferir el marco ${n} de Cámara de cría` }));
    elegir(d, `Colmena de destino del marco ${n} de Cámara de cría`, "3");
  }
  await within(d).findByText("Cámara de cría de COL-003: 9 de 10 marcos. Hay espacio.");
  within(d).getByText(
    "Cámara de cría de COL-003: 9 de 10 marcos. El espacio que queda lo usa otro marco de esta inspección: elige qué marco sale de COL-003."
  );
  expect(within(d).queryByLabelText("Marco que sale de COL-003 para recibir el marco 1 de Cámara de cría")).toBeNull();
  within(d).getByLabelText("Marco que sale de COL-003 para recibir el marco 2 de Cámara de cría");
});
