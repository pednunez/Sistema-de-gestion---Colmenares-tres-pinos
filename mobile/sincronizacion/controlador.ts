import { useEffect } from 'react';

import {
  AppState,
} from 'react-native';

import NetInfo from '@react-native-community/netinfo';

import type {
  NetInfoState,
} from '@react-native-community/netinfo';

import {
  leerSesionGuardada,
  tokenVigente,
} from '../api/auth';

import {
  solicitarAPI,
} from '../api/cliente';

import {
  leerCatalogoLocal,
} from '../database/catalogo';

import {
  listarInspeccionesLocales,
} from '../database/inspecciones';

import {
  listarTratamientosLocales,
} from '../database/tratamientos';

import {
  sincronizarInspeccionesPendientes,
} from './inspecciones';

import {
  sincronizarTratamientosPendientes,
} from './tratamientos';

// ==========================================
// CONFIGURACIÓN
// ==========================================

const HABILITAR_ENVIOS_REALES =
  process.env.EXPO_PUBLIC_ENABLE_SYNC === 'true';

// ==========================================
// ESTADOS
// ==========================================

export type EstadoControlador =
  | 'SIN_INTERNET'
  | 'SIN_SESION'
  | 'SESION_VENCIDA'
  | 'SIN_CATALOGO'
  | 'SERVIDOR_NO_DISPONIBLE'
  | 'SIN_PENDIENTES'
  | 'MODO_DIAGNOSTICO'
  | 'SINCRONIZADO'
  | 'SINCRONIZACION_PARCIAL'
  | 'EN_PROCESO'
  | 'ERROR';

// ==========================================
// RESULTADO
// ==========================================

export type ResultadoControlador = {
  estado: EstadoControlador;
  mensaje: string;
  pendientes?: number;
  sincronizadas?: number;
  fallidas?: number;
  pendientesPorInspeccion?: number;
};

// ==========================================
// BLOQUEO GLOBAL
// ==========================================

let ejecutando = false;

// ==========================================
// CONECTIVIDAD
// ==========================================

function hayInternet(
  estado: NetInfoState
): boolean {

  return (
    estado.isConnected === true &&
    estado.isInternetReachable !== false
  );

}

// ==========================================
// EJECUTAR SINCRONIZACIÓN
// ==========================================

export async function ejecutarControlador():
  Promise<ResultadoControlador> {

  if (ejecutando) {

    return {
      estado: 'EN_PROCESO',
      mensaje:
        'Ya se está comprobando la sincronización.',
    };

  }

  ejecutando = true;

  try {

    // ======================================
    // 1. COMPROBAR INTERNET
    // ======================================

    const red = await NetInfo.fetch();

    if (!hayInternet(red)) {

      return {
        estado: 'SIN_INTERNET',
        mensaje:
          'Sin conexión. Los datos permanecen en SQLite.',
      };

    }

    // ======================================
    // 2. OBTENER SESIÓN
    // ======================================

    const sesion = await leerSesionGuardada();

    if (!sesion) {

      return {
        estado: 'SIN_SESION',
        mensaje:
          'No hay una sesión iniciada. No se enviarán registros.',
      };

    }

    // ======================================
    // 3. VALIDAR TOKEN
    // ======================================

    if (!tokenVigente(sesion)) {

      return {
        estado: 'SESION_VENCIDA',
        mensaje:
          'El token venció. Los registros pendientes se conservan.',
      };

    }

    // ======================================
    // 4. VALIDAR CATÁLOGO
    // ======================================

    const catalogo = await leerCatalogoLocal(
      sesion.usuario.id
    );

    if (!catalogo) {

      return {
        estado: 'SIN_CATALOGO',
        mensaje:
          'No existe un catálogo oficial descargado para este usuario.',
      };

    }

    // ======================================
    // 5. COMPROBAR FASTAPI
    // ======================================

    try {

      const respuesta = await solicitarAPI<{
        status: string;
      }>(
        '/health',
        {
          method: 'GET',
        }
      );

      if (respuesta.status !== 'ok') {

        return {
          estado: 'SERVIDOR_NO_DISPONIBLE',
          mensaje:
            'El servidor no respondió correctamente.',
        };

      }

    } catch {

      return {
        estado: 'SERVIDOR_NO_DISPONIBLE',
        mensaje:
          'No se pudo contactar con FastAPI.',
      };

    }

    // ======================================
    // 6. LEER SQLITE
    // ======================================

    // Se inicializan las tablas en orden.

    const inspecciones =
      await listarInspeccionesLocales();

    const tratamientos =
      await listarTratamientosLocales();

    // ======================================
    // 7. PENDIENTES DE INSPECCIONES
    // ======================================

    const pendientesInspecciones =
      inspecciones.filter(
        inspeccion =>
          inspeccion.estado === 'PENDIENTE' &&
          inspeccion.servidor_id === null &&
          inspeccion.usuario_local_id ===
            sesion.usuario.id
      );

    // ======================================
    // 8. PENDIENTES DE TRATAMIENTOS
    // ======================================

    const pendientesTratamientos =
      tratamientos.filter(
        tratamiento =>
          tratamiento.sincronizacion === 'PENDIENTE' &&
          tratamiento.servidor_id === null &&
          tratamiento.usuario_local_id ===
            sesion.usuario.id
      );

    const totalPendientes =
      pendientesInspecciones.length +
      pendientesTratamientos.length;

    // ======================================
    // 9. DIAGNÓSTICO SQLITE
    // ======================================

    console.info(
      '[Colmenares] DIAGNÓSTICO DE SINCRONIZACIÓN:',
      {
        usuarioSesion: sesion.usuario.id,

        inspecciones: {
          total: inspecciones.length,
          pendientes: pendientesInspecciones.length,
        },

        tratamientos: {
          total: tratamientos.length,
          pendientes: pendientesTratamientos.length,
        },

        totalPendientes,
      }
    );

    // ======================================
    // 10. COMPROBAR COLA VACÍA
    // ======================================

    if (totalPendientes === 0) {

      return {
        estado: 'SIN_PENDIENTES',
        mensaje:
          'No hay inspecciones ni tratamientos pendientes de sincronización.',
        pendientes: 0,
        sincronizadas: 0,
        fallidas: 0,
        pendientesPorInspeccion: 0,
      };

    }

    // ======================================
    // 11. MODO DIAGNÓSTICO
    // ======================================

    if (!HABILITAR_ENVIOS_REALES) {

      return {
        estado: 'MODO_DIAGNOSTICO',

        mensaje:
          `Hay ${pendientesInspecciones.length} inspecciones y ${pendientesTratamientos.length} tratamientos pendientes. Los envíos reales están desactivados.`,

        pendientes: totalPendientes,
        sincronizadas: 0,
        fallidas: 0,
        pendientesPorInspeccion: 0,
      };

    }

    // ======================================
    // 12. RESULTADOS INICIALES
    // ======================================

    const resultadoInspecciones = {
      revisadas: 0,
      sincronizadas: 0,
      fallidas: 0,
      errores: [] as {
        idLocal: number;
        mensaje: string;
      }[],
    };

    const resultadoTratamientos = {
      revisadas: 0,
      sincronizadas: 0,
      fallidas: 0,
      pendientesPorInspeccion: 0,
      errores: [] as {
        idLocal: number;
        mensaje: string;
      }[],
    };

    // ======================================
    // 13. SINCRONIZAR INSPECCIONES
    // ======================================

    if (pendientesInspecciones.length > 0) {

      try {

        const resultado =
          await sincronizarInspeccionesPendientes();

        resultadoInspecciones.revisadas =
          resultado.revisadas;

        resultadoInspecciones.sincronizadas =
          resultado.sincronizadas;

        resultadoInspecciones.fallidas =
          resultado.fallidas;

        resultadoInspecciones.errores =
          resultado.errores;

      } catch (error) {

        resultadoInspecciones.fallidas++;

        resultadoInspecciones.errores.push({
          idLocal: 0,

          mensaje:
            error instanceof Error
              ? error.message
              : 'Error general al sincronizar inspecciones.',
        });

      }

    }

    // ======================================
    // 14. SINCRONIZAR TRATAMIENTOS
    // ======================================

    // IMPORTANTE:
    // Las inspecciones se procesan primero.
    // Así los tratamientos pueden utilizar
    // el ID real de la inspección en FastAPI.

    if (pendientesTratamientos.length > 0) {

      try {

        const resultado =
          await sincronizarTratamientosPendientes();

        resultadoTratamientos.revisadas =
          resultado.revisadas;

        resultadoTratamientos.sincronizadas =
          resultado.sincronizadas;

        resultadoTratamientos.fallidas =
          resultado.fallidas;

        resultadoTratamientos.pendientesPorInspeccion =
          resultado.pendientesPorInspeccion;

        resultadoTratamientos.errores =
          resultado.errores;

      } catch (error) {

        resultadoTratamientos.fallidas++;

        resultadoTratamientos.errores.push({
          idLocal: 0,

          mensaje:
            error instanceof Error
              ? error.message
              : 'Error general al sincronizar tratamientos.',
        });

      }

    }

    // ======================================
    // 15. CONSOLIDAR RESULTADOS
    // ======================================

    const totalSincronizadas =
      resultadoInspecciones.sincronizadas +
      resultadoTratamientos.sincronizadas;

    const totalFallidas =
      resultadoInspecciones.fallidas +
      resultadoTratamientos.fallidas;

    const pendientesPorInspeccion =
      resultadoTratamientos.pendientesPorInspeccion;

    const errores = [
      ...resultadoInspecciones.errores,
      ...resultadoTratamientos.errores,
    ];

    // ======================================
    // 16. MOSTRAR ERRORES
    // ======================================

    if (errores.length > 0) {

      console.warn(
        '[Colmenares] ERRORES DE SINCRONIZACIÓN:',
        errores
      );

    }

    // ======================================
    // 17. DETERMINAR ESTADO
    // ======================================

    let estado: EstadoControlador;

    if (totalFallidas > 0) {

      estado =
        totalSincronizadas > 0
          ? 'SINCRONIZACION_PARCIAL'
          : 'ERROR';

    } else if (pendientesPorInspeccion > 0) {

      estado = 'SINCRONIZACION_PARCIAL';

    } else {

      estado = 'SINCRONIZADO';

    }

    // ======================================
    // 18. CONSTRUIR MENSAJE
    // ======================================

    const enviados: string[] = [];

    if (
      resultadoInspecciones.sincronizadas > 0
    ) {

      enviados.push(
        `${resultadoInspecciones.sincronizadas} inspecciones`
      );

    }

    if (
      resultadoTratamientos.sincronizadas > 0
    ) {

      enviados.push(
        `${resultadoTratamientos.sincronizadas} tratamientos`
      );

    }

    let mensaje = '';

    if (enviados.length > 0) {

      mensaje =
        `Sincronización completada: ${enviados.join(' y ')} enviados.`;

    } else {

      mensaje =
        'No se enviaron registros nuevos.';

    }

    if (pendientesPorInspeccion > 0) {

      mensaje +=
        ` ${pendientesPorInspeccion} tratamientos esperan la sincronización de su inspección asociada.`;

    }

    if (totalFallidas > 0) {

      mensaje +=
        ` Se produjeron ${totalFallidas} errores. Revisa el registro de diagnóstico.`;

    }

    // ======================================
    // 19. DEVOLVER RESULTADO
    // ======================================

    return {

      estado,

      mensaje,

      pendientes: totalPendientes,

      sincronizadas: totalSincronizadas,

      fallidas: totalFallidas,

      pendientesPorInspeccion,

    };

  } catch (error) {

    // ======================================
    // 20. ERROR GENERAL
    // ======================================

    console.error(
      '[Colmenares] ERROR DEL CONTROLADOR:',
      error
    );

    return {

      estado: 'ERROR',

      mensaje:
        error instanceof Error
          ? error.message
          : 'Error desconocido del controlador.',

    };

  } finally {

    ejecutando = false;

  }

}

// ==========================================
// SINCRONIZACIÓN AUTOMÁTICA
// ==========================================

export function useControladorSincronizacion():
  void {

  useEffect(() => {

    let activo = true;

    let teniaInternet = false;

    // ======================================
    // EJECUTAR REVISIÓN
    // ======================================

    const revisar = async (
      motivo: string
    ) => {

      if (!activo) return;

      const resultado =
        await ejecutarControlador();

      if (!activo) return;

      console.info(
        '[Colmenares] Controlador:',
        motivo,
        resultado.estado,
        resultado.mensaje
      );

    };

    // ======================================
    // DETECTAR CONEXIÓN
    // ======================================

    const cancelarRed =
      NetInfo.addEventListener(
        estado => {

          const conectado =
            hayInternet(estado);

          if (!conectado) {

            teniaInternet = false;

            return;

          }

          if (
            conectado &&
            !teniaInternet &&
            AppState.currentState === 'active'
          ) {

            teniaInternet = true;

            void revisar(
              'Conexión disponible'
            );

          }

        }
      );

    // ======================================
    // VOLVER A ABRIR LA APP
    // ======================================

    const suscripcionApp =
      AppState.addEventListener(
        'change',
        estado => {

          if (estado === 'active') {

            void revisar(
              'Aplicación activa'
            );

          }

        }
      );

    // ======================================
    // LIMPIAR EVENTOS
    // ======================================

    return () => {

      activo = false;

      cancelarRed();

      suscripcionApp.remove();

    };

  }, []);

}