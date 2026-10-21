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

// Cantidad de miel observada en la inspección (RF-27). El backend guarda texto
// libre; se usa esta escala para que los registros sean comparables.
export const NIVEL_MIEL = {
  SIN_MIEL: { texto: "Sin miel" },
  POCA: { texto: "Poca" },
  MEDIA: { texto: "Media" },
  ABUNDANTE: { texto: "Abundante" },
};

// Contenido de cada marco al revisarlo en una inspección.
export const CONTENIDO_MARCO = {
  MIEL_Y_CRIA: { texto: "Miel y cría" },
  SOLO_CRIA: { texto: "Solo cría" },
  SOLO_MIEL: { texto: "Solo miel" },
  CERA_ESTIRADA: { texto: "Cera estirada" },
  CERA_ESTAMPADA: { texto: "Cera estampada" },
  CERA_UNTADA: { texto: "Cera untada" },
  SIN_MARCO: { texto: "Sin marco" },
};

export const UBICACION_MARCO = {
  CAMARA_CRIA: { texto: "Cámara de cría" },
  ALZA: { texto: "Alza" },
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

// Materiales de la bodega central (módulo Stock). "puedeDanarse" indica si el
// material pasa por dañado, reparación y merma. Un marco con cera que se rompe
// se cuenta como marco roto (MARCO_VACIO dañado). El cajón lleva piso; el alza no.
export const MATERIAL_STOCK = {
  CAJON: { texto: "Cajones", unidad: "cajón", plural: "cajones", puedeDanarse: true },
  ALZA: { texto: "Alzas", unidad: "alza", plural: "alzas", puedeDanarse: true },
  PISO: { texto: "Pisos", unidad: "piso", plural: "pisos", puedeDanarse: true },
  TECHO: { texto: "Techos", unidad: "techo", plural: "techos", puedeDanarse: true },
  TECHO_AMERICANO: { texto: "Techos americanos", unidad: "techo americano", plural: "techos americanos", puedeDanarse: true },
  ENTRETAPA: { texto: "Entretapas", unidad: "entretapa", plural: "entretapas", puedeDanarse: true },
  MARCO_VACIO: { texto: "Marcos vacíos", textoDanado: "Marcos rotos", unidad: "marco", plural: "marcos", puedeDanarse: true },
  MARCO_CERA_ESTIRADA: { texto: "Marcos con cera estirada", unidad: "marco", plural: "marcos", puedeDanarse: false },
  MARCO_CERA_UNTADA: { texto: "Marcos con cera untada", unidad: "marco", plural: "marcos", puedeDanarse: false },
};

// Movimientos de stock. Cada unidad está en un solo estado:
// disponible → dañado → en reparación → disponible, o a merma si no tiene arreglo.
// "signo" es el efecto sobre lo usable (disponible).
export const TIPO_MOVIMIENTO_STOCK = {
  INGRESO: { texto: "Ingreso", tono: "verde", signo: "+", ayuda: "Compra o fabricación: suma al disponible." },
  ENVIO: { texto: "Salida", tono: "azul", signo: "−", ayuda: "Material que sale de bodega hacia las colmenas: resta del disponible." },
  DANO: { texto: "Daño", tono: "rojo", signo: "−", ayuda: "Material que se rompió: deja de estar disponible y pasa a dañado." },
  ENVIO_REPARACION: { texto: "A reparación", tono: "ambar", signo: "", ayuda: "Material dañado que se lleva a reparar: pasa de dañado a en reparación." },
  REPARACION: { texto: "Reparado", tono: "verde", signo: "+", ayuda: "Material que volvió reparado: pasa de en reparación a disponible." },
  DESCARTE: { texto: "Merma", tono: "gris", signo: "", ayuda: "Material sin arreglo que se bota: sale de dañado o de en reparación." },
};

// Desde dónde sale la merma.
export const ORIGEN_MERMA = {
  DANADO: { texto: "Dañado" },
  EN_REPARACION: { texto: "En reparación" },
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
