import { useMemo } from "react";
import { useConsulta } from "./useConsulta";
import { stockService } from "../services/stockService";
import { armarInventario } from "../utils/stock";

export function useInventario() {
  const consulta = useConsulta(() => stockService.obtenerInventario(), []);
  const inventario = useMemo(
    () => (consulta.datos ? armarInventario(consulta.datos) : null),
    [consulta.datos]
  );
  return {
    inventario,
    // El backend respondió 404: el módulo aún no existe allí.
    noDisponible: !consulta.cargando && !consulta.error && consulta.datos === null,
    cargando: consulta.cargando,
    error: consulta.error,
    recargar: consulta.recargar,
  };
}
