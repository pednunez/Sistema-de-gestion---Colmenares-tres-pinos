// Grupos de colmenas dentro de un apiario (PB-06).
// Contrato: backend/app/routers/grupos.py. Solo ADMIN crea, modifica y asigna.
import { api } from "./api";

export const gruposService = {
  listar: ({ apiarioId } = {}) =>
    api.get(apiarioId ? `/grupos/?apiario_id=${apiarioId}` : "/grupos/"),
  obtener: (id) => api.get(`/grupos/${id}`),
  crear: (datos) => api.post("/grupos/", datos),
  actualizar: (id, datos) => api.patch(`/grupos/${id}`, datos),
  // Una colmena está en un solo grupo: si estaba en otro, el backend la mueve.
  asignarColmenas: (id, colmenaIds) =>
    api.post(`/grupos/${id}/colmenas`, { colmena_ids: colmenaIds }),
  retirarColmena: (id, colmenaId) =>
    api.delete(`/grupos/${id}/colmenas/${colmenaId}`),
  // Baja lógica: las colmenas quedan sin grupo y el historial se conserva.
  desactivar: (id) => api.delete(`/grupos/${id}`),
};
