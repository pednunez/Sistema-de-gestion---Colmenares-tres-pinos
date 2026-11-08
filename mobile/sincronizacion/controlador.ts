
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
  sincronizarInspeccionesPendientes,
} from './inspecciones';

// ==========================================
// COLMENARES TRES PINOS
// CONTROLADOR DE SINCRONIZACIÓN
// ==========================================

// Envío habilitado exclusivamente por configuración.
const HABILITAR_ENVIOS_REALES =
  process.env.EXPO_PUBLIC_ENABLE_SYNC === 'true';

// ==========================================
// ESTADOS DEL CONTROLADOR
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
// RESULTADO DEL CONTROLADOR
// ==========================================

export type ResultadoControlador = {
  estado: EstadoControlador;
  mensaje: string;
  pendientes?: number;
  sincronizadas?: number;
  fallidas?: number;
};

// ==========================================
// CONTROL DE EJECUCIÓN
// ==========================================

// Impide ejecutar varias sincronizaciones
// al mismo tiempo.

let ejecutando = false;

// ==========================================
// COMPROBAR INTERNET
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
// EVALUAR Y SINCRONIZAR
// ==========================================

export async function ejecutarControlador():
  Promise<ResultadoControlador> {

  // Evitar ejecuciones simultáneas.

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
    // 1. COMPROBAR CONECTIVIDAD
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
    // 3. VERIFICAR TOKEN
    // ======================================

    if (!tokenVigente(sesion)) {
      return {
        estado: 'SESION_VENCIDA',
        mensaje:
          'El token venció. Las inspecciones pendientes se conservan.',
      };
    }

    // ======================================
    // 4. VERIFICAR CATÁLOGO
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
    // 6. CONSULTAR REGISTROS SQLITE
    // ======================================

    const inspecciones =
      await listarInspeccionesLocales();

    // ======================================
    // 6.1 DIAGNÓSTICO GENERAL
    // ======================================

    console.info(
      '[Colmenares] DIAGNOSTICO SQLITE:',
      {
        usuarioSesion: sesion.usuario.id,

        total: inspecciones.length,

        pendientes: inspecciones.filter(
          i => i.estado === 'PENDIENTE'
        ).length,

        pendientesDelUsuario: inspecciones.filter(
          i =>
            i.estado === 'PENDIENTE' &&
            i.usuario_local_id === sesion.usuario.id &&
            i.servidor_id === null
        ).length,

        sinPropietario: inspecciones.filter(
          i =>
            i.estado === 'PENDIENTE' &&
            i.usuario_local_id == null
        ).length,

        deOtroUsuario: inspecciones.filter(
          i =>
            i.estado === 'PENDIENTE' &&
            i.usuario_local_id != null &&
            i.usuario_local_id !== sesion.usuario.id
        ).length,

        conIdServidor: inspecciones.filter(
          i => i.servidor_id != null
        ).length,
      }
    );

    // ======================================
    // 6.2 DETALLE INDIVIDUAL DE REGISTROS
    // ======================================

    console.info(
      '[Colmenares] DETALLE DE INSPECCIONES LOCALES:',
      JSON.stringify(
        inspecciones.map(item => ({
          id: item.id,
          id_cliente: item.id_cliente,
          codigo_qr: item.codigo_qr,
          fecha: item.fecha_local,
          estado: item.estado,
          servidor_id: item.servidor_id,
          usuario_local_id: item.usuario_local_id,
        })),
        null,
        2
      )
    );

    // ======================================
    // 6.3 FILTRAR PENDIENTES DEL USUARIO
    // ======================================

    // Solo se consideran inspecciones:
    // - Pendientes.
    // - Sin identificador de servidor.
    // - Pertenecientes al usuario actual.

    const pendientes = inspecciones.filter(
      inspeccion =>
        inspeccion.estado === 'PENDIENTE' &&
        inspeccion.servidor_id === null &&
        inspeccion.usuario_local_id ===
          sesion.usuario.id
    );

    // ======================================
    // 6.4 COMPROBAR SI EXISTEN PENDIENTES
    // ======================================

    if (pendientes.length === 0) {
      return {
        estado: 'SIN_PENDIENTES',
        mensaje:
          'No hay inspecciones pendientes de este usuario.',
        pendientes: 0,
        sincronizadas: 0,
        fallidas: 0,
      };
    }

    // ======================================
    // 7. MODO DIAGNÓSTICO
    // ======================================

    // No enviar registros mientras esté desactivado.

    if (!HABILITAR_ENVIOS_REALES) {
      return {
        estado: 'MODO_DIAGNOSTICO',
        mensaje:
          'Hay inspecciones listas para revisar. Los envíos reales están desactivados.',
        pendientes: pendientes.length,
        sincronizadas: 0,
        fallidas: 0,
      };
    }

    // ======================================
    // 8. SINCRONIZACIÓN REAL
    // ======================================

    const resultado =
      await sincronizarInspeccionesPendientes();

    // ======================================
    // 9. DETERMINAR RESULTADO REAL
    // ======================================

    let estado: EstadoControlador;

    if (resultado.fallidas === 0) {

      estado = 'SINCRONIZADO';

    } else if (resultado.sincronizadas > 0) {

      estado = 'SINCRONIZACION_PARCIAL';

    } else {

      estado = 'ERROR';
    }

    // ======================================
    // 10. INFORMAR ERRORES
    // ======================================

    if (resultado.errores.length > 0) {

      console.warn(
        '[Colmenares] ERRORES DE SINCRONIZACIÓN:',
        resultado.errores
      );

    }

    // ======================================
    // 11. DEVOLVER RESULTADO
    // ======================================

    let mensaje: string;

    if (resultado.fallidas === 0) {

      mensaje =
        `Sincronización completada: ${resultado.sincronizadas} inspecciones enviadas.`;

    } else if (resultado.sincronizadas > 0) {

      mensaje =
        `Sincronización parcial: ${resultado.sincronizadas} enviadas y ${resultado.fallidas} fallidas.`;

    } else {

      mensaje =
        `No se pudo sincronizar ninguna inspección. Fallidas: ${resultado.fallidas}.`;
    }

    return {
      estado,
      mensaje,
      pendientes: pendientes.length,
      sincronizadas: resultado.sincronizadas,
      fallidas: resultado.fallidas,
    };

  } catch (error) {

    // ======================================
    // 12. CONTROL DE ERRORES
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

    // Liberar el bloqueo de ejecución.

    ejecutando = false;
  }
}

// ==========================================
// ESCUCHAR CAMBIOS AUTOMÁTICOS
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
    // DETECTAR CUANDO REGRESA INTERNET
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
    // VOLVER A COMPROBAR AL ABRIR LA APP
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
    // LIMPIAR SUSCRIPCIONES
    // ======================================

    return () => {

      activo = false;

      cancelarRed();

      suscripcionApp.remove();
    };

  }, []);
}
