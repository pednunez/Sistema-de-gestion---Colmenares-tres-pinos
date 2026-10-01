import { api } from "./api";

export const auditoriaService = {
  listar: () => api.get("/auditoria/"),
  obtener: (id) => api.get(`/auditoria/${id}`),
};
