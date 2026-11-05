
import {
  guardarInspeccionAvanzada,
} from './inspeccionesAvanzadas';

import type {
  InspeccionAvanzada,
} from './inspeccionesAvanzadas';

import {
  obtenerRevisionLocal,
  vincularInspeccionARevision,
} from './revisiones';

import type {
  ColmenaRevisionGuardada,
  ProgresoRevision,
} from './revisiones';

// ==========================================
// COLMENARES TRES PINOS
// GUARDAR INSPECCIÓN Y SIGUIENTE COLMENA
// ==========================================

export type ResultadoGuardarYSiguiente = {
  inspeccionLocalId: number;
  revisionLocalId: number;
  colmenaId: number;
  siguienteColmena:
    ColmenaRevisionGuardada | null;
  progreso: ProgresoRevision;
};

// ==========================================
// ERROR DE VINCULACIÓN
// ==========================================

export class ErrorVinculacionRevision
  extends Error {

  constructor(
    public readonly inspeccionLocalId: number,
    mensaje: string
  ) {
    super(mensaje);

    this.name = 'ErrorVinculacionRevision';
  }
}

// ==========================================
// GUARDAR Y SIGUIENTE
// ==========================================

export async function guardarYSiguiente(
  revisionLocalId: number,
  colmenaId: number,
  datos: InspeccionAvanzada
): Promise<ResultadoGuardarYSiguiente> {

  // 1. Comprobar la revisión.
  const revision = await obtenerRevisionLocal(
    revisionLocalId
  );

  if (revision.revision.estado !== 'EN_CURSO') {
    throw new Error(
      'La revisión ya está finalizada.'
    );
  }

  // 2. Comprobar que la colmena
  // pertenezca al recorrido.
  const colmena = revision.colmenas.find(
    item => item.colmena_id === colmenaId
  );

  if (!colmena) {
    throw new Error(
      'La colmena no pertenece a esta revisión.'
    );
  }

  if (colmena.estado === 'REVISADA') {
    throw new Error(
      'Esta colmena ya tiene una inspección registrada en la revisión.'
    );
  }

  // 3. Verificar que el formulario
  // corresponda a la colmena correcta.
  if (
    datos.codigoQR.trim().toLowerCase() !==
    colmena.codigo_qr.trim().toLowerCase()
  ) {
    throw new Error(
      'El código QR no corresponde a la colmena seleccionada.'
    );
  }

  // 4. Guardar la inspección avanzada.
  //
  // Se utiliza la función existente,
  // que valida y guarda los datos
  // en SQLite.
  const inspeccionLocalId =
    await guardarInspeccionAvanzada(datos);

  // 5. Vincular la inspección al grupo.
  //
  // Si el vínculo falla, NO se elimina
  // la inspección ya guardada.
  try {
    await vincularInspeccionARevision(
      revisionLocalId,
      colmenaId,
      inspeccionLocalId
    );
  } catch (error) {
    const detalle =
      error instanceof Error
        ? error.message
        : 'Error desconocido';

    throw new ErrorVinculacionRevision(
      inspeccionLocalId,
      `La inspección N.º ${inspeccionLocalId} se guardó, pero no pudo vincularse a la revisión. ${detalle}`
    );
  }

  // 6. Consultar progreso actualizado.
  const actualizada = await obtenerRevisionLocal(
    revisionLocalId
  );

  // 7. Devolver la siguiente colmena.
  return {
    inspeccionLocalId,
    revisionLocalId,
    colmenaId,
    siguienteColmena: actualizada.siguiente,
    progreso: actualizada.progreso,
  };
}

// ==========================================
// RECUPERAR VINCULACIÓN
// ==========================================
//
// Permite reintentar vincular una
// inspección YA guardada sin crear otra.
// ==========================================

export async function recuperarVinculacion(
  revisionLocalId: number,
  colmenaId: number,
  inspeccionLocalId: number
): Promise<ResultadoGuardarYSiguiente> {

  await vincularInspeccionARevision(
    revisionLocalId,
    colmenaId,
    inspeccionLocalId
  );

  const actualizada = await obtenerRevisionLocal(
    revisionLocalId
  );

  return {
    inspeccionLocalId,
    revisionLocalId,
    colmenaId,
    siguienteColmena: actualizada.siguiente,
    progreso: actualizada.progreso,
  };
}
