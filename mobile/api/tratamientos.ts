import { solicitarAPI } from './cliente';
import type { EstadoTratamiento } from '../database/tratamientos';

export type TratamientoApi = {
  id: number;
  id_cliente: string | null;
  colmena_id: number;
  inspeccion_id: number | null;
  usuario_id: number;
  tipo_tratamiento: string;
  producto: string | null;
  dosis: string | null;
  motivo: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: EstadoTratamiento;
  observaciones: string | null;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
};

export type TratamientoCrearApi = {
  colmena_id: number;
  inspeccion_id: number | null;
  usuario_id: number;
  tipo_tratamiento: string;
  producto: string | null;
  dosis: string | null;
  motivo: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: EstadoTratamiento;
  observaciones: string | null;
  id_cliente?: string;
};

export type TratamientoUpdateApi = Partial<{
  tipo_tratamiento: string;
  producto: string | null;
  dosis: string | null;
  motivo: string | null;
  fecha_fin: string | null;
  estado: EstadoTratamiento;
  observaciones: string | null;
}>;

export function listarTratamientos(token: string) {
  return solicitarAPI<TratamientoApi[]>('/tratamientos/', {
    method: 'GET',
    token,
  });
}

export function crearTratamiento(datos: TratamientoCrearApi, token: string) {
  return solicitarAPI<TratamientoApi>('/tratamientos/', {
    method: 'POST',
    body: datos,
    token,
  });
}

export function actualizarTratamiento(
  id: number,
  datos: TratamientoUpdateApi,
  token: string
) {
  return solicitarAPI<TratamientoApi>(`/tratamientos/${id}`, {
    method: 'PATCH',
    body: datos,
    token,
  });
}

export function cancelarTratamiento(id: number, token: string) {
  return solicitarAPI<TratamientoApi>(`/tratamientos/${id}`, {
    method: 'DELETE',
    token,
  });
}
