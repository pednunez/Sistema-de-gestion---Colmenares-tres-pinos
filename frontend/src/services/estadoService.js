// Estado del servidor (S1-T06). GET /health es público y responde {"status": "ok"}.
import { api } from "./api.js";

export const ESTADO_SERVIDOR = {
  VERIFICANDO: "VERIFICANDO",
  EN_LINEA: "EN_LINEA",
  CON_PROBLEMAS: "CON_PROBLEMAS",
  SIN_CONEXION: "SIN_CONEXION",
};

export const estadoService = {
  async consultar() {
    try {
      const respuesta = await api.sondear("/health");
      return respuesta?.status === "ok" ? ESTADO_SERVIDOR.EN_LINEA : ESTADO_SERVIDOR.CON_PROBLEMAS;
    } catch (err) {
      // Estado 0: la petición no llegó al servidor. Cualquier otro: respondió con error.
      return err.estado === 0 ? ESTADO_SERVIDOR.SIN_CONEXION : ESTADO_SERVIDOR.CON_PROBLEMAS;
    }
  },
};
