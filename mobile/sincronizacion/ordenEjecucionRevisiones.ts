
import {
  leerSesionGuardada,
  tokenVigente,
} from '../api/auth';

import {
  listarInspeccionesLocales,
} from '../database/inspecciones';

import {
  obtenerRevisionLocal,
} from '../database/revisiones';

import {
  listarColaRevisiones,
} from './colaRevisiones';

import type {
  OperacionEnCola,
} from './colaRevisiones';

// ==========================================
// COLMENARES TRES PINOS
// ORDEN SEGURO DE SINCRONIZACIÓN
// PASO 31
// ==========================================
//
// SOLO LECTURA:
//
// - No envía solicitudes HTTP.
// - No cambia registros de SQLite.
// - No marca operaciones como confirmadas.
// - No elimina información.
// - No activa la sincronización real.
//
// Este archivo comprueba qué operación
// podría procesarse en un futuro ejecutor.
// ==========================================

export type EstadoEvaluacionCola =
  | 'SIN_SESION'
  | 'TOKEN_VENCIDO'
  | 'COLA_VACIA'
  | 'PREPARADA'
  | 'BLOQUEADA';

export type EvaluacionCola = {
  estado: EstadoEvaluacionCola;
  mensaje: string;

  operacion: OperacionEnCola | null;

  operacionesTotales: number;
  operacionesPendientes: number;
  operacionesConfirmadas: number;
  operacionesConError: number;

  // Siempre false en este paso.
  enviosRealesHabilitados: false;
};

// ==========================================
// CONSTRUIR RESPUESTA
// ==========================================

function construirResultado(
  estado: EstadoEvaluacionCola,
  mensaje: string,
  operaciones: OperacionEnCola[],
  operacion: OperacionEnCola | null = null
): EvaluacionCola {

  return {
    estado,
    mensaje,
    operacion,

    operacionesTotales:
      operaciones.length,

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

    enviosRealesHabilitados: false,
  };
}

// ==========================================
// ORDEN DE PRIORIDAD
// ==========================================

function prioridad(
  operacion: OperacionEnCola
): number {

  switch (operacion.tipo) {
    case 'CREAR_SESION':
      return 1;

    case 'ENVIAR_INSPECCION':
      return 2;

    case 'OMITIR_COLMENA':
      return 3;

    case 'FINALIZAR_SESION':
      return 4;
  }
}

// ==========================================
// VALIDAR IDENTIFICADOR
// ==========================================

function idValido(
  valor: number | null
): valor is number {

  return (
    typeof valor === 'number' &&
    Number.isSafeInteger(valor) &&
    valor > 0
  );
}

// ==========================================
// COMPROBAR OPERACIÓN
// ==========================================

export async function evaluarSiguienteOperacionRevision():
  Promise<EvaluacionCola> {

  // ========================================
  // 1. VERIFICAR SESIÓN
  // ========================================

  const sesion =
    await leerSesionGuardada();

  if (!sesion) {
    return construirResultado(
      'SIN_SESION',
      'No hay una sesión iniciada. No se procesarán registros.',
      []
    );
  }

  const usuarioId =
    sesion.usuario.id;

  if (!idValido(usuarioId)) {
    return construirResultado(
      'BLOQUEADA',
      'La sesión tiene un identificador de usuario inválido.',
      []
    );
  }

  // ========================================
  // 2. CONSULTAR LA COLA
  // ========================================

  const operaciones =
    await listarColaRevisiones();

  if (operaciones.length === 0) {
    return construirResultado(
      'COLA_VACIA',
      'No existen operaciones activas en la cola de este usuario.',
      operaciones
    );
  }

  // ========================================
  // 3. VALIDAR TOKEN
  // ========================================

  if (!tokenVigente(sesion)) {
    return construirResultado(
      'TOKEN_VENCIDO',
      'El token venció. Los registros siguen guardados y se necesita iniciar sesión nuevamente.',
      operaciones
    );
  }

  // ========================================
  // 4. VERIFICAR PROPIETARIO
  // ========================================

  for (const operacion of operaciones) {
    if (
      operacion.usuario_local_id !==
      usuarioId
    ) {
      return construirResultado(
        'BLOQUEADA',
        'Se detectó una operación perteneciente a otro usuario.',
        operaciones
      );
    }
  }

  // ========================================
  // 5. ORDENAR POR REVISIÓN
  // ========================================

  const ordenadas = [...operaciones].sort(
    (a, b) => {

      if (
        a.revision_local_id !==
        b.revision_local_id
      ) {
        return (
          a.revision_local_id -
          b.revision_local_id
        );
      }

      const diferencia =
        prioridad(a) - prioridad(b);

      if (diferencia !== 0) {
        return diferencia;
      }

      return a.creado_en.localeCompare(
        b.creado_en
      );
    }
  );

  const idsRevisiones = [
    ...new Set(
      ordenadas.map(
        item => item.revision_local_id
      )
    ),
  ];

  // Consultar inspecciones locales
  // para validar que correspondan
  // al usuario y a la colmena.

  const inspecciones =
    await listarInspeccionesLocales();

  // ========================================
  // 6. EXAMINAR CADA REVISIÓN
  // ========================================

  for (const revisionId of idsRevisiones) {

    const items = ordenadas.filter(
      item =>
        item.revision_local_id ===
        revisionId
    );

    let detalle;

    try {
      detalle =
        await obtenerRevisionLocal(
          revisionId
        );
    } catch (error) {
      return construirResultado(
        'BLOQUEADA',
        error instanceof Error
          ? error.message
          : 'No se pudo consultar la revisión local.',
        operaciones
      );
    }

    const revision =
      detalle.revision;

    // ======================================
    // 7. REVISIÓN Y USUARIO CORRECTOS
    // ======================================

    if (
      revision.usuario_local_id !==
      usuarioId
    ) {
      return construirResultado(
        'BLOQUEADA',
        `La revisión ${revisionId} pertenece a otro usuario.`,
        operaciones
      );
    }

    if (
      items.some(
        item =>
          item.grupo_id !==
          revision.grupo_id
      )
    ) {
      return construirResultado(
        'BLOQUEADA',
        `La revisión ${revisionId} tiene operaciones vinculadas a otro grupo.`,
        operaciones
      );
    }

    // ======================================
    // 8. CREACIÓN DE SESIÓN
    // ======================================

    const creaciones = items.filter(
      item =>
        item.tipo === 'CREAR_SESION'
    );

    if (creaciones.length > 1) {
      return construirResultado(
        'BLOQUEADA',
        `La revisión ${revisionId} tiene más de una operación activa para crear su sesión.`,
        operaciones
      );
    }

    const crearSesion =
      creaciones[0];

    // Sin ID remoto, primero debemos
    // crear la sesión de revisión.

    if (
      revision.servidor_id === null
    ) {
      if (!crearSesion) {
        return construirResultado(
          'BLOQUEADA',
          `La revisión ${revisionId} no tiene ID remoto ni una operación para crear su sesión.`,
          operaciones
        );
      }

      if (
        crearSesion.estado ===
        'CONFIRMADA'
      ) {
        return construirResultado(
          'BLOQUEADA',
          `La sesión ${revisionId} figura confirmada, pero no tiene ID de FastAPI. Se necesita reconciliar el resultado.`,
          operaciones
        );
      }

      if (
        crearSesion.estado ===
        'ERROR'
      ) {
        return construirResultado(
          'BLOQUEADA',
          `La creación de la sesión ${revisionId} registró un error. Debe revisarse antes de reintentar.`,
          operaciones
        );
      }

      if (
        crearSesion.id_cliente !==
        revision.id_cliente
      ) {
        return construirResultado(
          'BLOQUEADA',
          `El UUID de la sesión ${revisionId} no coincide con SQLite.`,
          operaciones
        );
      }

      // Solo hemos validado su
      // posición en el orden.
      // No la enviamos.

      return construirResultado(
        'PREPARADA',
        `La siguiente operación es crear la sesión de revisión ${revisionId}.`,
        operaciones,
        crearSesion
      );
    }

    // ======================================
    // 9. ID REMOTO VÁLIDO
    // ======================================

    if (
      !idValido(
        revision.servidor_id
      )
    ) {
      return construirResultado(
        'BLOQUEADA',
        `La revisión ${revisionId} tiene un ID remoto inválido.`,
        operaciones
      );
    }

    if (
      crearSesion &&
      crearSesion.estado !==
        'CONFIRMADA'
    ) {
      return construirResultado(
        'BLOQUEADA',
        `La revisión ${revisionId} tiene ID remoto, pero su operación de creación no está confirmada.`,
        operaciones
      );
    }

    // ======================================
    // 10. INSPECCIONES Y OMISIONES
    // ======================================

    for (const item of items) {

      if (
        item.tipo ===
        'CREAR_SESION'
      ) {
        continue;
      }

      if (
        item.estado ===
        'CONFIRMADA'
      ) {
        continue;
      }

      if (
        item.estado ===
        'ERROR'
      ) {
        return construirResultado(
          'BLOQUEADA',
          `La operación ${item.clave} registró un error. Debe revisarse antes de reintentar.`,
          operaciones
        );
      }

      if (
        item.revision_servidor_id !==
          null &&
        item.revision_servidor_id !==
          revision.servidor_id
      ) {
        return construirResultado(
          'BLOQUEADA',
          `La operación ${item.clave} contiene un ID de sesión remota diferente.`,
          operaciones
        );
      }

      // ====================================
      // INSPECCIÓN
      // ====================================

      if (
        item.tipo ===
        'ENVIAR_INSPECCION'
      ) {
        if (
          !idValido(
            item.inspeccion_local_id
          ) ||
          !idValido(
            item.colmena_id
          )
        ) {
          return construirResultado(
            'BLOQUEADA',
            'La operación tiene una inspección o colmena inválida.',
            operaciones
          );
        }

        const colmena =
          detalle.colmenas.find(
            registro =>
              registro.colmena_id ===
              item.colmena_id
          );

        if (
          !colmena ||
          colmena.estado !==
            'REVISADA' ||
          colmena.inspeccion_local_id !==
            item.inspeccion_local_id
        ) {
          return construirResultado(
            'BLOQUEADA',
            `La inspección ${item.inspeccion_local_id} no está correctamente vinculada a la revisión.`,
            operaciones
          );
        }

        const inspeccion =
          inspecciones.find(
            registro =>
              registro.id ===
              item.inspeccion_local_id
          );

        if (
          !inspeccion ||
          inspeccion.usuario_local_id !==
            usuarioId ||
          inspeccion.codigo_qr
            .trim()
            .toLowerCase() !==
            colmena.codigo_qr
              .trim()
              .toLowerCase()
        ) {
          return construirResultado(
            'BLOQUEADA',
            `La inspección ${item.inspeccion_local_id} no coincide con el usuario o la colmena.`,
            operaciones
          );
        }

        if (
          inspeccion.estado !==
            'PENDIENTE' ||
          inspeccion.servidor_id !==
            null ||
          inspeccion.id_cliente !==
            item.id_cliente
        ) {
          return construirResultado(
            'BLOQUEADA',
            `La inspección ${item.inspeccion_local_id} tiene un estado, ID remoto o UUID inconsistente.`,
            operaciones
          );
        }
      }

      // ====================================
      // OMISIÓN
      // ====================================

      if (
        item.tipo ===
        'OMITIR_COLMENA'
      ) {
        if (
          !idValido(
            item.colmena_id
          )
        ) {
          return construirResultado(
            'BLOQUEADA',
            'La omisión no tiene una colmena válida.',
            operaciones
          );
        }

        const colmena =
          detalle.colmenas.find(
            registro =>
              registro.colmena_id ===
              item.colmena_id
          );

        if (
          !colmena ||
          colmena.estado !==
            'OMITIDA'
        ) {
          return construirResultado(
            'BLOQUEADA',
            `La colmena ${item.colmena_id} ya no figura omitida. Debes preparar nuevamente la cola.`,
            operaciones
          );
        }

        if (
          (item.motivo ?? '') !==
          (colmena.motivo_omision ?? '')
        ) {
          return construirResultado(
            'BLOQUEADA',
            `Cambió el motivo de omisión de la colmena ${item.colmena_id}. Debes preparar nuevamente la cola.`,
            operaciones
          );
        }
      }

      // ====================================
      // FINALIZACIÓN
      // ====================================

      if (
        item.tipo ===
        'FINALIZAR_SESION'
      ) {
        if (
          revision.estado !==
          'FINALIZADA'
        ) {
          return construirResultado(
            'BLOQUEADA',
            `La revisión ${revisionId} sigue abierta localmente y no se puede finalizar en FastAPI.`,
            operaciones
          );
        }

        const operacionesAnteriores =
          items.filter(
            anterior =>
              anterior.tipo !==
                'CREAR_SESION' &&
              anterior.tipo !==
                'FINALIZAR_SESION' &&
              anterior.estado !==
                'CONFIRMADA'
          );

        if (
          operacionesAnteriores.length > 0
        ) {
          return construirResultado(
            'BLOQUEADA',
            `La revisión ${revisionId} todavía tiene inspecciones u omisiones sin confirmar.`,
            operaciones
          );
        }
      }

      // El ID remoto se obtiene de
      // la revisión oficial guardada
      // en SQLite.
      //
      // Esto NO cambia la cola.

      return construirResultado(
        'PREPARADA',
        `Siguiente operación: ${item.tipo} de la revisión ${revisionId}.`,
        operaciones,
        {
          ...item,
          revision_servidor_id:
            revision.servidor_id,
        }
      );
    }
  }

  // ========================================
  // 11. SIN OPERACIONES POR PROCESAR
  // ========================================

  return construirResultado(
    'COLA_VACIA',
    'No hay operaciones pendientes de procesamiento. Las operaciones de la cola actual ya figuran confirmadas.',
    operaciones
  );
}
