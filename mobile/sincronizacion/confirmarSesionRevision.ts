import * as SQLite from 'expo-sqlite';

import { leerSesionGuardada } from '../api/auth';
import { obtenerRevisionLocal } from '../database/revisiones';
import { listarColaRevisiones } from './colaRevisiones';

import type { SesionRevisionRemota } from './clienteRevisiones';

type RevisionDB = {
  id: number;
  id_cliente: string;
  usuario_local_id: number;
  grupo_id: number;
  servidor_id: number | null;
};

type OperacionDB = {
  estado: 'PENDIENTE' | 'CONFIRMADA' | 'ERROR';
  tipo: string;
  usuario_local_id: number;
  revision_local_id: number;
  revision_servidor_id: number | null;
  id_cliente: string | null;
  activa: number;
};

function idValido(valor: number): boolean {
  return Number.isSafeInteger(valor) && valor > 0;
}

export async function confirmarSesionRevision(
  revisionLocalId: number,
  claveOperacion: string,
  remota: SesionRevisionRemota
): Promise<'CONFIRMADA' | 'YA_CONFIRMADA'> {
  if (
    !idValido(revisionLocalId) ||
    !claveOperacion.trim() ||
    !idValido(remota.id)
  ) {
    throw new Error('Identificadores de revision invalidos.');
  }

  const sesion = await leerSesionGuardada();

  if (!sesion || !idValido(sesion.usuario.id)) {
    throw new Error('No existe una sesion local valida.');
  }

  const usuarioId = sesion.usuario.id;
  const detalle = await obtenerRevisionLocal(revisionLocalId);
  const local = detalle.revision;

  if (
    local.usuario_local_id !== usuarioId ||
    remota.usuario_id !== usuarioId ||
    remota.grupo_id !== local.grupo_id ||
    !remota.id_cliente ||
    remota.id_cliente.toLowerCase() !==
      local.id_cliente.toLowerCase() ||
    remota.estado !== 'EN_CURSO'
  ) {
    throw new Error(
      'La respuesta de FastAPI no coincide con la revision local.'
    );
  }

  // Asegurar que la cola SQLite ya existe.
  await listarColaRevisiones();

  const db = await SQLite.openDatabaseAsync('colmenas.db');

  return db.withExclusiveTransactionAsync(async tx => {
    const actual = await tx.getFirstAsync<RevisionDB>(
      `SELECT id, id_cliente, usuario_local_id,
              grupo_id, servidor_id
       FROM revisiones_locales
       WHERE id = ? AND usuario_local_id = ?`,
      [revisionLocalId, usuarioId]
    );

    const operacion = await tx.getFirstAsync<OperacionDB>(
      `SELECT estado, tipo, usuario_local_id,
              revision_local_id, revision_servidor_id,
              id_cliente, activa
       FROM cola_revision_operaciones
       WHERE clave = ?`,
      [claveOperacion]
    );

    if (
      !actual ||
      !operacion ||
      actual.grupo_id !== remota.grupo_id ||
      actual.id_cliente.toLowerCase() !==
        remota.id_cliente.toLowerCase() ||
      operacion.tipo !== 'CREAR_SESION' ||
      operacion.usuario_local_id !== usuarioId ||
      operacion.revision_local_id !== revisionLocalId ||
      operacion.id_cliente?.toLowerCase() !==
        remota.id_cliente.toLowerCase() ||
      operacion.activa !== 1
    ) {
      throw new Error(
        'La revision o la operacion cambiaron. No se confirmo.'
      );
    }

    // Permitir repetir la confirmacion sin duplicar datos.
    if (
      actual.servidor_id === remota.id &&
      operacion.estado === 'CONFIRMADA' &&
      operacion.revision_servidor_id === remota.id
    ) {
      return 'YA_CONFIRMADA';
    }

    if (
      actual.servidor_id !== null ||
      operacion.estado !== 'PENDIENTE' ||
      operacion.revision_servidor_id !== null
    ) {
      throw new Error(
        'Existe un estado remoto incompatible. Requiere revision.'
      );
    }

    const duplicada = await tx.getFirstAsync<{ id: number }>(
      `SELECT id FROM revisiones_locales
       WHERE servidor_id = ? AND id <> ?
       LIMIT 1`,
      [remota.id, revisionLocalId]
    );

    if (duplicada) {
      throw new Error(
        'Otra revision local utiliza el mismo ID remoto.'
      );
    }

    const revisionActualizada = await tx.runAsync(
      `UPDATE revisiones_locales
       SET servidor_id = ?
       WHERE id = ?
         AND usuario_local_id = ?
         AND servidor_id IS NULL`,
      [remota.id, revisionLocalId, usuarioId]
    );

    if (revisionActualizada.changes !== 1) {
      throw new Error('No se pudo vincular la revision remota.');
    }

    const colaActualizada = await tx.runAsync(
      `UPDATE cola_revision_operaciones
       SET estado = 'CONFIRMADA',
           revision_servidor_id = ?,
           actualizado_en = ?
       WHERE clave = ?
         AND usuario_local_id = ?
         AND revision_local_id = ?
         AND tipo = 'CREAR_SESION'
         AND estado = 'PENDIENTE'
         AND activa = 1
         AND revision_servidor_id IS NULL`,
      [
        remota.id,
        new Date().toISOString(),
        claveOperacion,
        usuarioId,
        revisionLocalId,
      ]
    );

    if (colaActualizada.changes !== 1) {
      throw new Error('No se pudo confirmar la cola.');
    }

    return 'CONFIRMADA';
  });
}
