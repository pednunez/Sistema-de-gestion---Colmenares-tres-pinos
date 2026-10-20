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

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export const MAXIMO_POR_MOVIMIENTO = 10000;
const SOBRE_DANADO = ["REPARACION", "DESCARTE"];

// Los marcos con cera no llevan dañados propios: no se reparan ni se descartan.
export function materialesPara(tipo) {
  return Object.entries(MATERIAL_STOCK)
    .filter(([, info]) => !SOBRE_DANADO.includes(tipo) || info.puedeDanarse)
    .map(([valor, info]) => ({ valor, texto: info.texto }));
}

// Cuánto hay del lado que el movimiento descuenta (null si solo suma).
export function existenciaQueDescuenta(item, tipo) {
  if (!item || tipo === "INGRESO") return null;
  return SOBRE_DANADO.includes(tipo) ? item.danado : item.disponible;
}

// Cómo queda el material después del movimiento, para mostrarlo antes de guardar.
export function stockResultante(item, tipo, cantidad) {
  const n = Number(cantidad);
  if (!item || !Number.isInteger(n) || n <= 0) return null;
  const { disponible, danado } = item;
  switch (tipo) {
    case "INGRESO":
      return { disponible: disponible + n, danado };
    case "ENVIO":
      return { disponible: disponible - n, danado };
    case "DANO":
      // Un marco con cera roto se cuenta como marco roto (MARCO_VACIO dañado).
      return { disponible: disponible - n, danado: item.puedeDanarse ? danado + n : danado };
    case "REPARACION":
      return { disponible: disponible + n, danado: danado - n };
    case "DESCARTE":
      return { disponible, danado: danado - n };
    default:
      return null;
  }
}

export function validarMovimiento(v, inventario) {
  const item = inventario?.items.find((i) => i.material === v.material);
  const cantidad = Number(v.cantidad);
  const existencia = existenciaQueDescuenta(item, v.tipo);

  let errorCantidad;
  if (v.cantidad === "" || v.cantidad === null) errorCantidad = "Ingresa la cantidad.";
  else if (!Number.isInteger(cantidad) || cantidad <= 0) errorCantidad = "La cantidad debe ser un número entero mayor que 0.";
  else if (cantidad > MAXIMO_POR_MOVIMIENTO) errorCantidad = `La cantidad no puede superar ${MAXIMO_POR_MOVIMIENTO}.`;
  else if (existencia !== null && cantidad > existencia) {
    errorCantidad = SOBRE_DANADO.includes(v.tipo)
      ? `Solo hay ${cantidadCon(existencia, item.unidad)} por reparar.`
      : `Solo hay ${cantidadCon(existencia, item.unidad)} disponible${existencia === 1 ? "" : "s"}.`;
  }

  return {
    tipo: !v.tipo && "Elige el tipo de movimiento.",
    material: !v.material
      ? "Elige el material."
      : SOBRE_DANADO.includes(v.tipo) && !MATERIAL_STOCK[v.material]?.puedeDanarse
        ? "Este material no lleva dañados: si se rompe, cuenta como marco roto."
        : undefined,
    cantidad: errorCantidad,
    apiario_id: v.tipo === "ENVIO" && !v.apiario_id && "Elige el apiario de destino.",
    observaciones: v.observaciones.length > 500 && "Las observaciones no pueden superar los 500 caracteres.",
  };
}

export function movimientoParaEnviar(v) {
  const esEnvio = v.tipo === "ENVIO";
  const observaciones = v.observaciones.trim();
  return {
    material: v.material,
    tipo: v.tipo,
    cantidad: Number(v.cantidad),
    apiario_id: esEnvio && v.apiario_id ? Number(v.apiario_id) : null,
    colmena_id: esEnvio && v.colmena_id ? Number(v.colmena_id) : null,
    observaciones: observaciones || null,
  };
}
