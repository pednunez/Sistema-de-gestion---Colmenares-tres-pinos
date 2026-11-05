// Datos derivados de una inspección para su vista de detalle (PB-10).
import { MARCOS_POR_CAJA } from "./marcos";

const mismoDia = (a, b) => {
  const fa = new Date(a);
  const fb = new Date(b);
  return (
    !Number.isNaN(fa.getTime()) &&
    !Number.isNaN(fb.getTime()) &&
    fa.getFullYear() === fb.getFullYear() &&
    fa.getMonth() === fb.getMonth() &&
    fa.getDate() === fb.getDate()
  );
};

// Transferencias hechas durante la inspección. Si el backend guarda
// inspeccion_id se usa ese vínculo; si no, se relacionan por colmena de origen
// y día, y se informa que la relación es aproximada.
export function transferenciasDeInspeccion(inspeccion, transferencias = []) {
  const vinculadas = transferencias.filter((t) => t.inspeccion_id === inspeccion.id);
  if (vinculadas.length > 0) return { lista: vinculadas, aproximada: false };
  const porFecha = transferencias.filter(
    (t) =>
      t.inspeccion_id == null &&
      t.colmena_origen_id === inspeccion.colmena_id &&
      mismoDia(t.fecha_transferencia, inspeccion.fecha_inspeccion)
  );
  return { lista: porFecha, aproximada: porFecha.length > 0 };
}

// Agrupa el detalle por marco en cajas de 10 posiciones, en orden.
// Devuelve [] si el backend no envía el detalle.
export function cajasDeInspeccion(inspeccion) {
  const marcos = Array.isArray(inspeccion.marcos) ? inspeccion.marcos : [];
  const ubicaciones = ["CAMARA_CRIA", "ALZA"].filter((u) => marcos.some((m) => m.ubicacion === u));
  return ubicaciones.map((ubicacion) => ({
    ubicacion,
    marcos: Array.from({ length: MARCOS_POR_CAJA }, (_, i) => {
      const numero = i + 1;
      return marcos.find((m) => m.ubicacion === ubicacion && m.numero === numero) ?? { ubicacion, numero, contenido: null };
    }),
  }));
}
