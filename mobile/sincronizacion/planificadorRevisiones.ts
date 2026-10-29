
import {
  listarRevisionesLocales,
  obtenerRevisionLocal,
} from '../database/revisiones';

import {
  listarInspeccionesLocales,
} from '../database/inspecciones';

// ==========================================
// COLMENARES TRES PINOS
// PLANIFICADOR DE REVISIONES
// PASO 28
// ==========================================

// Este archivo SOLO consulta SQLite.
//
// NO realiza peticiones HTTP.
// NO cambia estados.
// NO sincroniza registros.
// NO elimina información.

export type TipoOperacionRevision =
  | 'CREAR_SESION'
  | 'ENVIAR_INSPECCION'
  | 'OMITIR_COLMENA'
  | 'FINALIZAR_SESION';

export type OperacionRevision = {
  orden: number;
  tipo: TipoOperacionRevision;

  revisionLocalId: number;
  revisionServidorId: number | null;

  grupoId: number;

  colmenaId?: number;
  inspeccionLocalId?: number;

  idCliente?: string;
  motivo?: string | null;
};

export type ProblemaRevision = {
  revisionLocalId: number;
  mensaje: string;
};

export type PlanRevisionIndividual = {
  revisionLocalId: number;
  grupoId: number;
  grupoNombre: string;

  estado: 'EN_CURSO' | 'FINALIZADA';

  operaciones: OperacionRevision[];
  problemas: ProblemaRevision[];

  listoParaRevisar: boolean;
};

export type PlanSincronizacionRevisiones = {
  totalRevisiones: number;
  revisionesPendientes: number;

  totalOperaciones: number;
  totalProblemas: number;

  planes: PlanRevisionIndividual[];

  // Siempre false en este paso.
  enviosHabilitados: false;
};

// ==========================================
// GENERAR PLAN
// ==========================================

export async function generarPlanRevisiones():
  Promise<PlanSincronizacionRevisiones> {

  // 1. Consultar revisiones locales
  // pertenecientes a la sesión actual.

  const revisiones =
    await listarRevisionesLocales();

  // 2. Consultar inspecciones SQLite.

  const inspecciones =
    await listarInspeccionesLocales();

  const planes:
    PlanRevisionIndividual[] = [];

  // 3. Examinar las revisiones
  // una por una.

  for (const revision of revisiones) {

    // Las sesiones completamente
    // sincronizadas no generan
    // nuevas operaciones.
    if (
      revision.sincronizacion ===
      'SINCRONIZADO'
    ) {
      continue;
    }

    const operaciones:
      OperacionRevision[] = [];

    const problemas:
      ProblemaRevision[] = [];

    const agregarProblema = (
      mensaje: string
    ) => {
      problemas.push({
        revisionLocalId:
          revision.id,
        mensaje,
      });
    };

    const agregarOperacion = (
      operacion: Omit<
        OperacionRevision,
        'orden'
      >
    ) => {
      operaciones.push({
        ...operacion,
        orden:
          operaciones.length + 1,
      });
    };

    try {

      // ====================================
      // PASO A. VALIDAR SESIÓN
      // ====================================

      const detalle =
        await obtenerRevisionLocal(
          revision.id
        );

      if (
        !revision.id_cliente ||
        !Number.isSafeInteger(
          revision.grupo_id
        )
      ) {
        agregarProblema(
          'La revisión tiene identificadores inválidos.'
        );
      }

      if (
        revision.servidor_id !== null &&
        (
          !Number.isSafeInteger(
            revision.servidor_id
          ) ||
          revision.servidor_id <= 0
        )
      ) {
        agregarProblema(
          'La revisión tiene un identificador de servidor inválido.'
        );
      }

      // ====================================
      // PASO B. CREAR SESIÓN EN FASTAPI
      // ====================================

      // Solo se planifica crearla cuando
      // todavía no existe un ID de servidor.

      if (
        revision.servidor_id === null
      ) {
        agregarOperacion({
          tipo: 'CREAR_SESION',

          revisionLocalId:
            revision.id,

          revisionServidorId:
            null,

          grupoId:
            revision.grupo_id,

          idCliente:
            revision.id_cliente,
        });
      }

      // ====================================
      // PASO C. INSPECCIONES
      // ====================================

      for (
        const colmena of
          detalle.colmenas
      ) {

        // Una colmena pendiente
        // todavía no tiene trabajo
        // que enviar.
        if (
          colmena.estado ===
          'PENDIENTE'
        ) {
          continue;
        }

        if (
          colmena.estado !==
          'REVISADA'
        ) {
          continue;
        }

        // Debe existir una inspección
        // local vinculada.

        if (
          colmena.inspeccion_local_id ===
          null
        ) {
          agregarProblema(
            `La colmena ${colmena.codigo} está revisada, pero no tiene inspección local vinculada.`
          );

          continue;
        }

        const inspeccion =
          inspecciones.find(
            item =>
              item.id ===
              colmena.inspeccion_local_id
          );

        if (!inspeccion) {
          agregarProblema(
            `No se encontró la inspección local ${colmena.inspeccion_local_id}.`
          );

          continue;
        }

        // Impedir mezclar datos
        // de diferentes usuarios.

        if (
          inspeccion.usuario_local_id !==
          revision.usuario_local_id
        ) {
          agregarProblema(
            `La inspección ${inspeccion.id} pertenece a otro usuario.`
          );

          continue;
        }

        // Comprobar colmena correcta.

        if (
          inspeccion.codigo_qr
            .trim()
            .toLowerCase() !==
          colmena.codigo_qr
            .trim()
            .toLowerCase()
        ) {
          agregarProblema(
            `La inspección ${inspeccion.id} no corresponde al QR de la colmena ${colmena.codigo}.`
          );

          continue;
        }

        // Si ya fue sincronizada,
        // no volver a enviarla.
        //
        // En la integración real habrá
        // que comprobar además que
        // pertenece a la sesión remota
        // correcta.

        if (
          inspeccion.estado ===
          'SINCRONIZADO'
        ) {
          agregarProblema(
            `La inspección ${inspeccion.id} ya figura sincronizada. Debe verificarse su asociación con la revisión remota antes de continuar.`
          );

          continue;
        }

        if (
          inspeccion.estado !==
          'PENDIENTE'
        ) {
          agregarProblema(
            `La inspección ${inspeccion.id} tiene un estado no permitido para el envío.`
          );

          continue;
        }

        if (
          inspeccion.servidor_id !== null
        ) {
          agregarProblema(
            `La inspección ${inspeccion.id} ya tiene un ID de servidor, pero figura pendiente.`
          );

          continue;
        }

        if (
          !inspeccion.id_cliente
        ) {
          agregarProblema(
            `La inspección ${inspeccion.id} no tiene UUID de cliente.`
          );

          continue;
        }

        // La inspección debe enviarse
        // con sesion_revision_id obtenido
        // de la sesión remota.

        agregarOperacion({
          tipo:
            'ENVIAR_INSPECCION',

          revisionLocalId:
            revision.id,

          revisionServidorId:
            revision.servidor_id,

          grupoId:
            revision.grupo_id,

          colmenaId:
            colmena.colmena_id,

          inspeccionLocalId:
            inspeccion.id,

          idCliente:
            inspeccion.id_cliente,
        });
      }

      // ====================================
      // PASO D. OMISIONES
      // ====================================

      for (
        const colmena of
          detalle.colmenas
      ) {
        if (
          colmena.estado !==
          'OMITIDA'
        ) {
          continue;
        }

        // No hay que fabricar
        // inspecciones para colmenas
        // omitidas.

        agregarOperacion({
          tipo:
            'OMITIR_COLMENA',

          revisionLocalId:
            revision.id,

          revisionServidorId:
            revision.servidor_id,

          grupoId:
            revision.grupo_id,

          colmenaId:
            colmena.colmena_id,

          motivo:
            colmena.motivo_omision,
        });
      }

      // ====================================
      // PASO E. FINALIZACIÓN
      // ====================================

      // Nunca finalizar automáticamente
      // una sesión que sigue EN_CURSO
      // en SQLite.

      if (
        revision.estado ===
        'FINALIZADA'
      ) {
        agregarOperacion({
          tipo:
            'FINALIZAR_SESION',

          revisionLocalId:
            revision.id,

          revisionServidorId:
            revision.servidor_id,

          grupoId:
            revision.grupo_id,
        });
      }

    } catch (error) {
      agregarProblema(
        error instanceof Error
          ? error.message
          : 'No se pudo analizar la revisión.'
      );
    }

    // ======================================
    // RESULTADO DE ESTA REVISIÓN
    // ======================================

    planes.push({
      revisionLocalId:
        revision.id,

      grupoId:
        revision.grupo_id,

      grupoNombre:
        revision.grupo_nombre,

      estado:
        revision.estado,

      operaciones,

      problemas,

      listoParaRevisar:
        problemas.length === 0,
    });
  }

  // ========================================
  // RESUMEN GLOBAL
  // ========================================

  return {
    totalRevisiones:
      revisiones.length,

    revisionesPendientes:
      planes.length,

    totalOperaciones:
      planes.reduce(
        (total, plan) =>
          total +
          plan.operaciones.length,
        0
      ),

    totalProblemas:
      planes.reduce(
        (total, plan) =>
          total +
          plan.problemas.length,
        0
      ),

    planes,

    enviosHabilitados: false,
  };
}
