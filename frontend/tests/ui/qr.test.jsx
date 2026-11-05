// PB-07: escanear la etiqueta QR para llegar a la colmena y asociar etiquetas.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { codigoQrDeLaUrl, enlaceDeColmena, extraerCodigoQr } from "../../src/utils/qr";

afterEach(cleanup);

const QR = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";
const COLMENAS = [
  { id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA", codigo_qr: "11111111-1111-4111-8111-111111111111" },
  { id: 2, apiario_id: 1, codigo: "COL-002", estado: "ACTIVA", codigo_qr: QR },
];
const datos = { "/apiarios/": [{ id: 1, nombre: "Mandinga" }], "/colmenas/": COLMENAS };
const encontrada = { [`GET /colmenas/qr/${QR}`]: (_, json) => json(COLMENAS[1]) };
const noEncontrada = (codigo) => ({
  [`GET /colmenas/qr/${codigo}`]: (_, json) => json({ detail: "No existe una colmena activa asociada a este código QR" }, 404),
});

it("reconoce el código en la URL del backend, en la del frontend o solo", () => {
  expect(extraerCodigoQr(`https://api.tp.cl/colmenas/qr/${QR}`)).toBe(QR);
  expect(extraerCodigoQr(`https://tp.cl/?qr=${QR.toUpperCase()}`)).toBe(QR);
  expect(extraerCodigoQr(` ${QR} `)).toBe(QR);
  expect(extraerCodigoQr("COL-002")).toBeNull();
  expect(codigoQrDeLaUrl({ search: `?qr=${QR}` })).toBe(QR);
  expect(enlaceDeColmena(QR, "https://tp.cl")).toBe(`https://tp.cl/?qr=${QR}`);
});

async function abrirLector(usuario = ADMIN, respuestas = encontrada) {
  const llamadas = simularBackend({ usuario, datos, respuestas });
  await montarApp();
  await irA("Colmenas");
  fireEvent.click(await screen.findByRole("button", { name: "Escanear QR" }));
  const d = await screen.findByRole("dialog", { name: "Escanear QR de una colmena" });
  return { d, llamadas };
}

const escribir = (d, texto) => {
  fireEvent.change(within(d).getByLabelText("Código de la etiqueta"), { target: { value: texto } });
  fireEvent.click(within(d).getByRole("button", { name: "Buscar" }));
};

it("con el código de la etiqueta abre la ficha de la colmena", async () => {
  const { d } = await abrirLector();
  // En este navegador de prueba no hay cámara: se puede escribir o pegar el código.
  within(d).getByText(/Este navegador no lee QR con la cámara/);
  escribir(d, "COL-002");
  await within(d).findByText(/No parece un código QR del sistema/);
  escribir(d, `https://api.tp.cl/colmenas/qr/${QR}`);
  await screen.findByRole("dialog", { name: "Colmena COL-002" });
});

it("si la etiqueta no está asociada, el administrador la asocia a una colmena", async () => {
  const NUEVO = "99999999-9999-4999-8999-999999999999";
  const { d, llamadas } = await abrirLector(ADMIN, {
    ...noEncontrada(NUEVO),
    "PUT /colmenas/1/qr": (_, json) => json({ ...COLMENAS[0], codigo_qr: NUEVO }),
  });
  escribir(d, NUEVO);
  await within(d).findByText("Esta etiqueta no está asociada a ninguna colmena activa.");
  fireEvent.change(within(d).getByLabelText("Colmena para esta etiqueta"), { target: { value: "1" } });
  fireEvent.click(within(d).getByRole("button", { name: "Asociar etiqueta" }));
  await screen.findByRole("dialog", { name: "Colmena COL-001" });
  await screen.findByText("La etiqueta quedó asociada a COL-001.");
  expect(llamadas.find((l) => l.metodo === "PUT").cuerpo).toEqual({ codigo_qr: NUEVO });
});

it("el apicultor no puede asociar etiquetas", async () => {
  const NUEVO = "99999999-9999-4999-8999-999999999999";
  const { d, llamadas } = await abrirLector(APICULTOR, noEncontrada(NUEVO));
  escribir(d, NUEVO);
  await within(d).findByText("Pídele al administrador que asocie esta etiqueta a su colmena.");
  expect(within(d).queryByRole("button", { name: "Asociar etiqueta" })).toBeNull();
  expect(llamadas.some((l) => l.metodo === "PUT")).toBe(false);
});

it("desde la ficha, el administrador cambia la etiqueta o genera un código nuevo", async () => {
  const llamadas = simularBackend({
    usuario: ADMIN,
    datos,
    respuestas: {
      "PUT /colmenas/2/qr": (llamada, json) =>
        llamada.cuerpo.codigo_qr
          ? json({ detail: "El código QR ya está asociado a otra colmena" }, 409)
          : json({ ...COLMENAS[1], codigo_qr: "22222222-2222-4222-8222-222222222222" }),
    },
  });
  await montarApp();
  await irA("Colmenas");
  fireEvent.click(await screen.findByRole("button", { name: "Ver COL-002" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cambiar etiqueta" }));
  const d = await screen.findByRole("dialog", { name: "Etiqueta QR de COL-002" });

  // Una etiqueta que ya es de otra colmena se rechaza con un mensaje claro.
  escribir(d, COLMENAS[0].codigo_qr);
  await within(d).findByText("El código QR ya está asociado a otra colmena");

  fireEvent.click(within(d).getByRole("radio", { name: "Código nuevo" }));
  fireEvent.click(within(d).getByRole("button", { name: "Generar código nuevo" }));
  await screen.findByText("COL-002 tiene un código QR nuevo: imprime su etiqueta.");
  await screen.findByRole("dialog", { name: "Colmena COL-002" });
  expect(llamadas.filter((l) => l.metodo === "PUT").map((l) => l.cuerpo)).toEqual([
    { codigo_qr: COLMENAS[0].codigo_qr },
    { codigo_qr: null },
  ]);
});

it("al abrir el sistema desde una etiqueta (?qr=) va directo a la colmena", async () => {
  simularBackend({ usuario: ADMIN, datos, respuestas: encontrada });
  window.scrollTo = () => {};
  window.history.replaceState(null, "", `/?qr=${QR}`);
  vi.resetModules();
  const { default: App } = await import("../../src/App");
  render(<App />);
  await screen.findByRole("dialog", { name: "Colmena COL-002" });
  expect(window.location.search).toBe("");
});
