
import { solicitarAPI } from './cliente';

// ==========================================
// APIARIOS - SERVICIO MOBILE
// ==========================================

export type Apiario = {
  id: number;
  nombre: string;
  ubicacion: string | null;
  descripcion: string | null;
  activo: boolean;
  fecha_creacion?: string | null;
  fecha_actualizacion?: string | null;
  fecha_eliminacion?: string | null;
};

export type ApiarioCrear = {
  nombre: string;
  ubicacion: string | null;
  descripcion: string | null;
};

export type ApiarioActualizar = {
  nombre?: string;
  ubicacion?: string | null;
  descripcion?: string | null;
};

// ==========================================
// LISTAR APIARIOS
// ==========================================

export function listarApiarios(token: string) {
  return solicitarAPI<Apiario[]>(
    '/apiarios/',
    {
      method: 'GET',
      token,
    }
  );
}

// ==========================================
// OBTENER DETALLE
// ==========================================

export function obtenerApiario(
  id: number,
  token: string
) {
  return solicitarAPI<Apiario>(
    `/apiarios/${id}`,
    {
      method: 'GET',
      token,
    }
  );
}

// ==========================================
// CREAR APIARIO
// ==========================================

export function crearApiario(
  datos: ApiarioCrear,
  token: string
) {
  return solicitarAPI<Apiario>(
    '/apiarios/',
    {
      method: 'POST',
      body: datos,
      token,
    }
  );
}

// ==========================================
// ACTUALIZAR APIARIO
// ==========================================

export function actualizarApiario(
  id: number,
  datos: ApiarioActualizar,
  token: string
) {
  return solicitarAPI<Apiario>(
    `/apiarios/${id}`,
    {
      method: 'PATCH',
      body: datos,
      token,
    }
  );
}

// ==========================================
// DAR DE BAJA
// ==========================================

export function darDeBajaApiario(
  id: number,
  token: string
) {
  return solicitarAPI<Apiario>(
    `/apiarios/${id}`,
    {
      method: 'DELETE',
      token,
    }
  );
}
