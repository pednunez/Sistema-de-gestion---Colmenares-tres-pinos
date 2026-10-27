import { useConsulta } from "./useConsulta";
import { gruposService } from "../services/gruposService";

// Grupos activos, de todos los apiarios o de uno. "version" fuerza una nueva consulta.
export function useGrupos({ apiarioId = "", version = 0 } = {}) {
  const consulta = useConsulta(() => gruposService.listar({ apiarioId }), [apiarioId, version]);
  return {
    grupos: consulta.datos ?? [],
    cargando: consulta.cargando,
    error: consulta.error,
    recargar: consulta.recargar,
  };
}
