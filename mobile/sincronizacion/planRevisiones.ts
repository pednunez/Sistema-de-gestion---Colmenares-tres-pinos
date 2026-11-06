
import {
  leerSesionGuardada,
} from '../api/auth';

import {
  listarInspeccionesLocales,
} from '../database/inspecciones';

import {
  listarRevisionesLocales,
  obtenerRevisionLocal,
} from '../database/revisiones';

// ==========================================
// COLMENARES TRES PINOS
// PLANIFICADOR DE REVISIONES
// ==========================================
//
// SOLO LECTURA.
//
// Este archivo:
// - Consulta SQLite.
// - Ordena operaciones pendientes.
// - Detecta inconsistencias.
// - No envía datos a FastAPI.
// - No modifica registros.
// - No requiere conexión a internet.
//
// ==========================================

export type TipoPasoRevision =
  | 'CREAR_SESION'
  | 'VERIFICAR_SESION'
  | 'ENVIAR_INSPECCION'
  | 'OMITIR_COLMENA'
  | 'FINALIZAR_SESION';

export type PasoRevision = {
  orden: number;
  tipo: TipoPasoRevision;
  descripcion: string;
  revisionLocalId: number;
  colmenaId: number | null;
  inspeccionLocalId: number | null;
};

export type EstadoPlanRevision =
  | 'PREPARADO'
  | 'BLOQUEADO'
  | 'SIN_OPERACIONES';

export type PlanRevision = {
  revisionLocalId: number;
  revisionClienteId: string;
  grupoId: number;
  grupoNombre: string;

  estadoLocal: 'EN_CURSO' | 'FINALIZADA';
  estadoPlan: EstadoPlanRevision;

  totalColmenas: number;
  revisadas: number;
  omitidas: number;
  pendientes: number;

  pasos: PasoRevision[];
  problemas: string[];
};

export type ResultadoPlanRevisiones = {
  estado:
    | 'SIN_SESION'
    | 'SIN_REVISIONES'
    | 'PLAN_GENERADO';

  mensaje: string;

  totalRevisiones: number;
  totalOperaciones: number;
  totalBloqueadas: number;

  planes: PlanRevision[];
};

// ==========================================
// CONSTRUIR PASO
// ==========================================

function agregarPaso(
  pasos: PasoRevision[],
  tipo: TipoPasoRevision,
  descripcion: string,
  revisionLocalId: number,
  colmenaId: number | null = null,
  inspeccionLocalId: number | null = null
): void {
  pasos.push({
    orden: pasos.length + 1,
    tipo,
    descripcion,
    revisionLocalId,
    colmenaId,
    inspeccionLocalId,
  });
}

// ==========================================
// VALIDAR IDENTIFICADOR
// ==========================================

function idValido(
  valor: number | null
): boolean {
  return (
    typeof valor === 'number' &&
    Number.isSafeInteger(valor) &&
    valor > 0
  );
}

// ==========================================
// GENERAR PLANES
// ==========================================

export async function prepararPlanRevisiones():
  Promise<ResultadoPlanRevisiones> {

  // ========================================
  // 1. OBTENER SESIÓN
  // ========================================

  const sesion =
    await leerSesionGuardada();

  if (!sesion) {
    return {
      estado: 'SIN_SESION',

      mensaje:
        'No hay una sesión iniciada. No es posible preparar revisiones oficiales.',

      totalRevisiones: 0,
      totalOperaciones: 0,
      totalBloqueadas: 0,

      planes: [],
    };
  }

  const usuarioId =
    sesion.usuario.id;

  // ========================================
  // 2. CONSULTAR SQLITE
  // ========================================

  const [
    revisiones,
    inspecciones,
  ] = await Promise.all([
    listarRevisionesLocales(),
    listarInspeccionesLocales(),
  ]);

  if (revisiones.length === 0) {
    return {
      estado: 'SIN_REVISIONES',

      mensaje:
        'Este usuario no tiene revisiones locales.',

      totalRevisiones: 0,
      totalOperaciones: 0,
      totalBloqueadas: 0,

      planes: [],
    };
  }

  // Crear índice de inspecciones locales.
  const inspeccionesPorId = new Map(
    inspecciones.map(
      inspeccion => [
        inspeccion.id,
        inspeccion,
      ]
    )
  );

  const planes: PlanRevision[] = [];

  // ========================================
  // 3. RECORRER REVISIONES
  // ========================================

  for (const revision of revisiones) {

    const pasos: PasoRevision[] = [];
    const problemas: string[] = [];

    // Consultar el recorrido completo.
    const detalle =
      await obtenerRevisionLocal(
        revision.id
      );

    // ======================================
    // VALIDAR PROPIETARIO
    // ======================================

    if (
      revision.usuario_local_id !== usuarioId
    ) {
      problemas.push(
        'La revisión pertenece a otro usuario.'
      );
    }

    // ======================================
    // VALIDAR IDENTIFICADORES
    // ======================================

    if (!idValido(revision.grupo_id)) {
      problemas.push(
        'El grupo tiene un identificador inválido.'
      );
    }

    if (!revision.id_cliente) {
      problemas.push(
        'La revisión no tiene un UUID de cliente.'
      );
    }

    if (
      revision.servidor_id !== null &&
      !idValido(revision.servidor_id)
    ) {
      problemas.push(
        'El identificador remoto de la revisión no es válido.'
      );
    }

    if (
      revision.sincronizacion ===
        'SINCRONIZADO' &&
      revision.servidor_id === null
    ) {
      problemas.push(
        'La revisión figura sincronizada, pero no tiene identificador remoto.'
      );
    }

    if (detalle.colmenas.length === 0) {
      problemas.push(
        'La revisión no contiene colmenas.'
      );
    }

    // ======================================
    // 4. CREAR O VERIFICAR SESIÓN
    // ======================================

    if (
      revision.servidor_id === null
    ) {
      agregarPaso(
        pasos,
        'CREAR_SESION',

        `Crear sesión remota para el grupo ${revision.grupo_nombre}.`,

        revision.id
      );
    } else {
      agregarPaso(
        pasos,
        'VERIFICAR_SESION',

        `Consultar el estado de la sesión remota ${revision.servidor_id} antes de continuar.`,

        revision.id
      );
    }

    // ======================================
    // 5. REVISAR COLMENAS
    // ======================================

    const colmenasOrdenadas = [
      ...detalle.colmenas,
    ].sort(
      (a, b) => a.orden - b.orden
    );

    for (
      const colmena of colmenasOrdenadas
    ) {

      // ====================================
      // COLMENA PENDIENTE
      // ====================================

      if (
        colmena.estado === 'PENDIENTE'
      ) {
        // No enviar nada.
        // Una colmena pendiente no equivale
        // a una inspección ni a una omisión.
        continue;
      }

      // ====================================
      // COLMENA OMITIDA
      // ====================================

      if (
        colmena.estado === 'OMITIDA'
      ) {
        // Por seguridad, exigir un motivo
        // antes de construir el envío.
        if (
          !colmena.motivo_omision?.trim()
        ) {
          problemas.push(
            `Colmena ${colmena.codigo}: falta el motivo de omisión.`
          );

          continue;
        }

        agregarPaso(
          pasos,
          'OMITIR_COLMENA',

          `Registrar omisión de ${colmena.codigo}: ${colmena.motivo_omision}`,

          revision.id,
          colmena.colmena_id
        );

        continue;
      }

      // ====================================
      // COLMENA REVISADA
      // ====================================

      if (
        colmena.estado === 'REVISADA'
      ) {

        const inspeccionId =
          colmena.inspeccion_local_id;

        if (!idValido(inspeccionId)) {
          problemas.push(
            `Colmena ${colmena.codigo}: no tiene una inspección vinculada.`
          );

          continue;
        }

        const inspeccion =
          inspeccionesPorId.get(
            inspeccionId!
          );

        if (!inspeccion) {
          problemas.push(
            `Colmena ${colmena.codigo}: no se encontró la inspección local ${inspeccionId}.`
          );

          continue;
        }

        // ==================================
        // VALIDAR PROPIETARIO
        // ==================================

        if (
          inspeccion.usuario_local_id !==
            usuarioId
        ) {
          problemas.push(
            `Inspección ${inspeccionId}: pertenece a otro usuario.`
          );

          continue;
        }

        // ==================================
        // VALIDAR COLMENA
        // ==================================

        if (
          inspeccion.codigo_qr
            .trim()
            .toLowerCase() !==
          colmena.codigo_qr
            .trim()
            .toLowerCase()
        ) {
          problemas.push(
            `Inspección ${inspeccionId}: el QR no corresponde a ${colmena.codigo}.`
          );

          continue;
        }

        // ==================================
        // VALIDAR VÍNCULO LOCAL
        // ==================================

        const inspeccionVinculada =
          inspeccion as typeof inspeccion & {
            sesion_revision_local_id?:
              number | null;
          };

        if (
          inspeccionVinculada
            .sesion_revision_local_id !==
          revision.id
        ) {
          problemas.push(
            `Inspección ${inspeccionId}: no está vinculada correctamente a esta revisión.`
          );

          continue;
        }

        // ==================================
        // VALIDAR ESTADO
        // ==================================

        if (
          inspeccion.estado !==
          'PENDIENTE'
        ) {
          problemas.push(
            `Inspección ${inspeccionId}: está en estado ${inspeccion.estado}. Requiere verificar su registro remoto antes de reenviarla.`
          );

          continue;
        }

        if (
          inspeccion.servidor_id !== null
        ) {
          problemas.push(
            `Inspección ${inspeccionId}: ya tiene un identificador remoto. Debe verificarse antes de intentar otro envío.`
          );

          continue;
        }

        if (
          !inspeccion.id_cliente
        ) {
          problemas.push(
            `Inspección ${inspeccionId}: no tiene UUID de cliente.`
          );

          continue;
        }

        // ==================================
        // AGREGAR OPERACIÓN
        // ==================================

        agregarPaso(
          pasos,
          'ENVIAR_INSPECCION',

          `Enviar inspección ${inspeccionId} de ${colmena.codigo}, asociada a esta sesión.`,

          revision.id,
          colmena.colmena_id,
          inspeccionId
        );

        continue;
      }

      // ====================================
      // ESTADO DESCONOCIDO
      // ====================================

      problemas.push(
        `Colmena ${colmena.codigo}: estado local no reconocido.`
      );
    }

    // ======================================
    // 6. FINALIZAR
    // ======================================

    if (
      revision.estado === 'FINALIZADA'
    ) {
      agregarPaso(
        pasos,
        'FINALIZAR_SESION',

        `Finalizar la sesión remota del grupo ${revision.grupo_nombre}, después de registrar sus inspecciones y omisiones.`,

        revision.id
      );
    }

    // ======================================
    // 7. CLASIFICAR PLAN
    // ======================================

    const estadoPlan:
      EstadoPlanRevision =
      problemas.length > 0
        ? 'BLOQUEADO'
        : pasos.length === 0
          ? 'SIN_OPERACIONES'
          : 'PREPARADO';

    planes.push({
      revisionLocalId: revision.id,

      revisionClienteId:
        revision.id_cliente,

      grupoId:
        revision.grupo_id,

      grupoNombre:
        revision.grupo_nombre,

      estadoLocal:
        revision.estado,

      estadoPlan,

      totalColmenas:
        detalle.progreso.total,

      revisadas:
        detalle.progreso.revisadas,

      omitidas:
        detalle.progreso.omitidas,

      pendientes:
        detalle.progreso.pendientes,

      pasos,
      problemas,
    });
  }

  // ========================================
  // 8. CALCULAR RESUMEN
  // ========================================

  const totalOperaciones =
    planes.reduce(
      (total, plan) =>
        total + plan.pasos.length,
      0
    );

  const totalBloqueadas =
    planes.filter(
      plan =>
        plan.estadoPlan === 'BLOQUEADO'
    ).length;

  // ========================================
  // RESULTADO
  // ========================================

  return {
    estado: 'PLAN_GENERADO',

    mensaje:
      'Se preparó el plan local. No se realizaron envíos a FastAPI.',

    totalRevisiones:
      planes.length,

    totalOperaciones,
    totalBloqueadas,

    planes,
  };
}
