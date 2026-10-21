// Inventario de la bodega central y reglas de sus movimientos.
// Cada unidad está en un solo estado: disponible, dañado, en reparación o merma.
import { MATERIAL_STOCK } from "./etiquetas";

const minimoONulo = (valor) =>
  valor === null || valor === undefined || valor === "" || !Number.isFinite(Number(valor))
    ? null
    : Math.max(0, Math.trunc(Number(valor)));

const entero = (valor) => (Number.isFinite(Number(valor)) ? Math.max(0, Math.trunc(Number(valor))) : 0);
const sumar = (items, campo) => items.reduce((suma, i) => suma + i[campo], 0);

// Siempre aparecen todos los materiales, aunque el backend no traiga alguno.
export function armarInventario(filas = []) {
  const porMaterial = new Map(filas.map((fila) => [fila.material, fila]));
  const items = Object.entries(MATERIAL_STOCK).map(([material, info]) => {
    const fila = porMaterial.get(material) ?? {};
    const conEstados = info.puedeDanarse;
    const item = {
      material,
      ...info,
      disponible: entero(fila.disponible),
      danado: conEstados ? entero(fila.danado) : 0,
      enReparacion: conEstados ? entero(fila.en_reparacion) : 0,
      merma: conEstados ? entero(fila.merma) : 0,
      minimo: minimoONulo(fila.minimo),
      actualizadoEn: fila.actualizado_en ?? null,
    };
    // Stock bajo: el disponible quedó por debajo del mínimo definido.
    item.bajoMinimo = item.minimo !== null && item.disponible < item.minimo;
    return item;
  });

  const marcos = items.filter((i) => i.material.startsWith("MARCO_"));
  return {
    items,
    totalDisponible: sumar(items, "disponible"),
    totalDanado: sumar(items, "danado"),
    totalEnReparacion: sumar(items, "enReparacion"),
    totalMerma: sumar(items, "merma"),
    marcosListos: sumar(marcos, "disponible"),
    conPendientes: items.filter((i) => i.danado > 0 || i.enReparacion > 0),
    bajos: items.filter((i) => i.bajoMinimo),
  };
}

// "3 alzas", "1 cajón", "2 cajones".
export function cantidadCon(cantidad, item) {
  return `${cantidad} ${cantidad === 1 ? item.unidad : item.plural}`;
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

export const MAXIMO_POR_MOVIMIENTO = 10000;
// Movimientos que solo aplican a material que pasa por dañado y reparación.
const CON_ESTADOS = ["ENVIO_REPARACION", "REPARACION", "DESCARTE"];

export function materialesPara(tipo) {
  return Object.entries(MATERIAL_STOCK)
    .filter(([, info]) => !CON_ESTADOS.includes(tipo) || info.puedeDanarse)
    .map(([valor, info]) => ({ valor, texto: info.texto }));
}

// Estado del que descuenta el movimiento (null si solo suma).
export function estadoQueDescuenta(tipo, origen) {
  switch (tipo) {
    case "ENVIO":
    case "DANO":
      return "disponible";
    case "ENVIO_REPARACION":
      return "danado";
    case "REPARACION":
      return "enReparacion";
    case "DESCARTE":
      return origen === "EN_REPARACION" ? "enReparacion" : origen === "DANADO" ? "danado" : null;
    default:
      return null;
  }
}

const NOMBRE_ESTADO = { disponible: "disponibles", danado: "por reparar", enReparacion: "en reparación" };

export function textoExistencia(item, estado) {
  return `${cantidadCon(item[estado], item)} ${NOMBRE_ESTADO[estado]}`;
}

// Cómo queda el material después del movimiento, para mostrarlo antes de guardar.
export function stockResultante(item, tipo, cantidad, origen) {
  const n = Number(cantidad);
  if (!item || !Number.isInteger(n) || n <= 0) return null;
  const r = { disponible: item.disponible, danado: item.danado, enReparacion: item.enReparacion, merma: item.merma };
  switch (tipo) {
    case "INGRESO":
      r.disponible += n;
      break;
    case "ENVIO":
      r.disponible -= n;
      break;
    case "DANO":
      r.disponible -= n;
      // Un marco con cera roto se suma a los marcos rotos, no a su propio material.
      if (item.puedeDanarse) r.danado += n;
      break;
    case "ENVIO_REPARACION":
      r.danado -= n;
      r.enReparacion += n;
      break;
    case "REPARACION":
      r.enReparacion -= n;
      r.disponible += n;
      break;
    case "DESCARTE": {
      const estado = estadoQueDescuenta(tipo, origen);
      if (!estado) return null;
      r[estado] -= n;
      r.merma += n;
      break;
    }
    default:
      return null;
  }
  return r;
}

export function validarMovimiento(v, inventario) {
  const item = inventario?.items.find((i) => i.material === v.material);
  const cantidad = Number(v.cantidad);
  const estado = estadoQueDescuenta(v.tipo, v.estado_origen);

  let errorCantidad;
  if (v.cantidad === "" || v.cantidad === null) errorCantidad = "Ingresa la cantidad.";
  else if (!Number.isInteger(cantidad) || cantidad <= 0) errorCantidad = "La cantidad debe ser un número entero mayor que 0.";
  else if (cantidad > MAXIMO_POR_MOVIMIENTO) errorCantidad = `La cantidad no puede superar ${MAXIMO_POR_MOVIMIENTO}.`;
  else if (item && estado && cantidad > item[estado]) errorCantidad = `Solo hay ${textoExistencia(item, estado)}.`;

  return {
    tipo: !v.tipo && "Elige el tipo de movimiento.",
    material: !v.material
      ? "Elige el material."
      : CON_ESTADOS.includes(v.tipo) && !MATERIAL_STOCK[v.material]?.puedeDanarse
        ? "Este material no pasa por reparación: si se rompe, cuenta como marco roto."
        : undefined,
    cantidad: errorCantidad,
    estado_origen: v.tipo === "DESCARTE" && !v.estado_origen && "Indica si la merma sale de dañado o de en reparación.",
    observaciones: v.observaciones.length > 500 && "Las observaciones no pueden superar los 500 caracteres.",
  };
}

export function movimientoParaEnviar(v) {
  const esSalida = v.tipo === "ENVIO";
  const observaciones = v.observaciones.trim();
  return {
    material: v.material,
    tipo: v.tipo,
    cantidad: Number(v.cantidad),
    // El destino de una salida es opcional: el stock es de la bodega central.
    apiario_id: esSalida && v.apiario_id ? Number(v.apiario_id) : null,
    colmena_id: esSalida && v.colmena_id ? Number(v.colmena_id) : null,
    estado_origen: v.tipo === "DESCARTE" ? v.estado_origen : null,
    observaciones: observaciones || null,
  };
}

// ---------------------------------------------------------------------------
// Mínimos
// ---------------------------------------------------------------------------

export function validarMinimo(valor) {
  if (valor === "") return undefined; // vacío = sin mínimo
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) return "El mínimo debe ser un número entero de 0 o más.";
  if (n > MAXIMO_POR_MOVIMIENTO) return `El mínimo no puede superar ${MAXIMO_POR_MOVIMIENTO}.`;
  return undefined;
}

export function textoStockBajo(item) {
  return `${item.texto}: ${item.disponible} de un mínimo de ${item.minimo}`;
}
