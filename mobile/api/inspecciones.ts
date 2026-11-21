import { solicitarAPI } from './cliente';

export type MarcoInspeccionApi = {
  id?: number;
  inspeccion_id?: number;
  ubicacion: 'CAMARA_CRIA' | 'ALZA' | string;
  numero: number;
  contenido: string | null;
  transferido_a_colmena_id: number | null;
  retirar_a_bodega?: boolean;
  ubicacion_destino?: string | null;
  numero_destino?: number | null;
};

export type InspeccionDashboardServidor = {
  id: number;
  colmena_id: number;
  usuario_id?: number;
  fecha_inspeccion: string;
  estado_general: string | null;
  signos_enfermedad: boolean | number;
  enfermedad_observada: string | null;
  cantidad_marcos: number | null;
  reina_observada: boolean | null;
  presencia_cria: boolean | null;
  postura: boolean | null;
  nivel_poblacion: string | null;
  reservas_alimento: string | null;
  miel: string | null;
  alimentacion_suministrada: string | null;
  tiene_alza: boolean | null;
  tiras_medicamento: number | null;
  observaciones: string | null;
};

export type InspeccionApi = InspeccionDashboardServidor & {
  usuario_id: number;
  id_cliente: string | null;
  estado_general: string | null;
  reina_observada: boolean | null;
  presencia_cria: boolean | null;
  nivel_poblacion: string | null;
  reservas_alimento: string | null;
  cantidad_marcos: number | null;
  tiene_alza: boolean | null;
  marcos: MarcoInspeccionApi[];
  miel: string | null;
  alimentacion_suministrada: string | null;
  postura: boolean | null;
  signos_enfermedad: boolean;
  enfermedad_observada: string | null;
  tiras_medicamento: number | null;
  observaciones: string | null;
  fecha_inspeccion: string;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  fecha_eliminacion: string | null;
};

export type InspeccionUpdateApi = Partial<{
  estado_general: string | null;
  reina_observada: boolean | null;
  presencia_cria: boolean | null;
  nivel_poblacion: string | null;
  reservas_alimento: string | null;
  miel: string | null;
  alimentacion_suministrada: string | null;
  postura: boolean | null;
  signos_enfermedad: boolean;
  enfermedad_observada: string | null;
  tiras_medicamento: number | null;
  observaciones: string | null;
  cantidad_marcos: number | null;
  tiene_alza: boolean | null;
  marcos: MarcoInspeccionApi[] | null;
}>;

export function listarInspecciones(token: string) {
  return solicitarAPI<InspeccionApi[]>('/inspecciones/', {
    method: 'GET',
    token,
  });
}

export function obtenerInspeccion(id: number, token: string) {
  return solicitarAPI<InspeccionApi>(`/inspecciones/${id}`, {
    method: 'GET',
    token,
  });
}

export function actualizarInspeccion(
  id: number,
  datos: InspeccionUpdateApi,
  token: string
) {
  return solicitarAPI<InspeccionApi>(`/inspecciones/${id}`, {
    method: 'PATCH',
    body: datos,
    token,
  });
}

export function anularInspeccion(id: number, token: string) {
  return solicitarAPI<InspeccionApi>(`/inspecciones/${id}`, {
    method: 'DELETE',
    token,
  });
}


// Alias utilizado por el Dashboard móvil para combinar las inspecciones
// recibidas desde FastAPI con las copias locales guardadas en SQLite.
export function listarInspeccionesServidor(token: string) {
  return listarInspecciones(token) as Promise<InspeccionDashboardServidor[]>;
}
