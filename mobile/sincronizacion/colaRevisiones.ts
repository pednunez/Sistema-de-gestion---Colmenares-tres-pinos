
import * as SQLite from 'expo-sqlite';

import {
  leerSesionGuardada,
} from '../api/auth';

import {
  generarPlanRevisiones,
} from './planificadorRevisiones';

import type {
  OperacionRevision,
  TipoOperacionRevision,
} from './planificadorRevisiones';

// ==========================================
// COLMENARES TRES PINOS
// COLA LOCAL DE SINCRONIZACIÓN
// ==========================================

// SEGURIDAD:
// Este archivo no realiza envíos HTTP.
// No modifica inspecciones ni revisiones.
// No confirma operaciones automáticamente.

export type EstadoOperacion =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'ERROR';

export type OperacionEnCola = {
  clave: string;

  usuario_local_id: number;
  revision_local_id: number;
  revision_servidor_id: number | null;

  grupo_id: number;

  tipo: TipoOperacionRevision;

  colmena_id: number | null;
  inspeccion_local_id: number | null;

  id_cliente: string | null;
  motivo: string | null;

  estado: EstadoOperacion;
  activa: number;

  intentos: number;
  ultimo_error: string | null;

  creado_en: string;
  actualizado_en: string;
};

export type ResumenColaRevisiones = {
  estado:
    | 'SIN_SESION'
    | 'PREPARADA';

  revisionesAnalizadas: number;
  operacionesPendientes: number;
  operacionesConfirmadas: number;
  operacionesConError: number;

  problemasDetectados: number;

  enviosHabilitados: false;
};

// ==========================================
// BASE DE DATOS
// ==========================================

let conexion:
  Promise<SQLite.SQLiteDatabase> | null =
  null;

async function inicializarBD():
  Promise<SQLite.SQLiteDatabase> {

  const db =
    await SQLite.openDatabaseAsync(
      'colmenas.db'
    );

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS
      cola_revision_operaciones (
        clave TEXT PRIMARY KEY,

        usuario_local_id INTEGER NOT NULL,
        revision_local_id INTEGER NOT NULL,
        revision_servidor_id INTEGER,

        grupo_id INTEGER NOT NULL,

        tipo TEXT NOT NULL CHECK (
          tipo IN (
            'CREAR_SESION',
            'ENVIAR_INSPECCION',
            'OMITIR_COLMENA',
            'FINALIZAR_SESION'
          )
        ),

        colmena_id INTEGER,
        inspeccion_local_id INTEGER,

        id_cliente TEXT,
        motivo TEXT,

        estado TEXT NOT NULL
          DEFAULT 'PENDIENTE'
          CHECK (
            estado IN (
              'PENDIENTE',
              'CONFIRMADA',
              'ERROR'
            )
          ),

        activa INTEGER NOT NULL
          DEFAULT 1
          CHECK (activa IN (0, 1)),

        intentos INTEGER NOT NULL
          DEFAULT 0,

        ultimo_error TEXT,

        creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      );

    CREATE INDEX IF NOT EXISTS
      idx_cola_revision_usuario
    ON cola_revision_operaciones(
      usuario_local_id,
      activa,
      estado
    );

    CREATE INDEX IF NOT EXISTS
      idx_cola_revision_local
    ON cola_revision_operaciones(
      revision_local_id
    );
  `);

  return db;
}

function obtenerBD():
  Promise<SQLite.SQLiteDatabase> {

  if (!conexion) {
    conexion = inicializarBD().catch(
      error => {
        conexion = null;
        throw error;
      }
    );
  }

  return conexion;
}

// ==========================================
// USUARIO ACTUAL
// ==========================================

async function usuarioActual():
  Promise<number | null> {

  const sesion =
    await leerSesionGuardada();

  if (!sesion) {
    return null;
  }

  const id = sesion.usuario.id;

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      'La sesión tiene un identificador de usuario inválido.'
    );
  }

  return id;
}

// ==========================================
// IDENTIFICADOR ÚNICO
// ==========================================

function crearClaveOperacion(
  usuarioId: number,
  operacion: OperacionRevision
): string {

  const prefijo =
    `usuario:${usuarioId}:` +
    `revision:${operacion.revisionLocalId}`;

  switch (operacion.tipo) {

    case 'CREAR_SESION':
      if (!operacion.idCliente) {
        throw new Error(
          'La revisión no tiene UUID de cliente.'
        );
      }

      return (
        `${prefijo}:crear:` +
        operacion.idCliente
      );

    case 'ENVIAR_INSPECCION':
      if (
        !operacion.idCliente ||
        !operacion.inspeccionLocalId
      ) {
        throw new Error(
          'La inspección no tiene identificadores válidos.'
        );
      }

      return (
        `${prefijo}:inspeccion:` +
        operacion.idCliente
      );

    case 'OMITIR_COLMENA':
      if (!operacion.colmenaId) {
        throw new Error(
          'La omisión no tiene una colmena válida.'
        );
      }

      return (
        `${prefijo}:omitir:` +
        operacion.colmenaId
      );

    case 'FINALIZAR_SESION':
      return `${prefijo}:finalizar`;
  }
}

// ==========================================
// CONSULTAR COLA DEL USUARIO
// ==========================================

export async function listarColaRevisiones():
  Promise<OperacionEnCola[]> {

  const usuarioId =
    await usuarioActual();

  if (usuarioId === null) {
    return [];
  }

  const db = await obtenerBD();

  return db.getAllAsync<OperacionEnCola>(
    `SELECT *
     FROM cola_revision_operaciones
     WHERE usuario_local_id = ?
       AND activa = 1
     ORDER BY
       revision_local_id ASC,
       CASE tipo
         WHEN 'CREAR_SESION' THEN 1
         WHEN 'ENVIAR_INSPECCION' THEN 2
         WHEN 'OMITIR_COLMENA' THEN 3
         WHEN 'FINALIZAR_SESION' THEN 4
       END ASC,
       creado_en ASC`,
    [usuarioId]
  );
}

// ==========================================
// RESUMEN DE LA COLA
// ==========================================

function construirResumen(
  operaciones: OperacionEnCola[],
  revisionesAnalizadas: number,
  problemasDetectados: number
): ResumenColaRevisiones {

  return {
    estado: 'PREPARADA',

    revisionesAnalizadas,

    operacionesPendientes:
      operaciones.filter(
        item =>
          item.estado === 'PENDIENTE'
      ).length,

    operacionesConfirmadas:
      operaciones.filter(
        item =>
          item.estado === 'CONFIRMADA'
      ).length,

    operacionesConError:
      operaciones.filter(
        item =>
          item.estado === 'ERROR'
      ).length,

    problemasDetectados,

    enviosHabilitados: false,
  };
}

// ==========================================
// PREPARAR COLA
// ==========================================

export async function prepararColaRevisiones():
  Promise<ResumenColaRevisiones> {

  // 1. Exigir sesión identificada.
  const usuarioId =
    await usuarioActual();

  if (usuarioId === null) {
    return {
      estado: 'SIN_SESION',
      revisionesAnalizadas: 0,
      operacionesPendientes: 0,
      operacionesConfirmadas: 0,
      operacionesConError: 0,
      problemasDetectados: 0,
      enviosHabilitados: false,
    };
  }

  // 2. Generar plan desde SQLite.
  const plan =
    await generarPlanRevisiones();

  const db = await obtenerBD();

  const ahora =
    new Date().toISOString();

  let problemasAdicionales = 0;

  // 3. Preparar todas las operaciones
  // dentro de una única transacción.
  await db.withExclusiveTransactionAsync(
    async tx => {

      // Las operaciones anteriores
      // se mantienen almacenadas,
      // pero dejan de figurar activas
      // si ya no están en el plan.
      await tx.runAsync(
        `UPDATE cola_revision_operaciones
         SET activa = 0
         WHERE usuario_local_id = ?`,
        [usuarioId]
      );

      // 4. Procesar las revisiones.
      for (const revision of plan.planes) {

        // No activar operaciones de
        // revisiones que tienen
        // inconsistencias detectadas.
        if (!revision.listoParaRevisar) {
          continue;
        }

        for (
          const operacion of
          revision.operaciones
        ) {
          let clave: string;

          try {
            clave = crearClaveOperacion(
              usuarioId,
              operacion
            );
          } catch {
            problemasAdicionales++;
            continue;
          }

          // 5. Insertar operación nueva
          // sin duplicar una existente.
          //
          // ON CONFLICT conserva:
          // - estado anterior
          // - intentos
          // - último error
          //
          // Solo actualiza el contexto
          // y vuelve a activarla.
          await tx.runAsync(
            `INSERT INTO
              cola_revision_operaciones (
                clave,
                usuario_local_id,
                revision_local_id,
                revision_servidor_id,
                grupo_id,
                tipo,
                colmena_id,
                inspeccion_local_id,
                id_cliente,
                motivo,
                estado,
                activa,
                intentos,
                ultimo_error,
                creado_en,
                actualizado_en
              )
             VALUES (
               ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?,
               'PENDIENTE',
               1,
               0,
               NULL,
               ?, ?
             )
             ON CONFLICT(clave)
             DO UPDATE SET
               activa = 1,
               revision_servidor_id =
                 excluded.revision_servidor_id,
               motivo = excluded.motivo,
               actualizado_en =
                 excluded.actualizado_en`,
            [
              clave,
              usuarioId,
              operacion.revisionLocalId,
              operacion.revisionServidorId,
              operacion.grupoId,
              operacion.tipo,
              operacion.colmenaId ?? null,
              operacion.inspeccionLocalId ??
                null,
              operacion.idCliente ?? null,
              operacion.motivo ?? null,
              ahora,
              ahora,
            ]
          );
        }
      }
    }
  );

  // 6. Consultar las operaciones
  // activas tras preparar la cola.
  const operaciones =
    await listarColaRevisiones();

  return construirResumen(
    operaciones,
    plan.planes.length,
    plan.totalProblemas +
      problemasAdicionales
  );
}

// ==========================================
// DIAGNÓSTICO LOCAL
// ==========================================

// Esta función permite consultar el
// resumen guardado sin generar
// nuevamente la planificación.

export async function consultarResumenCola():
  Promise<ResumenColaRevisiones> {

  const usuarioId =
    await usuarioActual();

  if (usuarioId === null) {
    return {
      estado: 'SIN_SESION',
      revisionesAnalizadas: 0,
      operacionesPendientes: 0,
      operacionesConfirmadas: 0,
      operacionesConError: 0,
      problemasDetectados: 0,
      enviosHabilitados: false,
    };
  }

  const operaciones =
    await listarColaRevisiones();

  const revisiones = new Set(
    operaciones.map(
      item => item.revision_local_id
    )
  );

  return construirResumen(
    operaciones,
    revisiones.size,
    0
  );
}
