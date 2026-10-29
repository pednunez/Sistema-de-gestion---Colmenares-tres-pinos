
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

// ==========================================
// COLMENARES TRES PINOS
// BASE DE DATOS DE INSPECCIONES
// ==========================================

export type DatosInspeccionLocal = {
  codigoQR: string;
  marcosTotales: number;
  marcosCria: number;
  marcosMiel: number;
  reina: 'Vista' | 'No vista' | 'Sin evaluar';
  observaciones: string;
  usuarioId?: number;
};

export type InspeccionGuardada = {
  id: number;
  codigo_qr: string;
  marcos_totales: number;
  marcos_cria: number;
  marcos_miel: number;
  reina: string;
  observaciones: string;
  fecha_local: string;
  estado: string;
  id_cliente: string;
  servidor_id: number | null;
  usuario_local_id: number | null;
};

// ==========================================
// GENERAR UUID
// ==========================================

export function crearIdCliente(): string {
  return Crypto.randomUUID();
}

// ==========================================
// CONEXIÓN SQLITE
// ==========================================

let conexion:
  Promise<SQLite.SQLiteDatabase> | null = null;

async function iniciarBaseDeDatos() {
  const db = await SQLite.openDatabaseAsync(
    'colmenas.db'
  );

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS inspecciones_locales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_qr TEXT NOT NULL,

      marcos_totales INTEGER NOT NULL
        CHECK(marcos_totales >= 0),

      marcos_cria INTEGER NOT NULL
        CHECK(marcos_cria >= 0),

      marcos_miel INTEGER NOT NULL
        CHECK(marcos_miel >= 0),

      reina TEXT NOT NULL,

      observaciones TEXT NOT NULL DEFAULT '',

      fecha_local TEXT NOT NULL,

      estado TEXT NOT NULL DEFAULT 'PENDIENTE',

      id_cliente TEXT,

      servidor_id INTEGER,

      usuario_local_id INTEGER
    );
  `);

  // ========================================
  // MIGRACIONES SIN BORRAR INFORMACIÓN
  // ========================================

  const columnas = await db.getAllAsync<{
    name: string;
  }>(
    'PRAGMA table_info(inspecciones_locales)'
  );

  const existentes = new Set(
    columnas.map(columna => columna.name)
  );

  if (!existentes.has('id_cliente')) {
    await db.execAsync(`
      ALTER TABLE inspecciones_locales
      ADD COLUMN id_cliente TEXT;
    `);
  }

  if (!existentes.has('servidor_id')) {
    await db.execAsync(`
      ALTER TABLE inspecciones_locales
      ADD COLUMN servidor_id INTEGER;
    `);
  }

  if (!existentes.has('usuario_local_id')) {
    await db.execAsync(`
      ALTER TABLE inspecciones_locales
      ADD COLUMN usuario_local_id INTEGER;
    `);
  }

  // ========================================
  // ASIGNAR UUID A REGISTROS ANTIGUOS
  // ========================================

  const sinUUID = await db.getAllAsync<{
    id: number;
  }>(
    `SELECT id
     FROM inspecciones_locales
     WHERE id_cliente IS NULL
        OR id_cliente = ''`
  );

  if (sinUUID.length > 0) {
    await db.withExclusiveTransactionAsync(
      async tx => {
        for (const registro of sinUUID) {
          await tx.runAsync(
            `UPDATE inspecciones_locales
             SET id_cliente = ?
             WHERE id = ?
               AND (
                 id_cliente IS NULL
                 OR id_cliente = ''
               )`,
            [
              crearIdCliente(),
              registro.id,
            ]
          );
        }
      }
    );
  }

  // ========================================
  // ÍNDICE DE IDENTIFICADORES ÚNICOS
  // ========================================

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_inspecciones_id_cliente
    ON inspecciones_locales(id_cliente);
  `);

  return db;
}

function obtenerBaseDeDatos() {
  if (!conexion) {
    conexion = iniciarBaseDeDatos().catch(
      error => {
        conexion = null;
        throw error;
      }
    );
  }

  return conexion;
}

// ==========================================
// GUARDAR INSPECCIÓN LOCAL
// ==========================================

export async function guardarInspeccionLocal(
  datos: DatosInspeccionLocal
): Promise<number> {

  const cantidades = [
    datos.marcosTotales,
    datos.marcosCria,
    datos.marcosMiel,
  ];

  if (
    !datos.codigoQR.trim() ||
    cantidades.some(
      numero =>
        !Number.isSafeInteger(numero) ||
        numero < 0
    ) ||
    datos.marcosCria > datos.marcosTotales ||
    datos.marcosMiel > datos.marcosTotales
  ) {
    throw new Error(
      'Los datos de la inspección no son válidos.'
    );
  }

  const usuarioId =
    datos.usuarioId ?? null;

  if (
    usuarioId !== null &&
    (
      !Number.isSafeInteger(usuarioId) ||
      usuarioId <= 0
    )
  ) {
    throw new Error(
      'Identificador de usuario inválido.'
    );
  }

  const db = await obtenerBaseDeDatos();

  const idCliente = crearIdCliente();

  const fechaReal =
    new Date().toISOString();

  const resultado = await db.runAsync(
    `INSERT INTO inspecciones_locales (
      codigo_qr,
      marcos_totales,
      marcos_cria,
      marcos_miel,
      reina,
      observaciones,
      fecha_local,
      estado,
      id_cliente,
      servidor_id,
      usuario_local_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      'PENDIENTE', ?, NULL, ?
    )`,
    [
      datos.codigoQR.trim(),
      datos.marcosTotales,
      datos.marcosCria,
      datos.marcosMiel,
      datos.reina,
      datos.observaciones,
      fechaReal,
      idCliente,
      usuarioId,
    ]
  );

  return resultado.lastInsertRowId;
}

// ==========================================
// LISTAR INSPECCIONES LOCALES
// ==========================================

export async function listarInspeccionesLocales():
  Promise<InspeccionGuardada[]> {

  const db = await obtenerBaseDeDatos();

  return db.getAllAsync<InspeccionGuardada>(
    `SELECT *
     FROM inspecciones_locales
     ORDER BY id DESC`
  );
}
