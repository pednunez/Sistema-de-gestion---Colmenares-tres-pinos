import { api } from "./api";
import { crearServicioCrud } from "./crud";

export const colmenasService = {
  ...crearServicioCrud("/colmenas"),
  obtenerPorQr: (codigoQr) => api.get(`/colmenas/qr/${codigoQr}`),
  // Se pide como blob con el token, así funciona aunque el endpoint se proteja.
  obtenerImagenQr: (id) => api.blob(`/colmenas/${id}/qr`),
};
