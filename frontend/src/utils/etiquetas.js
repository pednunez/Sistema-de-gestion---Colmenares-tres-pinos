// Traducción de los valores del backend a textos legibles y colores.
// Si el backend agrega un valor nuevo, se agrega aquí y toda la interfaz lo usa.
import { humanizar } from "./formato";

export const TONOS = {
  verde: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ambar: "bg-amber-50 text-amber-800 ring-amber-200",
  rojo: "bg-red-50 text-red-700 ring-red-200",
  azul: "bg-sky-50 text-sky-700 ring-sky-200",
  gris: "bg-slate-100 text-slate-600 ring-slate-200",
};

export const ESTADO_COLMENA = {
  ACTIVA: { texto: "Activa", tono: "verde" },
  EN_OBSERVACION: { texto: "En observación", tono: "ambar" },
  INACTIVA: { texto: "Inactiva", tono: "gris" },
  BAJA: { texto: "Dada de baja", tono: "gris" },
};

export const ESTADO_GENERAL = {
  BUENO: { texto: "Bueno", tono: "verde" },
  REGULAR: { texto: "Regular", tono: "ambar" },
  CRITICO: { texto: "Crítico", tono: "rojo" },
};

export const NIVEL = {
  BAJO: { texto: "Bajo", tono: "gris" },
  MEDIO: { texto: "Medio", tono: "gris" },
  ALTO: { texto: "Alto", tono: "gris" },
};

export const TIPO_MARCO = {
  CRIA: { texto: "Cría" },
  MIEL: { texto: "Miel" },
  POLEN: { texto: "Polen" },
  VACIO: { texto: "Vacío" },
  OTRO: { texto: "Otro" },
};

export const ESTADO_TRATAMIENTO = {
  PLANIFICADO: { texto: "Planificado", tono: "azul" },
  EN_CURSO: { texto: "En curso", tono: "ambar" },
  FINALIZADO: { texto: "Finalizado", tono: "verde" },
  CANCELADO: { texto: "Cancelado", tono: "gris" },
};

export const ROL = {
  ADMIN: { texto: "Administrador", tono: "ambar" },
  APICULTOR: { texto: "Apicultor", tono: "azul" },
};

export const ACCION_AUDITORIA = {
  CREAR: { texto: "Creación", tono: "verde" },
  MODIFICAR: { texto: "Modificación", tono: "azul" },
  ELIMINAR: { texto: "Baja", tono: "rojo" },
  RESTAURAR: { texto: "Restauración", tono: "ambar" },
};

export const ENTIDAD = {
  APIARIO: { texto: "Apiario" },
  COLMENA: { texto: "Colmena" },
  INSPECCION: { texto: "Inspección" },
  TRATAMIENTO: { texto: "Tratamiento" },
  TRANSFERENCIA_MARCO: { texto: "Transferencia de marcos" },
  USUARIO: { texto: "Usuario" },
};

export function texto(mapa, valor, porDefecto = "Sin registrar") {
  if (valor === null || valor === undefined || valor === "") return porDefecto;
  return mapa[valor]?.texto ?? humanizar(valor);
}

export function tono(mapa, valor) {
  return mapa[valor]?.tono ?? "gris";
}

export function opciones(mapa, excluir = []) {
  return Object.entries(mapa)
    .filter(([valor]) => !excluir.includes(valor))
    .map(([valor, { texto: t }]) => ({ valor, texto: t }));
}

export function siNo(valor, porDefecto = "No revisado") {
  if (valor === true) return "Sí";
  if (valor === false) return "No";
  return porDefecto;
}
