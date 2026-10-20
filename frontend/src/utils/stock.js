// Arma el inventario completo a partir de la respuesta del backend: siempre
// aparecen todos los materiales, aunque el backend no traiga alguno.
import { MATERIAL_STOCK } from "./etiquetas";

const entero = (valor) => (Number.isFinite(Number(valor)) ? Math.max(0, Math.trunc(Number(valor))) : 0);

export function armarInventario(filas = []) {
  const porMaterial = new Map(filas.map((fila) => [fila.material, fila]));
  const items = Object.entries(MATERIAL_STOCK).map(([material, info]) => {
    const fila = porMaterial.get(material) ?? {};
    return {
      material,
      ...info,
      disponible: entero(fila.disponible),
      danado: info.puedeDanarse ? entero(fila.danado) : 0,
      actualizadoEn: fila.actualizado_en ?? null,
    };
  });

  const marcos = items.filter((i) => i.material.startsWith("MARCO_"));
  return {
    items,
    totalDisponible: items.reduce((suma, i) => suma + i.disponible, 0),
    totalDanado: items.reduce((suma, i) => suma + i.danado, 0),
    marcosListos: marcos.reduce((suma, i) => suma + i.disponible, 0),
    danados: items.filter((i) => i.danado > 0),
  };
}

export function cantidadCon(cantidad, unidad) {
  return `${cantidad} ${cantidad === 1 ? unidad : `${unidad}s`}`;
}
