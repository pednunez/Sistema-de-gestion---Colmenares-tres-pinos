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
};
