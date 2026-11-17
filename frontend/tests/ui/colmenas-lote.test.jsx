// Crear colmenas en lote (carga inicial, S5-T11).
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { generarCodigos, prefijoSugerido, siguienteNumero } from "../../src/utils/colmenasEnLote";

afterEach(cleanup);

const datos = {
  "/apiarios/": [
    { id: 1, nombre: "Mandinga" },
    { id: 2, nombre: "Popeta" },
    { id: 3, nombre: "Culiprán" },
  ],
  "/colmenas/": [
    { id: 1, apiario_id: 2, codigo: "POP-001", estado: "ACTIVA" },
    { id: 2, apiario_id: 2, codigo: "POP-003", estado: "ACTIVA" },
    { id: 3, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" },
  ],
};

it("sugiere prefijo y número, y arma los códigos correlativos", () => {
  expect(prefijoSugerido("Popeta")).toBe("POP");
  expect(prefijoSugerido("Culiprán")).toBe("CUL");
  expect(siguienteNumero("POP", ["POP-001", "POP-003", "COL-009"])).toBe(4);
  expect(siguienteNumero("CUL", ["POP-001"])).toBe(1);
  expect(generarCodigos({ prefijo: "MAN", desde: 9, cantidad: 3 })).toEqual(["MAN-009", "MAN-010", "MAN-011"]);
  expect(generarCodigos({ prefijo: "CUL", desde: 1, cantidad: 230 }).at(-1)).toBe("CUL-230");
});

async function abrirLote(respuestas = {}) {
  const llamadas = simularBackend({ usuario: ADMIN, datos, respuestas });
  await montarApp();
  await irA("Colmenas");
  fireEvent.click(await screen.findByRole("button", { name: "Crear en lote" }));
  const d = await screen.findByRole("dialog", { name: "Crear colmenas en lote" });
  return { d, llamadas };
}
const campo = (d, etiqueta, valor) => fireEvent.change(within(d).getByLabelText(new RegExp(`^${etiqueta}`)), { target: { value: valor } });
const posts = (llamadas) => llamadas.filter((l) => l.metodo === "POST" && l.ruta === "/colmenas/");

it("crea las colmenas del apiario con el siguiente número libre y 10 marcos", async () => {
  const { d, llamadas } = await abrirLote();
  campo(d, "Apiario", "2");
  expect(within(d).getByLabelText(/^Prefijo del código/).value).toBe("POP");
  expect(within(d).getByLabelText(/^Desde el número/).value).toBe("4");
  campo(d, "Cantidad", "5");
  within(d).getByText("Se crearán 5 colmenas activas en Popeta");
  within(d).getByText(/Códigos POP-004 a POP-008 · 10 marcos cada una\./);

  fireEvent.click(within(d).getByRole("button", { name: "Crear 5 colmenas" }));
  await within(d).findByText("5 colmenas creadas en Popeta.");
  expect(posts(llamadas).map((l) => l.cuerpo.codigo)).toEqual(["POP-004", "POP-005", "POP-006", "POP-007", "POP-008"]);
  expect(posts(llamadas)[0].cuerpo).toEqual({ apiario_id: 2, codigo: "POP-004", estado: "ACTIVA", cantidad_marcos: 10, fecha_instalacion: null });
  await screen.findByText("5 colmenas creadas.");
});

it("omite los códigos que ya existen e informa los que fallan, sin detener el resto", async () => {
  const { d, llamadas } = await abrirLote({
    "POST /colmenas/": (llamada, json) =>
      llamada.cuerpo.codigo === "POP-004"
        ? json({ detail: "Ya existe una colmena con ese código" }, 409)
        : llamada.cuerpo.codigo === "POP-005"
          ? json({ detail: "Error interno" }, 500)
          : json({ id: 100, ...llamada.cuerpo }, 201),
  });
  campo(d, "Apiario", "2");
  campo(d, "Desde el número", "2");
  campo(d, "Cantidad", "5");
  // POP-003 ya está cargada: no se envía.
  within(d).getByText(/1 código ya existe y se omitirá: POP-003/);
  fireEvent.click(within(d).getByRole("button", { name: "Crear 4 colmenas" }));

  await within(d).findByText("2 colmenas creadas en Popeta.");
  within(d).getByText(/2 códigos omitidos porque ya existían: POP-003, POP-004/);
  within(d).getByText("1 colmena no se pudo crear");
  within(d).getByText(/^POP-005:/);
  expect(posts(llamadas).map((l) => l.cuerpo.codigo).sort()).toEqual(["POP-002", "POP-004", "POP-005", "POP-006"]);
});

it("valida la cantidad y el apiario antes de crear", async () => {
  const { d, llamadas } = await abrirLote();
  fireEvent.click(within(d).getByRole("button", { name: "Crear colmenas" }));
  await within(d).findByText("Selecciona el apiario.");
  campo(d, "Apiario", "3");
  expect(within(d).getByLabelText(/^Prefijo del código/).value).toBe("CUL");
  campo(d, "Cantidad", "501");
  fireEvent.click(within(d).getByRole("button", { name: "Crear colmenas" }));
  await within(d).findByText("Ingresa una cantidad entre 1 y 500.");
  await waitFor(() => expect(posts(llamadas)).toHaveLength(0));
});

it("el apicultor no ve la creación en lote", async () => {
  simularBackend({ usuario: APICULTOR, datos });
  await montarApp();
  await irA("Colmenas");
  await screen.findByText(/colmenas registradas/);
  expect(screen.queryByRole("button", { name: "Crear en lote" })).toBeNull();
});
