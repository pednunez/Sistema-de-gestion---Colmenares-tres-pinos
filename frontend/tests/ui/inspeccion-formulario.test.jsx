// Mejoras del formulario de inspección: apiario y colmena por separado,
// tratamientos en curso, campos en rojo y errores al pie.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }, { id: 2, nombre: "Popeta" }],
  "/colmenas/": [
    { id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" },
    { id: 2, apiario_id: 1, codigo: "COL-002", estado: "ACTIVA" },
    { id: 3, apiario_id: 2, codigo: "POP-001", estado: "ACTIVA" },
  ],
  "/tratamientos/": [
    { id: 5, colmena_id: 1, usuario_id: 1, tipo_tratamiento: "VARROA", producto: "Apivar", estado: "EN_CURSO", fecha_inicio: "2026-10-01" },
    { id: 6, colmena_id: 1, usuario_id: 1, tipo_tratamiento: "NOSEMA", estado: "FINALIZADO", fecha_inicio: "2026-09-01" },
  ],
};

async function abrir(usuario = ADMIN, respuestas = {}) {
  const llamadas = simularBackend({ usuario, datos, respuestas });
  await montarApp();
  await irA("Inspecciones");
  fireEvent.click(await screen.findByRole("button", { name: "Registrar inspección" }));
  return { llamadas, d: screen.getByRole("dialog") };
}
const elegir = (d, etiqueta, valor) => fireEvent.change(within(d).getByLabelText(etiqueta), { target: { value: valor } });
const enviar = (d) => fireEvent.click(within(d).getAllByRole("button", { name: "Registrar inspección" }).at(-1));

it("primero se elige el apiario y solo aparecen sus colmenas", async () => {
  const { d } = await abrir();
  const colmena = within(d).getByLabelText(/^Colmena/);
  expect(colmena.disabled).toBe(true);
  elegir(d, /^Apiario/, "1");
  expect([...colmena.options].map((o) => o.textContent)).toEqual(["Selecciona una colmena", "COL-001", "COL-002"]);
  elegir(d, /^Colmena/, "2");
  // Al cambiar de apiario se limpia la colmena.
  elegir(d, /^Apiario/, "2");
  expect(colmena.value).toBe("");
  expect([...colmena.options].map((o) => o.textContent)).toEqual(["Selecciona una colmena", "POP-001"]);
});

it("sin datos, marca en rojo lo que falta y lo resume al pie", async () => {
  const { d, llamadas } = await abrir();
  enviar(d);
  const aviso = await within(d).findByText(/Revisa lo marcado en rojo: Apiario, Colmena, Estado de la colmena\./);
  // El aviso está en el pie, junto a los botones, no al inicio del formulario.
  expect(aviso.closest("form")).toBeNull();
  expect(within(d).getByLabelText(/^Apiario/).getAttribute("aria-invalid")).toBe("true");
  const estado = within(d).getByRole("radiogroup", { name: /Estado de la colmena/ }).closest("[data-invalido]");
  expect(estado.getAttribute("data-invalido")).toBe("true");
  expect(llamadas.some((l) => l.metodo === "POST")).toBe(false);
});

it("los marcos sin registrar quedan en rojo", async () => {
  const { d } = await abrir();
  elegir(d, /^Apiario/, "1");
  elegir(d, /^Colmena/, "1");
  fireEvent.click(within(d).getByRole("radio", { name: "Completa" }));
  elegir(d, "Contenido del marco 1 de Cámara de cría", "SOLO_CRIA");
  enviar(d);
  await within(d).findByText(/Revisa lo marcado en rojo: Cámara de cría\./);
  expect(within(d).getByLabelText("Contenido del marco 1 de Cámara de cría").getAttribute("aria-invalid")).toBe("false");
  expect(within(d).getByLabelText("Contenido del marco 2 de Cámara de cría").getAttribute("aria-invalid")).toBe("true");
});

it("si el backend rechaza un campo, lo marca en rojo y lo explica al pie", async () => {
  const { d } = await abrir(ADMIN, {
    "POST /inspecciones/": (_, json) =>
      json({ detail: [{ type: "literal_error", loc: ["body", "estado_general"], msg: "Input should be 'BUENO'" }] }, 422),
  });
  elegir(d, /^Apiario/, "1");
  elegir(d, /^Colmena/, "2");
  fireEvent.click(within(d).getByRole("radio", { name: "Donante" }));
  enviar(d);
  await within(d).findByText("El servidor rechazó algunos datos. Revisa los campos marcados en rojo.");
  within(d).getByText("El servidor no acepta este valor.");
  within(d).getByText(/Revisa lo marcado en rojo: Estado de la colmena\./);
});

it("muestra los tratamientos en curso y finaliza el marcado al guardar", async () => {
  const { d, llamadas } = await abrir();
  elegir(d, /^Apiario/, "1");
  elegir(d, /^Colmena/, "1");
  const tratamientos = within(d).getByRole("region", { name: "Tratamientos en curso" });
  within(tratamientos).getByText("Varroa · Apivar");
  expect(within(tratamientos).queryByText(/Nosema/)).toBeNull();

  fireEvent.click(within(tratamientos).getByRole("checkbox", { name: "Finalizar Varroa · Apivar en esta inspección" }));
  within(tratamientos).getByText("Se finalizará al guardar la inspección.");
  fireEvent.click(within(d).getByRole("radio", { name: "Completa" }));
  enviar(d);

  await waitFor(() => expect(llamadas.some((l) => l.metodo === "PATCH")).toBe(true));
  const patch = llamadas.find((l) => l.metodo === "PATCH");
  expect(patch.ruta).toBe("/tratamientos/5");
  expect(patch.cuerpo).toMatchObject({ estado: "FINALIZADO" });
  expect(patch.cuerpo.fecha_fin).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // Primero se guarda la inspección y después se finaliza el tratamiento.
  expect(llamadas.findIndex((l) => l.metodo === "POST")).toBeLessThan(llamadas.findIndex((l) => l.metodo === "PATCH"));
  await screen.findByText(/Se finalizó 1 tratamiento/);
});

it("si no se puede finalizar el tratamiento, la inspección queda guardada y se avisa", async () => {
  const { d } = await abrir(ADMIN, {
    "PATCH /tratamientos/5": (_, json) => json({ detail: "No tienes permisos para modificar este tratamiento" }, 403),
  });
  elegir(d, /^Apiario/, "1");
  elegir(d, /^Colmena/, "1");
  fireEvent.click(within(d).getByRole("checkbox", { name: /Finalizar Varroa/ }));
  fireEvent.click(within(d).getByRole("radio", { name: "Completa" }));
  enviar(d);
  await screen.findByText(/quedó guardada, pero no se pudo completar lo siguiente/);
  screen.getByText(/Finalizar el tratamiento Varroa\. No tienes permisos/);
});

it("el apicultor que inspecciona puede finalizar un tratamiento que registró otra persona", async () => {
  const { d, llamadas } = await abrir(APICULTOR);
  elegir(d, /^Apiario/, "1");
  elegir(d, /^Colmena/, "1");
  const casilla = within(d).getByRole("checkbox", { name: /Finalizar Varroa/ });
  expect(casilla.disabled).toBe(false);
  fireEvent.click(casilla);
  fireEvent.click(within(d).getByRole("radio", { name: "Completa" }));
  enviar(d);
  await waitFor(() => expect(llamadas.find((l) => l.metodo === "PATCH")?.ruta).toBe("/tratamientos/5"));
});
