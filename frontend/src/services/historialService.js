import { api } from "./api";

export const historialService = {
  deColmena: (colmenaId) => api.get(`/historial/colmenas/${colmenaId}`),
};
