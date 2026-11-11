// S4-T10: reportes con filtros y vista previa.
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { ADMIN, irA, montarApp, simularBackend } from "./apoyo";

afterEach(cleanup);

const dia = (aaaammdd) => new Date(`${aaaammdd}T12:00:00`).toISOString();
const col = (id, apiario_id, extra = {}) => ({ id, apiario_id, codigo: `COL-00${id}`, estado: "ACTIVA", ...extra });
const datos = {
  "/apiarios/": [
    { id: 1, nombre: "Mandinga" },
    { id: 2, nombre: "Culibrán" },
  ],
  "/colmenas/": [col(1, 1), col(2, 1), col(3, 2), col(4, 2, { estado: "BAJA" })],
  "/usuarios/": [{ id: 7, nombre: "Ana", apellido: "Pérez", email: "ana@tp.cl", rol: "APICULTOR" }],
  "/inspecciones/": [
    { id: 1, colmena_id: 1, usuario_id: 7, fecha_inspeccion: dia("2026-11-02"), estado_general: "COMPLETA", cantidad_marcos: 10, tiene_alza: true },
    { id: 2, colmena_id: 2, usuario_id: 7, fecha_inspeccion: dia("2026-11-08"), estado_general: "REQUIERE_REVISION", signos_enfermedad: true, enfermedad_observada: "Varroa" },
    { id: 3, colmena_id: 3, usuario_id: 7, fecha_inspeccion: dia("2026-10-20"), estado_general: "DEBIL" },
  ],
  "/tratamientos/": [
    { id: 5, colmena_id: 2, usuario_id: 7, tipo_tratamiento: "CONTROL_VARROA", producto: "Ácido oxálico", dosis: "2 tiras", estado: "EN_CURSO", fecha_inicio: "2026-11-08" },
  ],
};

const filas = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const celdas = (fila) => within(fila).getAllByRole("cell").map((c) => c.textContent);

async function abrir() {
  simularBackend({ usuario: ADMIN, datos });
  await montarApp();
  await irA("Reportes");
  await screen.findByText(/Vista previa: Inspecciones/);
}

it("el reporte de inspecciones filtra por período, apiario y estado", async () => {
  await abrir();
  expect(filas()).toHaveLength(3);
  // Más reciente primero, con el responsable por su nombre y sin su correo.
  expect(celdas(filas()[0])).toEqual(["08-11-2026", "COL-002", "Mandinga", "Requiere revisión", "Sí: Varroa", "—", "—", "Ana Pérez", ""]);
  expect(screen.queryByText("ana@tp.cl")).toBeNull();

  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-01" } });
  fireEvent.change(screen.getByLabelText("Apiario"), { target: { value: "1" } });
  expect(filas()).toHaveLength(2);
  screen.getByText(/Desde el 01-11-2026 · Apiario Mandinga · 2 filas/);

  fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "COMPLETA" } });
  expect(filas().map((f) => celdas(f)[1])).toEqual(["COL-001"]);
  // La colmena solo ofrece las del apiario elegido.
  expect([...screen.getByLabelText("Colmena").options].map((o) => o.textContent)).toEqual(["Todas las colmenas", "COL-001", "COL-002"]);

  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  expect(filas()).toHaveLength(3);
});

it("tratamientos y estado de las colmenas tienen sus propias columnas y estados", async () => {
  await abrir();
  fireEvent.click(screen.getByRole("radio", { name: "Tratamientos" }));
  await screen.findByText(/Vista previa: Tratamientos/);
  expect(celdas(filas()[0])).toEqual(["08-11-2026", "—", "COL-002", "Mandinga", "Control varroa", "Ácido oxálico", "2 tiras", "En curso", "Ana Pérez"]);

  fireEvent.click(screen.getByRole("radio", { name: "Colmenas" }));
  await screen.findByText(/Vista previa: Estado de las colmenas/);
  // Es una foto actual: no tiene período, y no incluye colmenas dadas de baja.
  expect(screen.queryByLabelText("Desde")).toBeNull();
  expect(filas().map((f) => celdas(f)[0])).toEqual(["COL-001", "COL-002", "COL-003"]);
  expect(celdas(filas()[1])).toMatchObject({ 4: "Requiere revisión", 6: "1" });
});

it("las descargas quedan visibles pero deshabilitadas hasta definir quién genera los archivos", async () => {
  await abrir();
  const descargas = screen.getByRole("group", { name: "Descargar reporte" });
  for (const nombre of ["PDF", "Excel (XLSX)", "CSV"]) {
    expect(within(descargas).getByRole("button", { name: nombre }).disabled).toBe(true);
  }
});
