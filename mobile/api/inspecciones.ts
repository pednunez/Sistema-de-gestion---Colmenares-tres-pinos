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
  id_cliente?: string | null;
  fecha_inspeccion: string;
  estado_general: string | null;
  signos_enfermedad: boolean | number | null;
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


// Resumen liviano para pantallas de listado y alertas.
// Evita descargar los marcos de todas las inspecciones cuando solo se
// necesitan fechas, estados y datos generales.
export function listarInspeccionesResumen(
  token: string,
  ultimasPorColmena = false
): Promise<InspeccionDashboardServidor[]> {
  const query = ultimasPorColmena
    ? '?ultimas_por_colmena=true'
    : '';

  return solicitarAPI<InspeccionDashboardServidor[]>(
    `/movil/inspecciones-resumen${query}`,
    {
      method: 'GET',
      token,
    }
  );
}

// Alias utilizado por el Dashboard móvil. Mantiene el contrato existente,
// pero ahora obtiene el resumen sin cargar el detalle pesado de marcos.
export function listarInspeccionesServidor(token: string) {
  return listarInspeccionesResumen(token);
}
