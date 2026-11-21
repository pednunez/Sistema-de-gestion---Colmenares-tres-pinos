import { solicitarAPI } from './cliente';

export type EstadoColmenaApi =
  | 'ACTIVA'
  | 'EN_OBSERVACION'
  | 'INACTIVA'
  | 'BAJA';

export type ColmenaApi = {
  id: number;
  apiario_id: number;
  codigo: string;
  codigo_qr: string;
  estado: EstadoColmenaApi;
  fecha_instalacion: string | null;
  cantidad_marcos: number;
  observaciones: string | null;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  fecha_eliminacion: string | null;
};

export type ColmenaCrear = {
  apiario_id: number;
  codigo: string;
  estado?: Exclude<EstadoColmenaApi, 'BAJA'>;
  fecha_instalacion?: string | null;
  cantidad_marcos?: number;
  observaciones?: string | null;
};

export type ColmenaActualizar = {
  apiario_id?: number;
  codigo?: string;
  estado?: Exclude<EstadoColmenaApi, 'BAJA'>;
  fecha_instalacion?: string | null;
  cantidad_marcos?: number;
  observaciones?: string | null;
};

export type FiltrosColmenas = {
  apiarioId?: number;
  estado?: EstadoColmenaApi;
  codigo?: string;
  offset?: number;
  limit?: number;
  orden?: 'id' | 'codigo';
};

export type ColmenaSinRevisionApi = ColmenaApi & {
  ultima_inspeccion: string | null;
  dias_sin_revision: number | null;
};

// LISTAR COLMENAS

export function listarColmenas(
  token: string,
  filtros: FiltrosColmenas = {}
) {
  const parametros = new URLSearchParams();

  if (filtros.apiarioId) {
    parametros.set('apiario_id', String(filtros.apiarioId));
  }

  if (filtros.estado) {
    parametros.set('estado', filtros.estado);
  }

  if (filtros.codigo?.trim()) {
    parametros.set('codigo', filtros.codigo.trim());
  }

  if (filtros.offset !== undefined) {
    parametros.set('offset', String(filtros.offset));
  }

  if (filtros.limit !== undefined) {
    parametros.set('limit', String(filtros.limit));
  }

  if (filtros.orden) {
    parametros.set('orden', filtros.orden);
  }

  const query = parametros.toString();

  return solicitarAPI<ColmenaApi[]>(
    `/colmenas/${query ? `?${query}` : ''}`,
    { method: 'GET', token }
  );
}

// OBTENER UNA COLMENA

export function obtenerColmena(
  id: number,
  token: string
) {
  return solicitarAPI<ColmenaApi>(
    `/colmenas/${id}`,
    { method: 'GET', token }
  );
}

// COLMENAS SIN REVISION

export function listarColmenasSinRevision(
  token: string,
  dias = 30,
  apiarioId?: number
) {
  const parametros = new URLSearchParams({
    dias: String(dias),
  });

  if (apiarioId) {
    parametros.set('apiario_id', String(apiarioId));
  }

  return solicitarAPI<ColmenaSinRevisionApi[]>(
    `/colmenas/sin-revision?${parametros.toString()}`,
    { method: 'GET', token }
  );
}

// CREAR COLMENA

export function crearColmena(
  datos: ColmenaCrear,
  token: string
) {
  return solicitarAPI<ColmenaApi>(
    '/colmenas/',
    {
      method: 'POST',
      body: datos,
      token,
    }
  );
}

// ACTUALIZAR COLMENA

export function actualizarColmena(
  id: number,
  datos: ColmenaActualizar,
  token: string
) {
  return solicitarAPI<ColmenaApi>(
    `/colmenas/${id}`,
    {
      method: 'PATCH',
      body: datos,
      token,
    }
  );
}

// DAR DE BAJA COLMENA

export function darDeBajaColmena(
  id: number,
  token: string
) {
  return solicitarAPI<ColmenaApi>(
    `/colmenas/${id}`,
    {
      method: 'DELETE',
      token,
    }
  );
}

// CONSULTAR POR QR

export function obtenerColmenaPorQr(
  codigoQr: string,
  token: string
) {
  return solicitarAPI<ColmenaApi>(
    `/colmenas/qr/${codigoQr}`,
    {
      method: 'GET',
      token,
    }
  );
}


// ASOCIAR UNA ETIQUETA QR EXISTENTE O GENERAR UNA NUEVA (solo ADMIN).
// codigoQr = null solicita al backend que genere un UUID nuevo.
export function asociarQrColmena(
  id: number,
  codigoQr: string | null,
  token: string
) {
  return solicitarAPI<ColmenaApi>(`/colmenas/${id}/qr`, {
    method: 'PUT',
    body: { codigo_qr: codigoQr },
    token,
  });
}
