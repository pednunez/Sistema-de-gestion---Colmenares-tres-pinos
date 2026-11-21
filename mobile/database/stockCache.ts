import * as SQLite from 'expo-sqlite';
import type { StockResumen } from '../api/stock';

let conexion: Promise<SQLite.SQLiteDatabase> | null = null;

async function obtenerBD(): Promise<SQLite.SQLiteDatabase> {
  if (!conexion) {
    conexion = SQLite.openDatabaseAsync('colmenas.db')
      .then(async db => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS stock_dashboard_cache (
            usuario_id INTEGER PRIMARY KEY,
            contenido TEXT NOT NULL,
            actualizado_en TEXT NOT NULL
          );
        `);
        return db;
      })
      .catch(error => {
        conexion = null;
        throw error;
      });
  }
  return conexion;
}

export async function guardarStockDashboard(
  usuarioId: number,
  stock: StockResumen[]
): Promise<void> {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw new Error('Identificador de usuario inválido para guardar stock.');
  }

  const db = await obtenerBD();
  await db.runAsync(
    `INSERT INTO stock_dashboard_cache (usuario_id, contenido, actualizado_en)
     VALUES (?, ?, ?)
     ON CONFLICT(usuario_id) DO UPDATE SET
       contenido = excluded.contenido,
       actualizado_en = excluded.actualizado_en`,
    [usuarioId, JSON.stringify(stock), new Date().toISOString()]
  );
}

export async function leerStockDashboard(
  usuarioId: number
): Promise<StockResumen[]> {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw new Error('Identificador de usuario inválido para consultar stock.');
  }

  const db = await obtenerBD();
  const fila = await db.getFirstAsync<{ contenido: string }>(
    'SELECT contenido FROM stock_dashboard_cache WHERE usuario_id = ?',
    [usuarioId]
  );
  if (!fila) return [];

  try {
    const contenido = JSON.parse(fila.contenido) as unknown;
    return Array.isArray(contenido) ? contenido as StockResumen[] : [];
  } catch {
    return [];
  }
}
