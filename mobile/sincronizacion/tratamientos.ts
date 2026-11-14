import * as SQLite from 'expo-sqlite';

import {
  ErrorAPI,
  solicitarAPI,
} from '../api/cliente';

import {
  leerSesionGuardada,
  tokenVigente,
} from '../api/auth';

import {
  leerCatalogoLocal,
} from '../database/catalogo';

import {
  listarInspeccionesLocales,
} from '../database/inspecciones';

import {
  listarTratamientosLocales,
} from '../database/tratamientos';

import type {
  EstadoTratamiento,
  TratamientoGuardado,
} from '../database/tratamientos';

// ==========================================
// COLMENARES TRES PINOS
// SINCRONIZACIÓN DE TRATAMIENTOS
// ==========================================

type Catalogo = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

type TratamientoParaAPI = {
  colmena_id: number;
  inspeccion_id: number | null;
  usuario_id: number;
  tipo_tratamiento: string;
  producto: string | null;
  dosis: string | null;
  motivo: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: EstadoTratamiento;
  observaciones: string | null;
  id_cliente: string;
};

type RespuestaTratamiento = {
  id: number;
  id_cliente: string | null;
  colmena_id: number;
  inspeccion_id: number | null;
  usuario_id: number;
};

export type ResultadoSincronizacionTratamientos = {
  revisadas: number;
  sincronizadas: number;
  fallidas: number;
  pendientesPorInspeccion: number;
  errores: {
    idLocal: number;
    mensaje: string;
  }[];
};

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sincronizacionActiva = false;

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function normalizarCodigo(valor: string): string {
  return valor.trim().toLowerCase();
}

function textoONull(valor: string): string | null {
  const limpio = valor.trim();

  return limpio.length > 0 ? limpio : null;
}

// ==========================================
// PREPARAR TRATAMIENTO PARA FASTAPI
// ==========================================

async function prepararTratamiento(
  db: SQLite.SQLiteDatabase,
  registro: TratamientoGuardado,
  usuarioId: number,
  catalogo: Catalogo
): Promise<{
  datos: TratamientoParaAPI | null;
  esperaInspeccion: boolean;
}> {

  // ----------------------------------------
  // VALIDAR PROPIETARIO
  // ----------------------------------------

  if (registro.usuario_local_id !== usuarioId) {
    throw new Error(
      'El tratamiento no pertenece al usuario actual.'
    );
  }

  // ----------------------------------------
  // VALIDAR IDENTIFICADOR
  // ----------------------------------------

  if (!UUID_VALIDO.test(registro.id_cliente)) {
    throw new Error(
      'El tratamiento no tiene un UUID válido.'
    );
  }

  // ----------------------------------------
  // VALIDAR FECHAS
  // ----------------------------------------

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(registro.fecha_inicio) ||
    (
      registro.fecha_fin !== null &&
      !/^\d{4}-\d{2}-\d{2}$/.test(registro.fecha_fin)
    )
  ) {
    throw new Error(
      'Fechas del tratamiento inválidas.'
    );
  }

  // ----------------------------------------
  // RESOLVER COLMENA DEL CATÁLOGO
  // ----------------------------------------

  const colmena = catalogo.colmenas.find(
    item =>
      normalizarCodigo(item.codigo_qr) ===
      normalizarCodigo(registro.codigo_qr)
  );

  if (!colmena) {
    throw new Error(
      'La colmena no está en el catálogo oficial.'
    );
  }

  let inspeccionServidorId: number | null = null;

  // ----------------------------------------
  // RESOLVER INSPECCIÓN ASOCIADA
  // ----------------------------------------

  if (registro.inspeccion_local_id !== null) {

    const inspeccion = await db.getFirstAsync<{
      id: number;
      codigo_qr: string;
      estado: string;
      servidor_id: number | null;
      usuario_local_id: number | null;
    }>(
      `SELECT
        id,
        codigo_qr,
        estado,
        servidor_id,
        usuario_local_id
       FROM inspecciones_locales
       WHERE id = ?`,
      [registro.inspeccion_local_id]
    );

    if (!inspeccion) {
      throw new Error(
        'La inspección asociada no existe.'
      );
    }

    if (inspeccion.usuario_local_id !== usuarioId) {
      throw new Error(
        'La inspección pertenece a otro usuario.'
      );
    }

    if (
      normalizarCodigo(inspeccion.codigo_qr) !==
      normalizarCodigo(registro.codigo_qr)
    ) {
      throw new Error(
        'La inspección corresponde a otra colmena.'
      );
    }

    // La inspección debe llegar primero a FastAPI.

    if (inspeccion.estado !== 'SINCRONIZADO') {
      return {
        datos: null,
        esperaInspeccion: true,
      };
    }

    if (
      inspeccion.servidor_id === null ||
      !Number.isSafeInteger(inspeccion.servidor_id) ||
      inspeccion.servidor_id <= 0
    ) {
      throw new Error(
        'La inspección no tiene un ID válido en el servidor.'
      );
    }

    inspeccionServidorId = inspeccion.servidor_id;
  }

  // ----------------------------------------
  // CONSTRUIR CUERPO PARA FASTAPI
  // ----------------------------------------

  return {
    esperaInspeccion: false,

    datos: {
      colmena_id: colmena.id,
      inspeccion_id: inspeccionServidorId,
      usuario_id: usuarioId,
      tipo_tratamiento: registro.tipo_tratamiento.trim(),
      producto: textoONull(registro.producto),
      dosis: textoONull(registro.dosis),
      motivo: textoONull(registro.motivo),
      fecha_inicio: registro.fecha_inicio,
      fecha_fin: registro.fecha_fin,
      estado: registro.estado,
      observaciones: textoONull(registro.observaciones),
      id_cliente: registro.id_cliente,
    },
  };
}

// ==========================================
// SINCRONIZAR TRATAMIENTOS PENDIENTES
// POST /tratamientos/
// ==========================================

export async function sincronizarTratamientosPendientes():
  Promise<ResultadoSincronizacionTratamientos> {

  if (sincronizacionActiva) {
    throw new Error(
      'Ya existe una sincronización de tratamientos en curso.'
    );
  }

  sincronizacionActiva = true;

  const resultado: ResultadoSincronizacionTratamientos = {
    revisadas: 0,
    sincronizadas: 0,
    fallidas: 0,
    pendientesPorInspeccion: 0,
    errores: [],
  };

  try {

    // ----------------------------------------
    // 1. OBTENER SESIÓN
    // ----------------------------------------

    const sesion = await leerSesionGuardada();

    if (!sesion || !tokenVigente(sesion)) {
      throw new Error(
        'No existe una sesión válida para sincronizar.'
      );
    }

    // ----------------------------------------
    // 2. OBTENER CATÁLOGO
    // ----------------------------------------

    const catalogo = await leerCatalogoLocal(
      sesion.usuario.id
    );

    if (!catalogo) {
      throw new Error(
        'No existe un catálogo oficial descargado.'
      );
    }

    // ----------------------------------------
    // 3. INICIALIZAR SQLITE
    // ----------------------------------------

    await listarInspeccionesLocales();

    const registros = await listarTratamientosLocales();

    // ----------------------------------------
    // 4. FILTRAR PENDIENTES DEL USUARIO
    // ----------------------------------------

    const pendientes = registros.filter(
      registro =>
        registro.sincronizacion === 'PENDIENTE' &&
        registro.servidor_id === null &&
        registro.usuario_local_id === sesion.usuario.id
    );

    if (pendientes.length === 0) {
      return resultado;
    }

    // ----------------------------------------
    // 5. ABRIR BASE DE DATOS
    // ----------------------------------------

    const db = await SQLite.openDatabaseAsync(
      'colmenas.db'
    );

    resultado.revisadas = pendientes.length;

    // ----------------------------------------
    // 6. PROCESAR CADA TRATAMIENTO
    // ----------------------------------------

    for (const registro of pendientes) {

      // Verificar vigencia del token.

      if (!tokenVigente(sesion)) {

        resultado.fallidas++;

        resultado.errores.push({
          idLocal: registro.id,
          mensaje: 'La sesión venció durante el envío.',
        });

        break;
      }

      try {

        // --------------------------------------
        // 6.1 PREPARAR DATOS
        // --------------------------------------

        const preparado = await prepararTratamiento(
          db,
          registro,
          sesion.usuario.id,
          catalogo
        );

        // Si la inspección no llegó al servidor,
        // mantener el tratamiento pendiente.

        if (
          preparado.esperaInspeccion ||
          !preparado.datos
        ) {

          resultado.pendientesPorInspeccion++;

          continue;
        }

        // --------------------------------------
        // 6.2 ENVIAR A FASTAPI
        // --------------------------------------

        const respuesta =
          await solicitarAPI<RespuestaTratamiento>(
            '/tratamientos/',
            {
              method: 'POST',
              token: sesion.accessToken,
              body: preparado.datos,
            }
          );

        // --------------------------------------
        // 6.3 VALIDAR RESPUESTA
        // --------------------------------------

        if (
          !Number.isSafeInteger(respuesta.id) ||
          respuesta.id <= 0 ||
          !respuesta.id_cliente ||
          normalizarCodigo(respuesta.id_cliente) !==
            normalizarCodigo(registro.id_cliente) ||
          respuesta.colmena_id !==
            preparado.datos.colmena_id ||
          respuesta.inspeccion_id !==
            preparado.datos.inspeccion_id ||
          respuesta.usuario_id !== sesion.usuario.id
        ) {
          throw new Error(
            'La respuesta de FastAPI no coincide con el tratamiento enviado.'
          );
        }

        // --------------------------------------
        // 6.4 ACTUALIZAR SQLITE
        // --------------------------------------

        // Solo marcar como sincronizado después
        // de confirmar la respuesta del servidor.

        const cambio = await db.runAsync(
          `UPDATE tratamientos_locales
           SET sincronizacion = 'SINCRONIZADO',
               servidor_id = ?,
               actualizado_local = ?
           WHERE id = ?
             AND id_cliente = ?
             AND usuario_local_id = ?
             AND sincronizacion = 'PENDIENTE'
             AND servidor_id IS NULL`,
          [
            respuesta.id,
            new Date().toISOString(),
            registro.id,
            registro.id_cliente,
            sesion.usuario.id,
          ]
        );

        if (cambio.changes !== 1) {
          throw new Error(
            'FastAPI confirmó el registro, pero SQLite no pudo actualizar su estado.'
          );
        }

        resultado.sincronizadas++;

      } catch (error) {

        // --------------------------------------
        // 6.5 REGISTRAR ERROR
        // --------------------------------------

        resultado.fallidas++;

        resultado.errores.push({
          idLocal: registro.id,
          mensaje:
            error instanceof Error
              ? error.message
              : 'Error desconocido al sincronizar.',
        });

        // Ante problemas de autorización o conflicto,
        // detener el procesamiento de los siguientes.

        if (
          error instanceof ErrorAPI &&
          (
            error.estado === 401 ||
            error.estado === 403 ||
            error.estado === 409
          )
        ) {
          break;
        }
      }
    }

    // ----------------------------------------
    // 7. INFORMAR RESULTADO
    // ----------------------------------------

    console.info(
      '[Colmenares] Sincronización de tratamientos:',
      resultado
    );

    return resultado;

  } finally {

    sincronizacionActiva = false;

  }
}