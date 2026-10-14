// Pide al backend una página del listado de colmenas, filtrada por apiario.
// El backend no informa el total, así que se pide un registro extra para
// saber si existe una página siguiente.
import { useConsulta } from "./useConsulta";
import { colmenasService } from "../services/colmenasService";

export function usePaginaColmenas({ apiarioId, pagina, tamano, activo = true }) {
  const consulta = useConsulta(
    () =>
      activo
        ? colmenasService.listarPagina({ apiarioId, offset: (pagina - 1) * tamano, limit: tamano + 1 })
        : Promise.resolve(null),
    [apiarioId, pagina, tamano, activo]
  );

  const recibidas = consulta.datos ?? [];
  return {
    colmenas: recibidas.slice(0, tamano),
    haySiguiente: recibidas.length > tamano,
    cargando: activo && consulta.cargando,
    error: consulta.error,
    recargar: consulta.recargar,
  };
}
