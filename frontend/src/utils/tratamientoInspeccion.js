// Tratamiento que se registra junto con una inspección (signos de enfermedad).
import { hoyISO } from "./formato";
import { textoONulo } from "./validacion";

export const TRATAMIENTO_VACIO = {
  tipo_tratamiento: "",
  producto: "",
  dosis: "",
  estado: "EN_CURSO",
  fecha_fin: "",
  observaciones: "",
};

// Mensaje de error del tratamiento, o "" si está bien.
export function validarTratamiento(t) {
  const tipo = t.tipo_tratamiento.trim();
  if (tipo.length < 2) return "Indica el tipo de tratamiento.";
  if (tipo.length > 100) return "El tipo de tratamiento admite hasta 100 caracteres.";
  if (t.fecha_fin && t.fecha_fin < hoyISO()) return "La fecha de término no puede ser anterior a hoy.";
  return "";
}

// Datos para POST /tratamientos/. La colmena y la inspección se agregan al guardar.
export function tratamientoParaEnviar(t, { motivo, tiras }) {
  return {
    tipo_tratamiento: t.tipo_tratamiento.trim(),
    producto: textoONulo(t.producto),
    dosis: textoONulo(t.dosis) ?? (tiras ? `${tiras} ${tiras === 1 ? "tira" : "tiras"}` : null),
    motivo: textoONulo(motivo),
    fecha_inicio: hoyISO(),
    fecha_fin: t.estado === "FINALIZADO" ? t.fecha_fin || hoyISO() : t.fecha_fin || null,
    estado: t.estado,
    observaciones: textoONulo(t.observaciones),
  };
}
