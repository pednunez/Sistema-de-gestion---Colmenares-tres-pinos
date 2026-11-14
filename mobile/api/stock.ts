import { solicitarAPI } from './cliente';

// ==========================================
// TIPOS DE STOCK
// ==========================================

export type MaterialStock =
  | 'CAJON'
  | 'ALZA'
  | 'MARCO_VACIO'
  | 'MARCO_CERA_ESTIRADA'
  | 'MARCO_CERA_UNTADA'
  | 'MARCO_CERA_ESTAMPADA'
  | 'MARCO_MIEL'
  | 'TECHO'
  | 'TECHO_AMERICANO'
  | 'ENTRETAPA'
  | 'PISO';

export type TipoMovimientoStock =
  | 'INGRESO'
  | 'ENVIO'
  | 'DANO'
  | 'ENVIO_REPARACION'
  | 'REPARACION'
  | 'DESCARTE';

export type EstadoOrigenMerma =
  | 'DANADO'
  | 'EN_REPARACION';

// ==========================================
// RESPUESTA DEL INVENTARIO
// ==========================================

export type StockResumen = {
  material: MaterialStock;
  disponible: number;
  danado: number;
  en_reparacion: number;
  merma: number;
  minimo: number | null;
  actualizado_en: string | null;
};

// ==========================================
// MOVIMIENTOS
// ==========================================

export type StockMovimiento = {
  id: number;
  material: MaterialStock;
  tipo: TipoMovimientoStock;
  cantidad: number;

  apiario_id: number | null;
  colmena_id: number | null;

  estado_origen: EstadoOrigenMerma | null;
  observaciones: string | null;

  usuario_id: number;
  fecha: string;
};

export type StockMovimientoCreate = {
  material: MaterialStock;
  tipo: TipoMovimientoStock;
  cantidad: number;

  apiario_id?: number;
  colmena_id?: number;

  estado_origen?: EstadoOrigenMerma;
  observaciones?: string;
};

// ==========================================
// MINIMOS
// ==========================================

export type StockMinimoResponse = {
  material: MaterialStock;
  minimo: number | null;
  actualizado_en: string | null;
};

// ==========================================
// FILTROS DEL HISTORIAL
// ==========================================

export type FiltrosHistorialStock = {
  material?: MaterialStock;
  tipo?: TipoMovimientoStock;
  desde?: string;
  hasta?: string;
  offset?: number;
  limit?: number;
};

// ==========================================
// 1. CONSULTAR INVENTARIO
// GET /stock/
// ==========================================

export async function obtenerStock(
  token: string
): Promise<StockResumen[]> {

  return solicitarAPI<StockResumen[]>(
    '/stock/',
    {
      token,
    }
  );
}

// ==========================================
// 2. REGISTRAR MOVIMIENTO
// POST /stock/movimientos/
// ==========================================

export async function registrarMovimientoStock(
  datos: StockMovimientoCreate,
  token: string
): Promise<StockMovimiento> {

  return solicitarAPI<StockMovimiento>(
    '/stock/movimientos/',
    {
      method: 'POST',
      token,
      body: datos,
    }
  );
}

// ==========================================
// 3. CONSULTAR HISTORIAL
// GET /stock/movimientos/
// ==========================================

export async function listarMovimientosStock(
  filtros: FiltrosHistorialStock,
  token: string
): Promise<StockMovimiento[]> {

  const parametros = new URLSearchParams();

  parametros.set(
    'offset',
    String(filtros.offset ?? 0)
  );

  parametros.set(
    'limit',
    String(filtros.limit ?? 20)
  );

  if (filtros.material) {
    parametros.set('material', filtros.material);
  }

  if (filtros.tipo) {
    parametros.set('tipo', filtros.tipo);
  }

  if (filtros.desde) {
    parametros.set('desde', filtros.desde);
  }

  if (filtros.hasta) {
    parametros.set('hasta', filtros.hasta);
  }

  return solicitarAPI<StockMovimiento[]>(
    `/stock/movimientos/?${parametros.toString()}`,
    {
      token,
    }
  );
}

// ==========================================
// 4. ACTUALIZAR MINIMO
// PATCH /stock/{material}
// ==========================================

export async function actualizarMinimoStock(
  material: MaterialStock,
  minimo: number | null,
  token: string
): Promise<StockMinimoResponse> {

  return solicitarAPI<StockMinimoResponse>(
    `/stock/${encodeURIComponent(material)}`,
    {
      method: 'PATCH',
      token,
      body: {
        minimo,
      },
    }
  );
}