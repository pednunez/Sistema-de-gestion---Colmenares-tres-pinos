
import * as SQLite from 'expo-sqlite';

import {
  leerSesionGuardada,
} from '../api/auth';

import {
  leerCatalogoLocal,
} from './catalogo';

import {
  crearIdCliente,
  listarInspeccionesLocales,
} from './inspecciones';

// ==========================================
// COLMENARES TRES PINOS
// REVISIONES POR GRUPO - SQLITE
// ==========================================

export type EstadoRevision =
  | 'EN_CURSO'
  | 'FINALIZADA';

export type EstadoColmenaRevision =
  | 'PENDIENTE'
  | 'REVISADA'
  | 'OMITIDA';

export type RevisionGuardada = {
  id: number;
  id_cliente: string;
  servidor_id: number | null;
  grupo_id: number;
  grupo_nombre: string;
  apiario_id: number;
  usuario_local_id: number;
  estado: EstadoRevision;
  fecha_inicio: string;
  fecha_fin: string | null;
  sincronizacion: 'PENDIENTE' | 'SINCRONIZADO';
};

export type ColmenaRevisionGuardada = {
  id: number;
  revision_local_id: number;
  colmena_id: number;
  codigo: string;
  codigo_qr: string;
  orden: number;
  estado: EstadoColmenaRevision;
  inspeccion_local_id: number | null;
  motivo_omision: string | null;
};

export type ProgresoRevision = {
  total: number;
  revisadas: number;
  omitidas: number;
  pendientes: number;
};

export type DetalleRevisionLocal = {
  revision: RevisionGuardada;
  colmenas: ColmenaRevisionGuardada[];
  progreso: ProgresoRevision;
  siguiente: ColmenaRevisionGuardada | null;
};

// ==========================================
// CONEXIÓN SQLITE
// ==========================================

let conexion:
  Promise<SQLite.SQLiteDatabase> | null = null;

async function iniciarBD() {
  // La tabla de inspecciones debe existir
  // antes de crear referencias hacia ella.
  await listarInspeccionesLocales();

  const db = await SQLite.openDatabaseAsync(
    'colmenas.db'
  );

  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS revisiones_locales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      id_cliente TEXT NOT NULL UNIQUE,
      servidor_id INTEGER,

      grupo_id INTEGER NOT NULL,
      grupo_nombre TEXT NOT NULL,
      apiario_id INTEGER NOT NULL,
      usuario_local_id INTEGER NOT NULL,

      estado TEXT NOT NULL DEFAULT 'EN_CURSO'
        CHECK(estado IN ('EN_CURSO', 'FINALIZADA')),

      fecha_inicio TEXT NOT NULL,
      fecha_fin TEXT,

      sincronizacion TEXT NOT NULL DEFAULT 'PENDIENTE'
        CHECK(
          sincronizacion IN ('PENDIENTE', 'SINCRONIZADO')
        )
    );

    CREATE TABLE IF NOT EXISTS revision_colmenas_locales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      revision_local_id INTEGER NOT NULL
        REFERENCES revisiones_locales(id),

      colmena_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      codigo_qr TEXT NOT NULL,
      orden INTEGER NOT NULL CHECK(orden > 0),

      estado TEXT NOT NULL DEFAULT 'PENDIENTE'
        CHECK(
          estado IN ('PENDIENTE', 'REVISADA', 'OMITIDA')
        ),

      inspeccion_local_id INTEGER
        REFERENCES inspecciones_locales(id),

      motivo_omision TEXT,

      UNIQUE(revision_local_id, colmena_id),
      UNIQUE(revision_local_id, orden)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_revision_grupo_en_curso
    ON revisiones_locales(grupo_id)
    WHERE estado = 'EN_CURSO';

    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_revision_inspeccion_vinculada
    ON revision_colmenas_locales(inspeccion_local_id);

    CREATE INDEX IF NOT EXISTS
      idx_revision_usuario
    ON revisiones_locales(usuario_local_id);
  `);

  // Preparar vínculo entre una inspección
  // local y una revisión por grupo.
  // No se elimina ninguna inspección.

  const columnas = await db.getAllAsync<{
    name: string;
  }>(
    'PRAGMA table_info(inspecciones_locales)'
  );

  if (
    !columnas.some(
      columna =>
        columna.name === 'sesion_revision_local_id'
    )
  ) {
    await db.execAsync(`
      ALTER TABLE inspecciones_locales
      ADD COLUMN sesion_revision_local_id INTEGER;
    `);
  }

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
// IDENTIDAD DEL USUARIO
// ==========================================

async function obtenerUsuarioId():
  Promise<number> {
  const sesion = await leerSesionGuardada();

  if (!sesion) {
    throw new Error(
      'Debes iniciar sesión para trabajar con revisiones oficiales.'
    );
  }

  if (
    !Number.isSafeInteger(sesion.usuario.id) ||
    sesion.usuario.id <= 0
  ) {
    throw new Error(
      'La sesión no tiene un usuario válido.'
    );
  }

  // No exigimos token vigente aquí:
  // el usuario ya autenticado puede
  // continuar trabajando sin conexión.
  //
  // El token sí se validará al sincronizar.

  return sesion.usuario.id;
}

// ==========================================
// VALIDAR IDENTIFICADORES
// ==========================================

function validarId(
  id: number,
  nombre: string
): void {
  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    throw new Error(
      `${nombre} inválido.`
    );
  }
}

// ==========================================
// CALCULAR PROGRESO
// ==========================================

function calcularProgreso(
  colmenas: ColmenaRevisionGuardada[]
): ProgresoRevision {
  return {
    total: colmenas.length,

    revisadas: colmenas.filter(
      colmena =>
        colmena.estado === 'REVISADA'
    ).length,

    omitidas: colmenas.filter(
      colmena =>
        colmena.estado === 'OMITIDA'
    ).length,

    pendientes: colmenas.filter(
      colmena =>
        colmena.estado === 'PENDIENTE'
    ).length,
  };
}

// ==========================================
// INICIAR REVISIÓN POR GRUPO
// ==========================================

export async function iniciarRevisionLocal(
  grupoId: number
): Promise<number> {
  validarId(grupoId, 'Grupo');

  const usuarioId = await obtenerUsuarioId();

  const catalogo = await leerCatalogoLocal(
    usuarioId
  );

  if (!catalogo) {
    throw new Error(
      'No existe un catálogo oficial descargado.'
    );
  }

  const grupo = catalogo.grupos.find(
    item => item.id === grupoId
  );

  if (!grupo) {
    throw new Error(
      'El grupo no existe en el catálogo oficial.'
    );
  }

  if (
    !grupo.colmena_ids.length ||
    new Set(grupo.colmena_ids).size !==
      grupo.colmena_ids.length
  ) {
    throw new Error(
      'El grupo no tiene un recorrido válido de colmenas.'
    );
  }

  // Guardar el recorrido en el orden
  // establecido por el catálogo.
  const colmenas = grupo.colmena_ids.map(
    id => {
      const colmena = catalogo.colmenas.find(
        item => item.id === id
      );

      if (
        !colmena ||
        colmena.apiario_id !== grupo.apiario_id
      ) {
        throw new Error(
          'El grupo tiene una colmena inexistente o de otro apiario.'
        );
      }

      return colmena;
    }
  );

  const db = await obtenerBD();

  // No abrir otra sesión del mismo grupo
  // si ya existe una en curso.
  const existente =
    await db.getFirstAsync<{
      id: number;
    }>(
      `SELECT id
       FROM revisiones_locales
       WHERE grupo_id = ?
         AND estado = 'EN_CURSO'
       LIMIT 1`,
      [grupoId]
    );

  if (existente) {
    throw new Error(
      'Este grupo ya tiene una revisión local en curso.'
    );
  }

  const idCliente = crearIdCliente();
  const fechaInicio = new Date().toISOString();

  let revisionId = 0;

  // Guardar sesión y recorrido
  // en una sola transacción.
  await db.withExclusiveTransactionAsync(
    async tx => {
      const resultado = await tx.runAsync(
        `INSERT INTO revisiones_locales (
          id_cliente,
          servidor_id,
          grupo_id,
          grupo_nombre,
          apiario_id,
          usuario_local_id,
          estado,
          fecha_inicio,
          fecha_fin,
          sincronizacion
        ) VALUES (
          ?, NULL, ?, ?, ?, ?,
          'EN_CURSO', ?, NULL, 'PENDIENTE'
        )`,
        [
          idCliente,
          grupo.id,
          grupo.nombre,
          grupo.apiario_id,
          usuarioId,
          fechaInicio,
        ]
      );

      revisionId = resultado.lastInsertRowId;

      for (
        let indice = 0;
        indice < colmenas.length;
        indice++
      ) {
        const colmena = colmenas[indice];

        await tx.runAsync(
          `INSERT INTO revision_colmenas_locales (
            revision_local_id,
            colmena_id,
            codigo,
            codigo_qr,
            orden,
            estado,
            inspeccion_local_id,
            motivo_omision
          ) VALUES (
            ?, ?, ?, ?, ?,
            'PENDIENTE', NULL, NULL
          )`,
          [
            revisionId,
            colmena.id,
            colmena.codigo,
            colmena.codigo_qr,
            indice + 1,
          ]
        );
      }
    }
  );

  return revisionId;
}

// ==========================================
// LISTAR REVISIONES DEL USUARIO
// ==========================================

export async function listarRevisionesLocales():
  Promise<RevisionGuardada[]> {
  const sesion = await leerSesionGuardada();

  // No mostrar registros de otro usuario.
  if (!sesion) {
    return [];
  }

  const db = await obtenerBD();

  return db.getAllAsync<RevisionGuardada>(
    `SELECT *
     FROM revisiones_locales
     WHERE usuario_local_id = ?
     ORDER BY id DESC`,
    [sesion.usuario.id]
  );
}

// ==========================================
// OBTENER REVISIÓN Y PROGRESO
// ==========================================

export async function obtenerRevisionLocal(
  revisionId: number
): Promise<DetalleRevisionLocal> {
  validarId(revisionId, 'Revisión');

  const usuarioId = await obtenerUsuarioId();
  const db = await obtenerBD();

  const revision =
    await db.getFirstAsync<RevisionGuardada>(
      `SELECT *
       FROM revisiones_locales
       WHERE id = ?
         AND usuario_local_id = ?`,
      [revisionId, usuarioId]
    );

  if (!revision) {
    throw new Error(
      'Revisión no encontrada para este usuario.'
    );
  }

  const colmenas =
    await db.getAllAsync<ColmenaRevisionGuardada>(
      `SELECT *
       FROM revision_colmenas_locales
       WHERE revision_local_id = ?
       ORDER BY orden ASC`,
      [revisionId]
    );

  const progreso = calcularProgreso(colmenas);

  const siguiente =
    colmenas.find(
      colmena =>
        colmena.estado === 'PENDIENTE'
    ) ?? null;

  return {
    revision,
    colmenas,
    progreso,
    siguiente,
  };
}

// ==========================================
// OMITIR UNA COLMENA
// ==========================================

export async function omitirColmenaLocal(
  revisionId: number,
  colmenaId: number,
  motivo: string
): Promise<void> {
  validarId(colmenaId, 'Colmena');

  if (motivo.trim().length > 300) {
    throw new Error(
      'El motivo no puede superar los 300 caracteres.'
    );
  }

  const detalle = await obtenerRevisionLocal(
    revisionId
  );

  if (detalle.revision.estado !== 'EN_CURSO') {
    throw new Error(
      'La revisión ya está finalizada.'
    );
  }

  const colmena = detalle.colmenas.find(
    item => item.colmena_id === colmenaId
  );

  if (!colmena) {
    throw new Error(
      'La colmena no pertenece a esta revisión.'
    );
  }

  if (colmena.estado === 'REVISADA') {
    throw new Error(
      'No puedes omitir una colmena ya revisada.'
    );
  }

  const db = await obtenerBD();

  const resultado = await db.runAsync(
    `UPDATE revision_colmenas_locales
     SET estado = 'OMITIDA',
         motivo_omision = ?
     WHERE revision_local_id = ?
       AND colmena_id = ?
       AND estado IN ('PENDIENTE', 'OMITIDA')`,
    [
      motivo.trim() || null,
      revisionId,
      colmenaId,
    ]
  );

  if (resultado.changes !== 1) {
    throw new Error(
      'No se pudo omitir la colmena.'
    );
  }
}

// ==========================================
// RECUPERAR COLMENA OMITIDA
// ==========================================

export async function recuperarColmenaOmitida(
  revisionId: number,
  colmenaId: number
): Promise<void> {
  validarId(colmenaId, 'Colmena');

  const detalle = await obtenerRevisionLocal(
    revisionId
  );

  if (detalle.revision.estado !== 'EN_CURSO') {
    throw new Error(
      'La revisión está finalizada.'
    );
  }

  const db = await obtenerBD();

  const resultado = await db.runAsync(
    `UPDATE revision_colmenas_locales
     SET estado = 'PENDIENTE',
         motivo_omision = NULL
     WHERE revision_local_id = ?
       AND colmena_id = ?
       AND estado = 'OMITIDA'`,
    [revisionId, colmenaId]
  );

  if (resultado.changes !== 1) {
    throw new Error(
      'La colmena no estaba omitida o no pertenece a esta revisión.'
    );
  }
}

// ==========================================
// VINCULAR UNA INSPECCIÓN GUARDADA
// ==========================================
//
// Solo marca REVISADA cuando ya existe
// una inspección real en SQLite.
// Nunca inventa una inspección.
// ==========================================

export async function vincularInspeccionARevision(
  revisionId: number,
  colmenaId: number,
  inspeccionLocalId: number
): Promise<void> {
  validarId(colmenaId, 'Colmena');
  validarId(inspeccionLocalId, 'Inspección');

  const detalle = await obtenerRevisionLocal(
    revisionId
  );

  if (detalle.revision.estado !== 'EN_CURSO') {
    throw new Error(
      'La revisión está finalizada.'
    );
  }

  const colmena = detalle.colmenas.find(
    item => item.colmena_id === colmenaId
  );

  if (!colmena) {
    throw new Error(
      'La colmena no pertenece a esta revisión.'
    );
  }

  if (colmena.estado === 'REVISADA') {
    throw new Error(
      'La colmena ya está revisada.'
    );
  }

  const db = await obtenerBD();

  // Validar y enlazar en una transacción.
  await db.withExclusiveTransactionAsync(
    async tx => {
      const inspeccion =
        await tx.getFirstAsync<{
          id: number;
          codigo_qr: string;
          usuario_local_id: number | null;
          estado: string;
          sesion_revision_local_id: number | null;
        }>(
          `SELECT
             id,
             codigo_qr,
             usuario_local_id,
             estado,
             sesion_revision_local_id
           FROM inspecciones_locales
           WHERE id = ?`,
          [inspeccionLocalId]
        );

      if (!inspeccion) {
        throw new Error(
          'La inspección local no existe.'
        );
      }

      if (
        inspeccion.usuario_local_id !==
        detalle.revision.usuario_local_id
      ) {
        throw new Error(
          'La inspección pertenece a otro usuario.'
        );
      }

      if (
        inspeccion.codigo_qr.toLowerCase() !==
        colmena.codigo_qr.toLowerCase()
      ) {
        throw new Error(
          'La inspección corresponde a otra colmena.'
        );
      }

      if (
        inspeccion.estado !== 'PENDIENTE' ||
        inspeccion.sesion_revision_local_id !== null
      ) {
        throw new Error(
          'La inspección ya fue enviada o vinculada a otra revisión.'
        );
      }

      const actualizado = await tx.runAsync(
        `UPDATE inspecciones_locales
         SET sesion_revision_local_id = ?
         WHERE id = ?
           AND estado = 'PENDIENTE'
           AND sesion_revision_local_id IS NULL`,
        [revisionId, inspeccionLocalId]
      );

      if (actualizado.changes !== 1) {
        throw new Error(
          'No se pudo vincular la inspección.'
        );
      }

      const marcado = await tx.runAsync(
        `UPDATE revision_colmenas_locales
         SET estado = 'REVISADA',
             inspeccion_local_id = ?,
             motivo_omision = NULL
         WHERE revision_local_id = ?
           AND colmena_id = ?
           AND estado IN ('PENDIENTE', 'OMITIDA')`,
        [
          inspeccionLocalId,
          revisionId,
          colmenaId,
        ]
      );

      if (marcado.changes !== 1) {
        throw new Error(
          'No se pudo marcar la colmena como revisada.'
        );
      }
    }
  );
}

// ==========================================
// FINALIZAR REVISIÓN
// ==========================================
//
// Se permite finalizar aunque queden
// colmenas pendientes, tal como lo
// permite la API oficial.
// ==========================================

export async function finalizarRevisionLocal(
  revisionId: number
): Promise<void> {
  const detalle = await obtenerRevisionLocal(
    revisionId
  );

  if (detalle.revision.estado !== 'EN_CURSO') {
    throw new Error(
      'La revisión ya está finalizada.'
    );
  }

  const db = await obtenerBD();

  const resultado = await db.runAsync(
    `UPDATE revisiones_locales
     SET estado = 'FINALIZADA',
         fecha_fin = ?
     WHERE id = ?
       AND usuario_local_id = ?
       AND estado = 'EN_CURSO'`,
    [
      new Date().toISOString(),
      revisionId,
      detalle.revision.usuario_local_id,
    ]
  );

  if (resultado.changes !== 1) {
    throw new Error(
      'No se pudo finalizar la revisión.'
    );
  }
}
