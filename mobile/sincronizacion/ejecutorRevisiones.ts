import {
  leerSesionGuardada,
  tokenVigente,
} from '../api/auth';

import {
  crearSesionRemota,
} from './clienteRevisiones';

import {
  confirmarSesionRevision,
} from './confirmarSesionRevision';

import {
  evaluarSiguienteOperacionRevision,
} from './ordenEjecucionRevisiones';

// Seguridad: deshabilitado por defecto.
// No activar hasta terminar las pruebas.
const ENVIOS_HABILITADOS =
  process.env.EXPO_PUBLIC_ENABLE_REVISION_SYNC === 'true';

export type EstadoEjecucionRevision =
  | 'EN_PROCESO'
  | 'SIN_OPERACIONES'
  | 'BLOQUEADA'
  | 'MODO_DIAGNOSTICO'
  | 'PENDIENTE_IMPLEMENTACION'
  | 'CONFIRMADA'
  | 'ERROR';

export type ResultadoEjecucionRevision = {
  estado: EstadoEjecucionRevision;
  mensaje: string;
  revisionLocalId?: number;
  revisionServidorId?: number;
};

let ejecutando = false;

export async function ejecutarSiguienteOperacionRevision():
  Promise<ResultadoEjecucionRevision> {

  if (ejecutando) {
    return {
      estado: 'EN_PROCESO',
      mensaje: 'Ya existe una sincronizacion en curso.',
    };
  }

  ejecutando = true;

  try {
    // 1. Verificar el orden seguro de la cola.
    const evaluacion =
      await evaluarSiguienteOperacionRevision();

    if (evaluacion.estado === 'COLA_VACIA') {
      return {
        estado: 'SIN_OPERACIONES',
        mensaje: evaluacion.mensaje,
      };
    }

    if (
      evaluacion.estado !== 'PREPARADA' ||
      !evaluacion.operacion
    ) {
      return {
        estado: 'BLOQUEADA',
        mensaje: evaluacion.mensaje,
      };
    }

    const operacion = evaluacion.operacion;

    // 2. Verificar el tipo de operacion.
    if (operacion.tipo !== 'CREAR_SESION') {
      return {
        estado: 'PENDIENTE_IMPLEMENTACION',
        mensaje:
          `Pendiente de implementar: ${operacion.tipo}.`,
      };
    }

    // 3. Mantener los envios desactivados
    // hasta completar las pruebas.
    if (!ENVIOS_HABILITADOS) {
      return {
        estado: 'MODO_DIAGNOSTICO',
        mensaje:
          'Sesion validada. El envio remoto esta desactivado.',
        revisionLocalId:
          operacion.revision_local_id,
      };
    }

    // 4. Validar la autenticacion.
    const sesion = await leerSesionGuardada();

    if (!sesion || !tokenVigente(sesion)) {
      return {
        estado: 'BLOQUEADA',
        mensaje:
          'La sesion no existe o el token esta vencido.',
      };
    }

    if (
      operacion.usuario_local_id !== sesion.usuario.id ||
      !operacion.id_cliente ||
      !Number.isSafeInteger(operacion.grupo_id) ||
      operacion.grupo_id <= 0
    ) {
      return {
        estado: 'BLOQUEADA',
        mensaje:
          'La operacion no coincide con el usuario o grupo.',
      };
    }

    // 5. Crear o recuperar la misma sesion
    // mediante el UUID id_cliente.
    const remota = await crearSesionRemota(
      operacion.grupo_id,
      operacion.id_cliente,
      sesion.accessToken
    );

    // 6. Confirmar el resultado en SQLite.
    await confirmarSesionRevision(
      operacion.revision_local_id,
      operacion.clave,
      remota
    );

    return {
      estado: 'CONFIRMADA',
      mensaje:
        'Sesion remota vinculada correctamente.',
      revisionLocalId:
        operacion.revision_local_id,
      revisionServidorId: remota.id,
    };

  } catch (error) {
    return {
      estado: 'ERROR',
      mensaje:
        error instanceof Error
          ? error.message
          : 'Error desconocido de sincronizacion.',
    };

  } finally {
    ejecutando = false;
  }
}
