// Una página del historial de movimientos. Igual que en colmenas, se pide un
// registro extra para saber si hay página siguiente.
import { useConsulta } from "./useConsulta";
import { stockService } from "../services/stockService";

export function useMovimientosStock({ filtros, pagina, tamano, version }) {
  const { material, tipo, desde, hasta } = filtros;
  const consulta = useConsulta(
    () => stockService.listarMovimientos({ material, tipo, desde, hasta, offset: (pagina - 1) * tamano, limit: tamano + 1 }),
    [material, tipo, desde, hasta, pagina, tamano, version]
  );
  const recibidos = consulta.datos ?? [];
  return {
    movimientos: recibidos.slice(0, tamano),
    haySiguiente: recibidos.length > tamano,
    noDisponible: !consulta.cargando && !consulta.error && consulta.datos === null,
    cargando: consulta.cargando,
    error: consulta.error,
    recargar: consulta.recargar,
  };
}
