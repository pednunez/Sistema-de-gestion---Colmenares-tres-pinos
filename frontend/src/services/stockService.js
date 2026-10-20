// Inventario de material de la bodega (módulo Stock).
// Contrato con el backend: frontend/PENDIENTES_BACKEND.md, sección 5.
import { api } from "./api";

export const stockService = {
  // Devuelve null si el backend todavía no tiene el módulo (404), para que la
  // pantalla lo explique en vez de mostrar un error.
  async obtenerInventario() {
    try {
      return await api.get("/stock/");
    } catch (err) {
      if (err.estado === 404) return null;
      throw err;
    }
  },

  registrarMovimiento: (movimiento) => api.post("/stock/movimientos/", movimiento),

  // Historial filtrado y paginado. null si el backend aún no tiene el endpoint.
  async listarMovimientos({ material, tipo, desde, hasta, offset = 0, limit = 20 } = {}) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (material) params.set("material", material);
    if (tipo) params.set("tipo", tipo);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    try {
      return await api.get(`/stock/movimientos/?${params}`);
    } catch (err) {
      if (err.estado === 404) return null;
      throw err;
    }
  },
};
