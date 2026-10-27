// Revisión de un grupo de colmenas en terreno (PB-18).
// Contrato: backend/app/routers/revisiones.py. Las colmenas quedan "revisadas"
// cuando se registra su inspección con sesion_revision_id.
import { api } from "./api";

function nuevoIdCliente() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID: UUID v4 aleatorio.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16)
  );
}

export const revisionesService = {
  listar: ({ grupoId, estado } = {}) => {
    const params = new URLSearchParams();
    if (grupoId) params.set("grupo_id", grupoId);
    if (estado) params.set("estado", estado);
    const consulta = params.toString();
    return api.get(consulta ? `/revisiones/?${consulta}` : "/revisiones/");
  },
  obtener: (id) => api.get(`/revisiones/${id}`),
  // id_cliente evita crear dos sesiones si la petición se reintenta.
  iniciar: (grupoId) => api.post("/revisiones/", { grupo_id: grupoId, id_cliente: nuevoIdCliente() }),
  omitir: (id, colmenaId, motivo) =>
    api.post(`/revisiones/${id}/omitir`, { colmena_id: colmenaId, motivo: motivo || null }),
  // Se puede finalizar aunque queden pendientes.
  finalizar: (id) => api.post(`/revisiones/${id}/finalizar`, {}),
};
