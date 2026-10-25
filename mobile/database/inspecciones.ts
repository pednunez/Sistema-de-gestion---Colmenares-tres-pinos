
import * as SQLite from 'expo-sqlite';

export type DatosInspeccionLocal = {
  codigoQR: string;
  marcosTotales: number;
  marcosCria: number;
  marcosMiel: number;
  reina: 'Vista' | 'No vista' | 'Sin evaluar';
  observaciones: string;
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
};

let conexion: Promise<SQLite.SQLiteDatabase> | null = null;

async function iniciarBaseDeDatos() {
  const db = await SQLite.openDatabaseAsync('colmenas.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS inspecciones_locales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_qr TEXT NOT NULL,
      marcos_totales INTEGER NOT NULL CHECK(marcos_totales >= 0),
      marcos_cria INTEGER NOT NULL CHECK(marcos_cria >= 0),
      marcos_miel INTEGER NOT NULL CHECK(marcos_miel >= 0),
      reina TEXT NOT NULL,
      observaciones TEXT NOT NULL DEFAULT '',
      fecha_local TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    );
  `);

  return db;
}

function obtenerBaseDeDatos() {
  if (!conexion) {
    conexion = iniciarBaseDeDatos().catch(error => {
      conexion = null;
      throw error;
    });
  }

  return conexion;
}

// GUARDAR INSPECCIÓN SIN INTERNET
export async function guardarInspeccionLocal(
  datos: DatosInspeccionLocal
) {
  const cantidades = [
    datos.marcosTotales,
    datos.marcosCria,
    datos.marcosMiel,
  ];

  if (
    !datos.codigoQR.trim() ||
    cantidades.some(n => !Number.isInteger(n) || n < 0) ||
    datos.marcosCria > datos.marcosTotales ||
    datos.marcosMiel > datos.marcosTotales
  ) {
    throw new Error('Los datos de la inspección no son válidos.');
  }

  const db = await obtenerBaseDeDatos();

  const resultado = await db.runAsync(
    `INSERT INTO inspecciones_locales (
      codigo_qr, marcos_totales, marcos_cria,
      marcos_miel, reina, observaciones, fecha_local
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.codigoQR,
      datos.marcosTotales,
      datos.marcosCria,
      datos.marcosMiel,
      datos.reina,
      datos.observaciones,
      new Date().toISOString(),
    ]
  );

  return resultado.lastInsertRowId;
}

// CONSULTAR INSPECCIONES GUARDADAS
export async function listarInspeccionesLocales() {
  const db = await obtenerBaseDeDatos();

  return db.getAllAsync<InspeccionGuardada>(
    `SELECT * FROM inspecciones_locales
     ORDER BY id DESC`
  );
}
