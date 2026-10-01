import { api } from "./api";

// Operaciones estándar que expone cada router de FastAPI.
// En el backend, DELETE es una baja lógica: el registro y su historial se conservan.
export function crearServicioCrud(base) {
  return {
    listar: () => api.get(`${base}/`),
    obtener: (id) => api.get(`${base}/${id}`),
    crear: (datos) => api.post(`${base}/`, datos),
    actualizar: (id, datos) => api.patch(`${base}/${id}`, datos),
    darDeBaja: (id) => api.delete(`${base}/${id}`),
  };
}
