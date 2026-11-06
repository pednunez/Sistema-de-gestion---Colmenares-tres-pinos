
import * as SQLite from 'expo-sqlite';

import { leerSesionGuardada } from '../api/auth';
import { leerCatalogoLocal } from './catalogo';
import {
  crearIdCliente,
  listarInspeccionesLocales,
} from './inspecciones';

export type EstadoTratamiento =
  | 'PLANIFICADO'
  | 'EN_CURSO'
  | 'FINALIZADO'
  | 'CANCELADO';

export type DatosTratamiento = {
  codigoQR: string;
  inspeccionLocalId: number | null;
  tipoTratamiento: string;
  producto: string;
  dosis: string;
  motivo: string;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoTratamiento;
  observaciones: string;
};

export type TratamientoGuardado = {
  id: number;
  codigo_qr: string;
  inspeccion_local_id: number | null;
  tipo_tratamiento: string;
  producto: string;
  dosis: string;
  motivo: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: EstadoTratamiento;
  observaciones: string;
  sincronizacion: 'PENDIENTE' | 'SINCRONIZADO';
  creado_local: string;
  actualizado_local: string;
  id_cliente: string;
  servidor_id: number | null;
  usuario_local_id: number | null;
};

// Valores temporales para probar la interfaz.
// No son tratamientos ni productos autorizados.
export const TIPOS_TRATAMIENTO = [
  'Simulación sanitaria',
  'Evaluación sanitaria de prueba',
] as const;

export const PRODUCTOS_TRATAMIENTO = [
  'Sin producto (prueba)',
  'Producto simulado',
] as const;

export const UNIDADES_DOSIS = [
  'mg',
  'g',
  'ml',
  'l',
  'tiras',
  'unidades',
] as const;

const caracteresTexto =
  /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 \n.,;:¿?¡!()%+°ºµ'/-]/g;

// ==========================================
// TEXTOS
// ==========================================

export function limpiarTexto(
  valor: string,
  maximo = 1000
): string {
  return valor
    .normalize('NFC')
    .replace(/\r/g, '')
    .replace(caracteresTexto, '')
    .replace(/[ \t]{2,}/g, ' ')
    .slice(0, maximo);
}

// ==========================================
// FECHAS
// ==========================================

export function fechaLocalISO(): string {
  const f = new Date();

  const anio = f.getFullYear();
  const mes = String(f.getMonth() + 1).padStart(2, '0');
  const dia = String(f.getDate()).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

export function fechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const [a, m, d] = fecha.split('-').map(Number);

  if (a < 2000 || a > 2100) {
    return false;
  }

  const real = new Date(Date.UTC(a, m - 1, d));

  return (
    real.getUTCFullYear() === a &&
    real.getUTCMonth() + 1 === m &&
    real.getUTCDate() === d
  );
}

function sumarAnios(
  fecha: string,
  cantidad: number
): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a + cantidad, m - 1, d));

  return f.toISOString().slice(0, 10);
}

function validarTexto(
  valor: string,
  nombre: string,
  maximo: number
): void {
  if (
    valor.length > maximo ||
    limpiarTexto(valor, maximo) !== valor
  ) {
    throw new Error(
      `${nombre}: caracteres no permitidos o longitud excesiva.`
    );
  }
}

// ==========================================
// VALIDACIONES
// ==========================================

export function validarTratamiento(
  datos: DatosTratamiento
): void {
  if (
    !/^[A-Za-z0-9_-]{3,80}$/.test(datos.codigoQR)
  ) {
    throw new Error('Selecciona una colmena válida.');
  }

  if (
    !TIPOS_TRATAMIENTO.some(
      t => t === datos.tipoTratamiento
    )
  ) {
    throw new Error(
      'Selecciona un tipo del catálogo de prueba.'
    );
  }

  if (
    !PRODUCTOS_TRATAMIENTO.some(
      p => p === datos.producto
    )
  ) {
    throw new Error(
      'Selecciona un producto del catálogo de prueba.'
    );
  }

  validarTexto(datos.motivo, 'Motivo', 500);
  validarTexto(datos.observaciones, 'Observaciones', 1000);

  if (datos.producto === 'Sin producto (prueba)') {
    if (datos.dosis.trim()) {
      throw new Error(
        'Sin producto no se puede registrar una dosis.'
      );
    }
  } else {
    const dosis = datos.dosis.match(
      /^(\d{1,6}(?:[.,]\d{1,3})?) (mg|g|ml|l|tiras|unidades)$/
    );

    if (!dosis) {
      throw new Error(
        'Selecciona cantidad positiva y unidad de dosis.'
      );
    }

    const cantidad = Number(
      dosis[1].replace(',', '.')
    );

    if (
      cantidad <= 0 ||
      !Number.isFinite(cantidad)
    ) {
      throw new Error(
        'La dosis debe ser mayor que cero.'
      );
    }
  }

  if (!fechaValida(datos.fechaInicio)) {
    throw new Error('Fecha de inicio inválida.');
  }

  const hoy = fechaLocalISO();
  const limiteAnterior = sumarAnios(hoy, -5);
  const limitePosterior = sumarAnios(hoy, 1);

  if (
    datos.fechaInicio < limiteAnterior ||
    datos.fechaInicio > limitePosterior
  ) {
    throw new Error(
      'Fecha de inicio fuera del intervalo permitido.'
    );
  }

  if (
    datos.fechaFin &&
    (
      !fechaValida(datos.fechaFin) ||
      datos.fechaFin < datos.fechaInicio ||
      datos.fechaFin > limitePosterior
    )
  ) {
    throw new Error('Fecha de término inválida.');
  }

  if (
    ![
      'PLANIFICADO',
      'EN_CURSO',
      'FINALIZADO',
      'CANCELADO',
    ].includes(datos.estado)
  ) {
    throw new Error('Estado no permitido.');
  }

  if (
    datos.estado !== 'PLANIFICADO' &&
    datos.fechaInicio > hoy
  ) {
    throw new Error(
      'Un tratamiento iniciado no puede tener fecha futura.'
    );
  }

  if (
    datos.estado === 'FINALIZADO' &&
    (!datos.fechaFin || datos.fechaFin > hoy)
  ) {
    throw new Error(
      'Un tratamiento finalizado necesita fecha de término no futura.'
    );
  }

  if (
    datos.estado === 'EN_CURSO' &&
    datos.fechaFin !== null
  ) {
    throw new Error(
      'Un tratamiento en curso no puede tener fecha de término.'
    );
  }

  if (
    datos.estado === 'CANCELADO' &&
    datos.fechaFin &&
    datos.fechaFin > hoy
  ) {
    throw new Error(
      'Una cancelación no puede tener fecha futura.'
    );
  }

  if (
    datos.inspeccionLocalId !== null &&
    (
      !Number.isSafeInteger(datos.inspeccionLocalId) ||
      datos.inspeccionLocalId <= 0
    )
  ) {
    throw new Error('Inspección asociada inválida.');
  }
}

// ==========================================
// BASE DE DATOS
// ==========================================

let conexion:
  Promise<SQLite.SQLiteDatabase> | null = null;

async function iniciarBD() {
  const db = await SQLite.openDatabaseAsync('colmenas.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS tratamientos_locales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_qr TEXT NOT NULL,
      inspeccion_local_id INTEGER,
      tipo_tratamiento TEXT NOT NULL,
      producto TEXT NOT NULL DEFAULT '',
      dosis TEXT NOT NULL DEFAULT '',
      motivo TEXT NOT NULL DEFAULT '',
      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT,
      estado TEXT NOT NULL DEFAULT 'EN_CURSO',
      observaciones TEXT NOT NULL DEFAULT '',
      sincronizacion TEXT NOT NULL DEFAULT 'PENDIENTE',
      creado_local TEXT NOT NULL,
      actualizado_local TEXT NOT NULL,
      id_cliente TEXT,
      servidor_id INTEGER,
      usuario_local_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tratamientos_codigo
    ON tratamientos_locales(codigo_qr);
  `);

  // Migrar registros anteriores sin eliminarlos.
  const columnas = await db.getAllAsync<{
    name: string;
  }>(
    'PRAGMA table_info(tratamientos_locales)'
  );

  const existentes = new Set(
    columnas.map(columna => columna.name)
  );

  if (!existentes.has('id_cliente')) {
    await db.execAsync(`
      ALTER TABLE tratamientos_locales
      ADD COLUMN id_cliente TEXT;
    `);
  }

  if (!existentes.has('servidor_id')) {
    await db.execAsync(`
      ALTER TABLE tratamientos_locales
      ADD COLUMN servidor_id INTEGER;
    `);
  }

  if (!existentes.has('usuario_local_id')) {
    await db.execAsync(`
      ALTER TABLE tratamientos_locales
      ADD COLUMN usuario_local_id INTEGER;
    `);
  }

  const anteriores = await db.getAllAsync<{
    id: number;
  }>(
    `SELECT id
     FROM tratamientos_locales
     WHERE id_cliente IS NULL
        OR id_cliente = ''`
  );

  if (anteriores.length > 0) {
    await db.withExclusiveTransactionAsync(
      async tx => {
        for (const registro of anteriores) {
          await tx.runAsync(
            `UPDATE tratamientos_locales
             SET id_cliente = ?
             WHERE id = ?
               AND (
                 id_cliente IS NULL
                 OR id_cliente = ''
               )`,
            [crearIdCliente(), registro.id]
          );
        }
      }
    );
  }

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_tratamientos_id_cliente
    ON tratamientos_locales(id_cliente);
  `);

  return db;
}

function obtenerBD() {
  if (!conexion) {
    conexion = iniciarBD().catch(error => {
      conexion = null;
      throw error;
    });
  }

  return conexion;
}

// ==========================================
// COLMENA DEL CATÁLOGO OFICIAL
// ==========================================

async function validarReferencias(
  db: SQLite.SQLiteDatabase,
  datos: DatosTratamiento
): Promise<number> {
  const sesion = await leerSesionGuardada();

  if (!sesion) {
    throw new Error(
      'Debes iniciar sesión para registrar tratamientos oficiales.'
    );
  }

  const catalogo = await leerCatalogoLocal(
    sesion.usuario.id
  );

  if (!catalogo) {
    throw new Error(
      'No hay un catálogo oficial descargado para este usuario.'
    );
  }

  const codigo = datos.codigoQR.trim().toLowerCase();

  const colmena = catalogo.colmenas.find(
    item =>
      item.codigo_qr.trim().toLowerCase() === codigo
  );

  if (!colmena) {
    throw new Error(
      'La colmena no existe en el catálogo oficial.'
    );
  }

  // La inspección asociada es opcional.
  if (datos.inspeccionLocalId !== null) {
    // Garantizar que exista la tabla principal.
    await listarInspeccionesLocales();

    const inspeccion = await db.getFirstAsync<{
      id: number;
    }>(
      `SELECT id
       FROM inspecciones_locales
       WHERE id = ?
         AND LOWER(codigo_qr) = ?
         AND usuario_local_id = ?`,
      [
        datos.inspeccionLocalId,
        codigo,
        sesion.usuario.id,
      ]
    );

    if (!inspeccion) {
      throw new Error(
        'La inspección asociada no pertenece a esta colmena o usuario.'
      );
    }
  }

  return sesion.usuario.id;
}

// ==========================================
// GUARDAR
// ==========================================

export async function guardarTratamientoLocal(
  datos: DatosTratamiento
): Promise<number> {
  validarTratamiento(datos);

  if (
    datos.estado === 'CANCELADO' ||
    datos.estado === 'FINALIZADO'
  ) {
    throw new Error(
      'Un tratamiento nuevo debe estar planificado o en curso.'
    );
  }

  const db = await obtenerBD();

  const usuarioLocalId =
    await validarReferencias(db, datos);

  const idCliente = crearIdCliente();
  const ahora = new Date().toISOString();

  const resultado = await db.runAsync(
    `INSERT INTO tratamientos_locales (
      codigo_qr,
      inspeccion_local_id,
      tipo_tratamiento,
      producto,
      dosis,
      motivo,
      fecha_inicio,
      fecha_fin,
      estado,
      observaciones,
      sincronizacion,
      creado_local,
      actualizado_local,
      id_cliente,
      servidor_id,
      usuario_local_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'PENDIENTE', ?, ?, ?, NULL, ?
    )`,
    [
      datos.codigoQR.trim(),
      datos.inspeccionLocalId,
      datos.tipoTratamiento,
      datos.producto,
      datos.dosis,
      datos.motivo.trim(),
      datos.fechaInicio,
      datos.fechaFin,
      datos.estado,
      datos.observaciones.trim(),
      ahora,
      ahora,
      idCliente,
      usuarioLocalId,
    ]
  );

  return resultado.lastInsertRowId;
}

// ==========================================
// LISTAR
// ==========================================

export async function listarTratamientosLocales():
  Promise<TratamientoGuardado[]> {
  const db = await obtenerBD();

  return db.getAllAsync<TratamientoGuardado>(
    `SELECT *
     FROM tratamientos_locales
     ORDER BY id DESC`
  );
}

// ==========================================
// EDITAR
// ==========================================

export async function actualizarTratamientoLocal(
  id: number,
  datos: DatosTratamiento
): Promise<void> {
  validarTratamiento(datos);

  const db = await obtenerBD();

  const actual = await db.getFirstAsync<TratamientoGuardado>(
    `SELECT *
     FROM tratamientos_locales
     WHERE id = ?`,
    [id]
  );

  if (!actual) {
    throw new Error('Tratamiento no encontrado.');
  }

  if (
    actual.sincronizacion !== 'PENDIENTE' ||
    !['PLANIFICADO', 'EN_CURSO'].includes(actual.estado)
  ) {
    throw new Error(
      'No se pueden editar tratamientos cerrados o sincronizados.'
    );
  }

  if (
    datos.codigoQR !== actual.codigo_qr ||
    datos.inspeccionLocalId !== actual.inspeccion_local_id ||
    datos.fechaInicio !== actual.fecha_inicio ||
    datos.estado !== actual.estado
  ) {
    throw new Error(
      'No puedes alterar las referencias ni cambiar el estado desde Editar.'
    );
  }

  const usuarioLocalId =
    await validarReferencias(db, datos);

  if (actual.usuario_local_id !== usuarioLocalId) {
    throw new Error(
      'Este tratamiento pertenece a otro usuario o no tiene propietario confirmado.'
    );
  }

  const resultado = await db.runAsync(
    `UPDATE tratamientos_locales
     SET tipo_tratamiento = ?,
         producto = ?,
         dosis = ?,
         motivo = ?,
         fecha_fin = ?,
         observaciones = ?,
         actualizado_local = ?
     WHERE id = ?
       AND usuario_local_id = ?
       AND sincronizacion = 'PENDIENTE'
       AND estado IN ('PLANIFICADO','EN_CURSO')`,
    [
      datos.tipoTratamiento,
      datos.producto,
      datos.dosis,
      datos.motivo.trim(),
      datos.fechaFin,
      datos.observaciones.trim(),
      new Date().toISOString(),
      id,
      usuarioLocalId,
    ]
  );

  if (resultado.changes !== 1) {
    throw new Error(
      'No se pudo editar el tratamiento.'
    );
  }

  // No se cambia id_cliente.
}

// ==========================================
// FINALIZAR O CANCELAR
// ==========================================

export async function cambiarEstadoTratamientoLocal(
  id: number,
  estado: 'FINALIZADO' | 'CANCELADO'
): Promise<void> {
  const db = await obtenerBD();

  const actual = await db.getFirstAsync<TratamientoGuardado>(
    `SELECT *
     FROM tratamientos_locales
     WHERE id = ?`,
    [id]
  );

  if (!actual) {
    throw new Error('Tratamiento no encontrado.');
  }

  if (
    actual.sincronizacion !== 'PENDIENTE' ||
    !['PLANIFICADO', 'EN_CURSO'].includes(actual.estado)
  ) {
    throw new Error(
      'El tratamiento está cerrado o sincronizado.'
    );
  }

  const sesion = await leerSesionGuardada();

  if (
    !sesion ||
    actual.usuario_local_id !== sesion.usuario.id
  ) {
    throw new Error(
      'No puedes modificar un tratamiento de otro usuario.'
    );
  }

  const hoy = fechaLocalISO();

  if (
    estado === 'FINALIZADO' &&
    actual.fecha_inicio > hoy
  ) {
    throw new Error(
      'No se puede finalizar antes de la fecha de inicio.'
    );
  }

  const fechaFin =
    estado === 'FINALIZADO'
      ? actual.fecha_fin &&
        actual.fecha_fin >= actual.fecha_inicio &&
        actual.fecha_fin <= hoy
          ? actual.fecha_fin
          : hoy
      : actual.fecha_fin;

  const resultado = await db.runAsync(
    `UPDATE tratamientos_locales
     SET estado = ?,
         fecha_fin = ?,
         actualizado_local = ?
     WHERE id = ?
       AND usuario_local_id = ?
       AND sincronizacion = 'PENDIENTE'
       AND estado IN ('PLANIFICADO','EN_CURSO')`,
    [
      estado,
      fechaFin,
      new Date().toISOString(),
      id,
      sesion.usuario.id,
    ]
  );

  if (resultado.changes !== 1) {
    throw new Error(
      'No se pudo cambiar el estado.'
    );
  }
}
