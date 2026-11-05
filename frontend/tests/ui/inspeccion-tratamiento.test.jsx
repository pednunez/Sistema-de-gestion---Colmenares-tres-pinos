// Registrar un tratamiento desde la inspección cuando hay signos de enfermedad.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { hoyISO } from "../../src/utils/formato";

afterEach(cleanup);

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": [{ id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" }],
};

async function abrirConSignos(respuestas = {}) {
  const llamadas = simularBackend({
    usuario: APICULTOR,
    datos,
    respuestas: { "POST /inspecciones/": (_, json) => json({ id: 50 }, 201), ...respuestas },
  });
  await montarApp();
  await irA("Inspecciones");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar inspección" }));
  const d = screen.getByRole("dialog");
  fireEvent.change(within(d).getByLabelText(/^Apiario/), { target: { value: "1" } });
  fireEvent.change(within(d).getByLabelText(/^Colmena/), { target: { value: "1" } });
  fireEvent.click(within(d).getByRole("radio", { name: "Requiere revisión" }));
  return { d, llamadas };
}

const marcarSignos = (d) => {
  fireEvent.click(within(within(d).getByRole("radiogroup", { name: "¿Hay signos de enfermedad?" })).getByRole("radio", { name: "Sí" }));
  fireEvent.change(within(d).getByLabelText(/Qué se observó/), { target: { value: "Varroa en zánganos" } });
};
const enviar = (d) => fireEvent.click(within(d).getAllByRole("button", { name: "Registrar inspección" }).at(-1));

it("solo ofrece registrar un tratamiento cuando hay signos de enfermedad", async () => {
  const { d } = await abrirConSignos();
  expect(within(d).queryByRole("radiogroup", { name: "¿Se aplicó un tratamiento?" })).toBeNull();
  marcarSignos(d);
  const pregunta = within(d).getByRole("radiogroup", { name: "¿Se aplicó un tratamiento?" });
  expect(within(pregunta).getByRole("radio", { name: "No" }).getAttribute("aria-checked")).toBe("true");
  expect(within(d).queryByLabelText(/Tipo de tratamiento/)).toBeNull();
  fireEvent.click(within(pregunta).getByRole("radio", { name: "Sí, registrar" }));
  within(d).getByLabelText(/Tipo de tratamiento/);
});

it("registra la inspección y el tratamiento asociado a ella", async () => {
  const { d, llamadas } = await abrirConSignos();
  marcarSignos(d);
  fireEvent.click(within(within(d).getByRole("radiogroup", { name: "Tiras de medicamento aplicadas" })).getByRole("radio", { name: "2" }));
  fireEvent.click(within(within(d).getByRole("radiogroup", { name: "¿Se aplicó un tratamiento?" })).getByRole("radio", { name: "Sí, registrar" }));

  // Sin tipo de tratamiento no se guarda.
  enviar(d);
  await within(d).findByText("Indica el tipo de tratamiento.");
  within(d).getByText(/Revisa lo marcado en rojo: Tratamiento/);

  fireEvent.change(within(d).getByLabelText(/Tipo de tratamiento/), { target: { value: "Control de varroa" } });
  fireEvent.change(within(d).getByLabelText(/^Producto/), { target: { value: "Amitraz" } });
  enviar(d);

  await screen.findByText("Inspección de COL-001 registrada. Se registró el tratamiento.");
  const posts = llamadas.filter((l) => l.metodo === "POST");
  expect(posts.map((l) => l.ruta)).toEqual(["/inspecciones/", "/tratamientos/"]);
  expect(posts[1].cuerpo).toEqual({
    tipo_tratamiento: "Control de varroa",
    producto: "Amitraz",
    dosis: "2 tiras",
    motivo: "Varroa en zánganos",
    fecha_inicio: hoyISO(),
    fecha_fin: null,
    estado: "EN_CURSO",
    observaciones: null,
    colmena_id: 1,
    inspeccion_id: 50,
  });
});

it("si quitan los signos de enfermedad, no se registra el tratamiento", async () => {
  const { d, llamadas } = await abrirConSignos();
  marcarSignos(d);
  fireEvent.click(within(within(d).getByRole("radiogroup", { name: "¿Se aplicó un tratamiento?" })).getByRole("radio", { name: "Sí, registrar" }));
  fireEvent.change(within(d).getByLabelText(/Tipo de tratamiento/), { target: { value: "Control de varroa" } });
  fireEvent.click(within(within(d).getByRole("radiogroup", { name: "¿Hay signos de enfermedad?" })).getByRole("radio", { name: "No" }));
  enviar(d);
  await screen.findByText("Inspección de COL-001 registrada.");
  expect(llamadas.some((l) => l.ruta === "/tratamientos/" && l.metodo === "POST")).toBe(false);
});

it("si el tratamiento falla, la inspección queda guardada y lo avisa", async () => {
  const { d } = await abrirConSignos({
    "POST /tratamientos/": (_, json) => json({ detail: "El tipo de tratamiento no es válido" }, 422),
  });
  marcarSignos(d);
  fireEvent.click(within(within(d).getByRole("radiogroup", { name: "¿Se aplicó un tratamiento?" })).getByRole("radio", { name: "Sí, registrar" }));
  fireEvent.change(within(d).getByLabelText(/Tipo de tratamiento/), { target: { value: "Control de varroa" } });
  enviar(d);
  await screen.findByText(/La inspección se guardó, pero el tratamiento no:/);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
