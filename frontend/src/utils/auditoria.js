import { formatearFechaHora, humanizar } from "./formato";
import { ESTADO_COLMENA, ESTADO_GENERAL, ESTADO_TRATAMIENTO, NIVEL, ROL, TIPO_MARCO } from "./etiquetas";

const VALORES_CONOCIDOS = { ...NIVEL, ...TIPO_MARCO, ...ROL, ...ESTADO_GENERAL, ...ESTADO_TRATAMIENTO, ...ESTADO_COLMENA };

const NOMBRES_CAMPO = {
  nombre: "Nombre",
  apellido: "Apellido",
  email: "Correo",
  rol: "Rol",
  ubicacion: "Ubicación",
  descripcion: "Descripción",
  codigo: "Código",
  codigo_qr: "Código QR",
  estado: "Estado",
  estado_general: "Estado general",
  fecha_instalacion: "Fecha de instalación",
  observaciones: "Observaciones",
  activo: "Activo",
  apiario_id: "Apiario",
  colmena_id: "Colmena",
  colmena_origen_id: "Colmena de origen",
  colmena_destino_id: "Colmena de destino",
  usuario_id: "Responsable",
  inspeccion_id: "Inspección asociada",
  reina_observada: "Reina observada",
  presencia_cria: "Presencia de cría",
  nivel_poblacion: "Población",
  reservas_alimento: "Reservas de alimento",
  signos_enfermedad: "Signos de enfermedad",
  enfermedad_observada: "Enfermedad observada",
  tipo_tratamiento: "Tipo de tratamiento",
  producto: "Producto",
  dosis: "Dosis",
  motivo: "Motivo",
  fecha_inicio: "Fecha de inicio",
  fecha_fin: "Fecha de término",
  cantidad_marcos: "Cantidad de marcos",
  tipo_marco: "Tipo de marco",
  fecha_inspeccion: "Fecha de inspección",
  fecha_transferencia: "Fecha de transferencia",
  fecha_eliminacion: "Fecha de baja",
};

const CAMPOS_TECNICOS = ["id", "fecha_creacion", "fecha_actualizacion", "password_hash"];

export function nombreCampo(campo) {
  return NOMBRES_CAMPO[campo] ?? humanizar(campo.toUpperCase());
}

export function valorLegible(campo, valor, buscar) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (campo === "apiario_id") return buscar.nombreApiario(valor);
  if (campo.startsWith("colmena")) return buscar.codigoColmena(valor);
  if (campo === "usuario_id") return buscar.nombreUsuario(valor);
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T/.test(valor)) return formatearFechaHora(valor);
  if (typeof valor === "object") return JSON.stringify(valor);
  return VALORES_CONOCIDOS[valor]?.texto ?? humanizar(valor);
}

// Devuelve solo los campos que cambiaron entre el antes y el después.
export function calcularCambios(registro) {
  const antes = registro.datos_anteriores ?? {};
  const despues = registro.datos_nuevos ?? {};
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]);

  return [...campos]
    .filter((campo) => !CAMPOS_TECNICOS.includes(campo))
    .filter((campo) => registro.datos_anteriores === null || JSON.stringify(antes[campo]) !== JSON.stringify(despues[campo]))
    .map((campo) => ({ campo, antes: antes[campo], despues: despues[campo] }));
}
