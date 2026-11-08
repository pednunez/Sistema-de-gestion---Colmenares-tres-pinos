import {
  ErrorAPI,
  solicitarAPI,
} from './cliente';

import {
  tokenVigente,
} from './auth';

import type {
  SesionMovil,
} from './auth';

// ==========================================
// COLMENARES TRES PINOS
// SERVICIO MOBILE: TRANSFERENCIAS DE MARCOS
// Consume endpoints existentes de FastAPI.
// No modifica Backend ni Frontend.
// ==========================================

export type TipoMarcoTransferencia =
  | 'CRIA'
  | 'MIEL'
  | 'POLEN'
  | 'VACIO'
  | 'OTRO';

export type UbicacionMarcoTransferencia =
  | 'CAMARA_CRIA'
  | 'ALZA';

export type ContenidoMarcoTransferencia =
  | 'MIEL_Y_CRIA'
  | 'SOLO_CRIA'
  | 'SOLO_MIEL'
  | 'CERA_ESTIRADA'
  | 'CERA_ESTAMPADA'
  | 'CERA_UNTADA'
  | 'SIN_MARCO';

// ==========================================
// RESPUESTA DEL SERVIDOR
// ==========================================

export type TransferenciaMarco = {
  id: number;

  colmena_origen_id: number;
  colmena_destino_id: number;
  usuario_id: number;

  cantidad_marcos: number;

  tipo_marco: TipoMarcoTransferencia | null;

  inspeccion_id: number | null;

  ubicacion: UbicacionMarcoTransferencia | null;
  numero_marco: number | null;
  contenido: ContenidoMarcoTransferencia | null;

  ubicacion_destino: UbicacionMarcoTransferencia | null;
  marco_desplazado_numero: number | null;

  motivo: string | null;
  observaciones: string | null;

  fecha_transferencia: string;
  fecha_creacion: string;
};

// ==========================================
// DATOS PARA CREAR TRANSFERENCIA
// ==========================================

export type CrearTransferenciaMarco = {
  colmenaOrigenId: number;
  colmenaDestinoId: number;

  cantidadMarcos: number;

  tipoMarco?: TipoMarcoTransferencia | null;

  inspeccionId?: number | null;

  ubicacion?: UbicacionMarcoTransferencia | null;
  numeroMarco?: number | null;
  contenido?: ContenidoMarcoTransferencia | null;

  ubicacionDestino?: UbicacionMarcoTransferencia | null;
  marcoDesplazadoNumero?: number | null;

  motivo?: string | null;
  observaciones?: string | null;
};

// ==========================================
// VALIDACIONES LOCALES
// ==========================================

function validarDatosTransferencia(
  datos: CrearTransferenciaMarco
): void {

  if (
    !Number.isInteger(datos.colmenaOrigenId) ||
    datos.colmenaOrigenId <= 0
  ) {
    throw new Error(
      'Selecciona una colmena de origen válida.'
    );
  }

  if (
    !Number.isInteger(datos.colmenaDestinoId) ||
    datos.colmenaDestinoId <= 0
  ) {
    throw new Error(
      'Selecciona una colmena de destino válida.'
    );
  }

  if (
    datos.colmenaOrigenId === datos.colmenaDestinoId
  ) {
    throw new Error(
      'La colmena de origen y destino deben ser diferentes.'
    );
  }

  if (
    !Number.isInteger(datos.cantidadMarcos) ||
    datos.cantidadMarcos <= 0
  ) {
    throw new Error(
      'La cantidad de marcos debe ser mayor que cero.'
    );
  }

  const detalle = [
    datos.ubicacion,
    datos.numeroMarco,
    datos.contenido,
  ];

  const tieneDetalle = detalle.some(
    valor => valor !== undefined && valor !== null
  );

  const detalleCompleto = detalle.every(
    valor => valor !== undefined && valor !== null
  );

  if (tieneDetalle && !detalleCompleto) {
    throw new Error(
      'Para identificar un marco debes indicar ubicación, número y contenido.'
    );
  }

  if (tieneDetalle && datos.cantidadMarcos !== 1) {
    throw new Error(
      'Las transferencias de marcos individuales deben tener cantidad igual a 1.'
    );
  }

  if (datos.contenido === 'SIN_MARCO') {
    throw new Error(
      'No se puede transferir una posición SIN_MARCO.'
    );
  }

  if (
    datos.ubicacionDestino != null &&
    !detalleCompleto
  ) {
    throw new Error(
      'La ubicación de destino requiere identificar el marco de origen.'
    );
  }

  if (datos.marcoDesplazadoNumero != null) {

    if (datos.ubicacionDestino == null) {
      throw new Error(
        'Para indicar un marco desplazado debes seleccionar la ubicación de destino.'
      );
    }

    if (datos.cantidadMarcos !== 1) {
      throw new Error(
        'El desplazamiento requiere transferir un solo marco.'
      );
    }
  }

  if (
    datos.numeroMarco != null &&
    (
      !Number.isInteger(datos.numeroMarco) ||
      datos.numeroMarco < 1 ||
      datos.numeroMarco > 10
    )
  ) {
    throw new Error(
      'El número del marco debe estar entre 1 y 10.'
    );
  }

  if (
    datos.marcoDesplazadoNumero != null &&
    (
      !Number.isInteger(datos.marcoDesplazadoNumero) ||
      datos.marcoDesplazadoNumero < 1 ||
      datos.marcoDesplazadoNumero > 10
    )
  ) {
    throw new Error(
      'El número del marco desplazado debe estar entre 1 y 10.'
    );
  }

  if (
    datos.motivo != null &&
    datos.motivo.length > 255
  ) {
    throw new Error(
      'El motivo no puede superar los 255 caracteres.'
    );
  }
}

// ==========================================
// CONSTRUIR BODY PARA FASTAPI
// ==========================================

function construirBody(
  datos: CrearTransferenciaMarco,
  sesion: SesionMovil
) {
  return {
    colmena_origen_id: datos.colmenaOrigenId,
    colmena_destino_id: datos.colmenaDestinoId,

    usuario_id: sesion.usuario.id,

    cantidad_marcos: datos.cantidadMarcos,

    tipo_marco: datos.tipoMarco ?? null,

    inspeccion_id: datos.inspeccionId ?? null,

    ubicacion: datos.ubicacion ?? null,
    numero_marco: datos.numeroMarco ?? null,
    contenido: datos.contenido ?? null,

    ubicacion_destino: datos.ubicacionDestino ?? null,

    marco_desplazado_numero:
      datos.marcoDesplazadoNumero ?? null,

    motivo: datos.motivo?.trim() || null,

    observaciones:
      datos.observaciones?.trim() || null,
  };
}

// ==========================================
// VALIDAR SESIÓN
// ==========================================

function obtenerTokenVigente(
  sesion: SesionMovil
): string {

  if (!sesion.accessToken) {
    throw new ErrorAPI(
      401,
      'No existe un token de autenticación. Inicia sesión nuevamente.'
    );
  }

  if (!tokenVigente(sesion)) {
    throw new ErrorAPI(
      401,
      'La sesión ha vencido. Inicia sesión nuevamente.'
    );
  }

  return sesion.accessToken;
}

// ==========================================
// LISTAR TRANSFERENCIAS
// GET /transferencias-marcos/
// ==========================================

export async function listarTransferencias(
  sesion: SesionMovil
): Promise<TransferenciaMarco[]> {

  const token = obtenerTokenVigente(sesion);

  return solicitarAPI<TransferenciaMarco[]>(
    '/transferencias-marcos/',
    {
      method: 'GET',
      token,
    }
  );
}

// ==========================================
// OBTENER TRANSFERENCIA POR ID
// GET /transferencias-marcos/{id}
// ==========================================

export async function obtenerTransferencia(
  transferenciaId: number,
  sesion: SesionMovil
): Promise<TransferenciaMarco> {

  if (
    !Number.isInteger(transferenciaId) ||
    transferenciaId <= 0
  ) {
    throw new Error(
      'El identificador de transferencia no es válido.'
    );
  }

  const token = obtenerTokenVigente(sesion);

  return solicitarAPI<TransferenciaMarco>(
    `/transferencias-marcos/${transferenciaId}`,
    {
      method: 'GET',
      token,
    }
  );
}

// ==========================================
// CREAR TRANSFERENCIA MANUAL
// POST /transferencias-marcos/
// ==========================================

export async function crearTransferencia(
  datos: CrearTransferenciaMarco,
  sesion: SesionMovil
): Promise<TransferenciaMarco> {

  validarDatosTransferencia(datos);

  const token = obtenerTokenVigente(sesion);

  const body = construirBody(datos, sesion);

  return solicitarAPI<TransferenciaMarco>(
    '/transferencias-marcos/',
    {
      method: 'POST',
      body,
      token,
    }
  );
}