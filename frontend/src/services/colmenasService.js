import { api } from "./api";
import { crearServicioCrud } from "./crud";

export const colmenasService = {
  ...crearServicioCrud("/colmenas"),
  // Página del listado usando la paginación del backend (S1-T21 / S1-T22).
  listarPagina: ({ apiarioId, offset = 0, limit = 20 } = {}) => {
    const parametros = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (apiarioId) parametros.set("apiario_id", String(apiarioId));
    return api.get(`/colmenas/?${parametros}`);
  },
  obtenerPorQr: (codigoQr) => api.get(`/colmenas/qr/${codigoQr}`),
  // Se pide como blob con la sesión, así funciona aunque el endpoint esté protegido.
  obtenerImagenQr: (id) => api.blob(`/colmenas/${id}/qr`),
};
