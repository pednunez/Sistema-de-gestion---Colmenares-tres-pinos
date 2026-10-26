// PB-10: vista de detalle de una inspección.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, APICULTOR, irA, montarApp, simularBackend } from "./apoyo";
import { cajasDeInspeccion, transferenciasDeInspeccion } from "../../src/utils/inspecciones";

afterEach(cleanup);

const FECHA = "2026-10-26T10:00:00";
const colmenas = [
  { id: 1, apiario_id: 1, codigo: "COL-001", estado: "ACTIVA" },
  { id: 2, apiario_id: 1, codigo: "COL-002", estado: "ACTIVA" },
];
const marcos = [
  ...Array.from({ length: 10 }, (_, i) => ({
    ubicacion: "CAMARA_CRIA",
    numero: i + 1,
    contenido: i < 6 ? "MIEL_Y_CRIA" : "CERA_ESTIRADA",
    transferido_a_colmena_id: i === 2 ? 2 : null,
  })),
  { ubicacion: "ALZA", numero: 1, contenido: "SOLO_MIEL", transferido_a_colmena_id: null },
];
const completa = {
  id: 7, colmena_id: 1, usuario_id: 1, fecha_inspeccion: FECHA, activo: true,
  estado_general: "DONANTE", reina_observada: true, presencia_cria: true, postura: true, miel: "MEDIA",
  nivel_poblacion: "ALTO", reservas_alimento: "MEDIO", alimentacion_suministrada: "Jarabe 1:1, 2 litros",
  signos_enfermedad: true, enfermedad_observada: "Varroa", tiras_medicamento: 2,
  cantidad_marcos: 11, tiene_alza: true, marcos, observaciones: "Colmena fuerte",
};
const transferencias = [
  { id: 30, colmena_origen_id: 1, colmena_destino_id: 2, cantidad_marcos: 1, tipo_marco: "CRIA", fecha_transferencia: "2026-10-26T10:05:00", observaciones: "Marco 3 de cámara de cría: miel y cría." },
  { id: 31, colmena_origen_id: 1, colmena_destino_id: 2, cantidad_marcos: 1, tipo_marco: "MIEL", fecha_transferencia: "2026-10-20T10:05:00" },
];

it("arma las cajas de 10 marcos y deja vacío lo que falta", () => {
  const cajas = cajasDeInspeccion(completa);
  expect(cajas.map((c) => c.ubicacion)).toEqual(["CAMARA_CRIA", "ALZA"]);
  expect(cajas[1].marcos).toHaveLength(10);
  expect(cajas[1].marcos[1].contenido).toBeNull();
  expect(cajasDeInspeccion({ id: 1 })).toEqual([]);
});

it("relaciona transferencias por inspección o, si no hay vínculo, por colmena y día", () => {
  expect(transferenciasDeInspeccion(completa, transferencias)).toEqual({ lista: [transferencias[0]], aproximada: true });
  const conVinculo = [{ ...transferencias[1], inspeccion_id: 7 }];
  expect(transferenciasDeInspeccion(completa, conVinculo)).toEqual({ lista: conVinculo, aproximada: false });
});

it("muestra todo lo registrado en la inspección", async () => {
  simularBackend({
    usuario: ADMIN,
    datos: {
      "/apiarios/": [{ id: 1, nombre: "Mandinga" }],
      "/colmenas/": colmenas,
      "/inspecciones/": [completa],
      "/transferencias-marcos/": transferencias,
      "/tratamientos/": [{ id: 5, colmena_id: 1, inspeccion_id: 7, producto: "Apivar", estado: "EN_CURSO", fecha_inicio: "2026-10-26" }],
    },
  });
  await montarApp();
  await irA("Inspecciones");
  fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de la inspección de COL-001" }));
  const d = await screen.findByRole("dialog", { name: "Inspección de COL-001" });

  within(d).getByText("Donante");
  within(d).getByText("Jarabe 1:1, 2 litros");
  within(d).getByText("Varroa");
  within(d).getByText("2 tiras");
  within(d).getByText("Tratamiento: Apivar");
  within(d).getByText("Colmena fuerte");

  within(d).getByText("Cámara de cría");
  expect(within(d).getAllByText("Alza").length).toBe(2); // dato "Alza: Sí" y la caja del alza
  expect(within(d).getAllByText("Miel y cría")).toHaveLength(6);
  within(d).getByText("Solo miel");
  // El marco 3 se transfirió a COL-002.
  expect(within(d).getAllByText("COL-002").length).toBeGreaterThan(0);

  within(d).getByText("Marco 3 de cámara de cría: miel y cría.");
  within(d).getByText(/el mismo día de la inspección/);
  // La transferencia del 20-10 no corresponde a esta inspección.
  expect(within(d).getAllByText(/marco de/)).toHaveLength(1);
});

it("explica cuando no hay detalle por marco ni transferencias", async () => {
  const simple = { id: 8, colmena_id: 1, usuario_id: 1, fecha_inspeccion: FECHA, activo: true, estado_general: "COMPLETA", signos_enfermedad: false };
  simularBackend({
    usuario: ADMIN,
    datos: { "/apiarios/": [{ id: 1, nombre: "Mandinga" }], "/colmenas/": colmenas, "/inspecciones/": [simple] },
  });
  await montarApp();
  await irA("Inspecciones");
  fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de la inspección de COL-001" }));
  const d = await screen.findByRole("dialog");
  within(d).getByText("Sin signos de enfermedad.");
  within(d).getByText("Esta inspección no tiene guardado el detalle por marco.");
  within(d).getByText("No se transfirieron marcos en esta inspección.");
});

it("desde el detalle se puede editar si corresponde", async () => {
  simularBackend({
    usuario: ADMIN,
    datos: { "/apiarios/": [{ id: 1, nombre: "Mandinga" }], "/colmenas/": colmenas, "/inspecciones/": [completa] },
  });
  await montarApp();
  await irA("Inspecciones");
  fireEvent.click(await screen.findByRole("button", { name: "COL-001" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Editar inspección" }));
  expect(await screen.findByRole("dialog", { name: "Editar inspección" })).toBeTruthy();
});

it("el apicultor ve el detalle de una inspección ajena pero no la edita", async () => {
  simularBackend({
    usuario: APICULTOR,
    datos: { "/apiarios/": [{ id: 1, nombre: "Mandinga" }], "/colmenas/": colmenas, "/inspecciones/": [completa] },
  });
  await montarApp();
  await irA("Inspecciones");
  fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de la inspección de COL-001" }));
  const d = await screen.findByRole("dialog");
  within(d).getByText("Donante");
  expect(within(d).queryByRole("button", { name: "Editar inspección" })).toBeNull();
});
