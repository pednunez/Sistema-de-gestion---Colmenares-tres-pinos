import { crearServicioCrud } from "./crud";

const crud = crearServicioCrud("/tratamientos");

export const tratamientosService = {
  listar: crud.listar,
  obtener: crud.obtener,
  crear: crud.crear,
  actualizar: crud.actualizar,
  // En el backend, DELETE cambia el tratamiento a CANCELADO.
  cancelar: crud.darDeBaja,
};
