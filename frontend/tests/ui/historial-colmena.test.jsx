// PB-12: historial de la colmena con detalle de cada evento y filtros.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, irA, montarApp, simularBackend } from "./apoyo";
import { armarHistorial, filtrarHistorial } from "../../src/utils/historial";

afterEach(cleanup);

const COLMENAS = [
  { id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" },
  { id: 2, apiario_id: 1, codigo: "COL-002", estado: "ACTIVA" },
  { id: 3, apiario_id: 1, codigo: "COL-003", estado: "ACTIVA" },
];
const INSPECCIONES = [
  {
    id: 10, colmena_id: 1, usuario_id: 1, fecha_inspeccion: "2026-10-20T10:00:00", estado_general: "DEBIL",
    cantidad_marcos: 9, tiene_alza: false, observaciones: "Poca población",
    marcos: [{ ubicacion: "CAMARA_CRIA", numero: 4, contenido: "SOLO_CRIA", transferido_a_colmena_id: 2 }],
  },
  { id: 11, colmena_id: 1, usuario_id: 1, fecha_inspeccion: "2026-10-27T09:00:00", estado_general: "COMPLETA", cantidad_marcos: 10 },
  { id: 12, colmena_id: 2, usuario_id: 1, fecha_inspeccion: "2026-10-27T11:00:00", estado_general: "COMPLETA" },
];
const TRATAMIENTOS = [
  { id: 20, colmena_id: 1, tipo_tratamiento: "VARROA", producto: "Amitraz", dosis: "2 tiras", fecha_inicio: "2026-10-22", estado: "EN_CURSO" },
];
const TRANSFERENCIAS = [
  {
    id: 30, colmena_origen_id: 1, colmena_destino_id: 2, cantidad_marcos: 1, inspeccion_id: 10,
    ubicacion: "CAMARA_CRIA", numero_marco: 4, contenido: "SOLO_CRIA", fecha_transferencia: "2026-10-20T10:05:00",
  },
  {
    id: 31, colmena_origen_id: 3, colmena_destino_id: 1, cantidad_marcos: 2, fecha_transferencia: "2026-10-25T08:00:00",
  },
];
// El backend entrega solo algunos eventos y con texto plano.
const HISTORIAL = [
  { colmena_id: 1, fecha: "2026-10-27T09:00:00", tipo_evento: "INSPECCION", evento_id: 11, detalle: "COMPLETA" },
  { colmena_id: 1, fecha: "2026-10-20T10:05:00", tipo_evento: "TRANSFERENCIA_SALIDA", evento_id: 30, detalle: "1 marco" },
];
const datos = {
  "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
  "/colmenas/": COLMENAS,
  "/inspecciones/": INSPECCIONES,
  "/tratamientos/": TRATAMIENTOS,
  "/transferencias-marcos/": TRANSFERENCIAS,
  "/historial/colmenas/1": HISTORIAL,
};

it("une el historial del servidor con los registros y ordena del más reciente al más antiguo", () => {
  const eventos = armarHistorial(HISTORIAL, { inspecciones: INSPECCIONES, tratamientos: TRATAMIENTOS, transferencias: TRANSFERENCIAS }, 1);
  expect(eventos.map((e) => e.clave)).toEqual([
    "INSPECCION-11",
    "TRANSFERENCIA-31",
    "TRATAMIENTO-20",
    "TRANSFERENCIA-30",
    "INSPECCION-10",
  ]);
  expect(eventos.find((e) => e.clave === "TRANSFERENCIA-31")).toMatchObject({ direccion: "LLEGADA", otraColmenaId: 3 });
  expect(eventos.find((e) => e.clave === "TRANSFERENCIA-30")).toMatchObject({ direccion: "SALIDA", otraColmenaId: 2 });
  expect(filtrarHistorial(eventos, { tipo: "TRANSFERENCIA" })).toHaveLength(2);
  expect(filtrarHistorial(eventos, { desde: "2026-10-22", hasta: "2026-10-25" }).map((e) => e.clave)).toEqual([
    "TRANSFERENCIA-31",
    "TRATAMIENTO-20",
  ]);
});

async function abrirFicha() {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Colmenas");
  fireEvent.click(await screen.findByRole("button", { name: "Ver COL-001" }));
  return screen.findByRole("dialog");
}

it("muestra cada evento con su detalle, las transferencias en las dos direcciones y el estado", async () => {
  const d = await abrirFicha();
  await within(d).findByText("Salida de marco hacia COL-002");
  within(d).getByText("Llegada de 2 marcos desde COL-003");
  within(d).getByText("Solo cría · Cámara de cría, marco 4");
  within(d).getByText("Tratamiento: Varroa");
  within(d).getByText("Amitraz · 2 tiras");
  // Estado nuevo de la colmena en cada inspección.
  within(d).getByText("Débil");
  within(d).getByText("Poca población");
  within(d).getByText("9 marcos");
  within(d).getByText("1 marco transferido");
});

it("filtra por tipo y por fecha", async () => {
  const d = await abrirFicha();
  await within(d).findByText("Salida de marco hacia COL-002");
  const tipos = within(d).getByRole("radiogroup", { name: "Tipo de evento" });
  within(tipos).getByRole("radio", { name: "Todos (5)" });
  fireEvent.click(within(tipos).getByRole("radio", { name: "Transferencias (2)" }));
  expect(within(d).queryByText("Tratamiento: Varroa")).toBeNull();
  within(d).getByText("Llegada de 2 marcos desde COL-003");

  fireEvent.click(within(tipos).getByRole("radio", { name: "Todos (5)" }));
  fireEvent.change(within(d).getByLabelText("Desde"), { target: { value: "2026-10-26" } });
  expect(within(d).queryByText("Salida de marco hacia COL-002")).toBeNull();
  fireEvent.change(within(d).getByLabelText("Hasta"), { target: { value: "2026-10-26" } });
  within(d).getByText("No hay eventos con estos filtros.");

  fireEvent.click(within(d).getByRole("button", { name: "Limpiar filtros" }));
  within(d).getByText("Salida de marco hacia COL-002");
});

it("abre el detalle de la inspección y vuelve a la ficha de la colmena", async () => {
  const d = await abrirFicha();
  await within(d).findByText("Salida de marco hacia COL-002");
  // La transferencia lleva a la inspección en que se registró.
  fireEvent.click(within(d).getAllByRole("button", { name: /^Ver la inspección del/ })[2]);
  const detalle = await screen.findByRole("dialog", { name: /Inspección de COL-001/ });
  within(detalle).getByText("Poca población");
  fireEvent.click(within(detalle).getAllByRole("button", { name: /Cerrar/ })[0]);
  await screen.findByRole("dialog", { name: "Colmena COL-001" });
});
