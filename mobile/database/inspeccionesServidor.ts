import * as SQLite from 'expo-sqlite';
import type { InspeccionDashboardServidor } from '../api/inspecciones';

let conexion: Promise<SQLite.SQLiteDatabase> | null = null;

async function obtenerBD(): Promise<SQLite.SQLiteDatabase> {
  if (!conexion) {
    conexion = SQLite.openDatabaseAsync('colmenas.db')
      .then(async db => {
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS inspecciones_servidor_dashboard (
            usuario_id INTEGER NOT NULL,
            inspeccion_id INTEGER NOT NULL,
            fecha_inspeccion TEXT NOT NULL,
            contenido TEXT NOT NULL,
            PRIMARY KEY (usuario_id, inspeccion_id)
          );
          CREATE INDEX IF NOT EXISTS idx_dashboard_inspecciones_usuario_fecha
          ON inspecciones_servidor_dashboard(usuario_id, fecha_inspeccion);
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

/** Reemplaza la copia de inspecciones del usuario en una transacción. */
export async function guardarInspeccionesServidorDashboard(
  usuarioId: number,
  inspecciones: InspeccionDashboardServidor[]
): Promise<void> {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw new Error('Identificador de usuario inválido para guardar inspecciones.');
  }

  const db = await obtenerBD();
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.runAsync(
      'DELETE FROM inspecciones_servidor_dashboard WHERE usuario_id = ?',
      [usuarioId]
    );

    for (const inspeccion of inspecciones) {
      if (
        !Number.isSafeInteger(inspeccion.id) ||
        !Number.isSafeInteger(inspeccion.colmena_id) ||
        !inspeccion.fecha_inspeccion
      ) {
        continue;
      }

      await tx.runAsync(
        `INSERT OR REPLACE INTO inspecciones_servidor_dashboard (
          usuario_id, inspeccion_id, fecha_inspeccion, contenido
        ) VALUES (?, ?, ?, ?)`,
        [
          usuarioId,
          inspeccion.id,
          inspeccion.fecha_inspeccion,
          JSON.stringify(inspeccion),
        ]
      );
    }
  });
}

/** Lee la última copia válida disponible cuando el dispositivo está offline. */
export async function leerInspeccionesServidorDashboard(
  usuarioId: number
): Promise<InspeccionDashboardServidor[]> {
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    throw new Error('Identificador de usuario inválido para consultar inspecciones.');
  }

  const db = await obtenerBD();
  const filas = await db.getAllAsync<{ contenido: string }>(
    `SELECT contenido
     FROM inspecciones_servidor_dashboard
     WHERE usuario_id = ?
     ORDER BY fecha_inspeccion ASC, inspeccion_id ASC`,
    [usuarioId]
  );

  const resultado: InspeccionDashboardServidor[] = [];
  for (const fila of filas) {
    try {
      const dato = JSON.parse(fila.contenido) as InspeccionDashboardServidor;
      if (
        Number.isSafeInteger(dato.id) &&
        Number.isSafeInteger(dato.colmena_id) &&
        typeof dato.fecha_inspeccion === 'string'
      ) {
        resultado.push(dato);
      }
    } catch {
      // Se omite únicamente el registro dañado. El resto de la caché se conserva.
    }
  }

  return resultado;
}
