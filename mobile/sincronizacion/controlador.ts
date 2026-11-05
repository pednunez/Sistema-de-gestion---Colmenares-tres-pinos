
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
// CONTROLADOR DE SINCRONIZACIÃ“N
// ==========================================

// Envio habilitado exclusivamente por configuracion.
const HABILITAR_ENVIOS_REALES = process.env.EXPO_PUBLIC_ENABLE_SYNC === 'true';

export type EstadoControlador =
  | 'SIN_INTERNET'
  | 'SIN_SESION'
  | 'SESION_VENCIDA'
  | 'SIN_CATALOGO'
  | 'SERVIDOR_NO_DISPONIBLE'
  | 'SIN_PENDIENTES'
  | 'MODO_DIAGNOSTICO'
  | 'SINCRONIZADO'
  | 'EN_PROCESO'
  | 'ERROR';

export type ResultadoControlador = {
  estado: EstadoControlador;
  mensaje: string;
  pendientes?: number;
  sincronizadas?: number;
  fallidas?: number;
};

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

  if (ejecutando) {
    return {
      estado: 'EN_PROCESO',
      mensaje:
        'Ya se estÃ¡ comprobando la sincronizaciÃ³n.',
    };
  }

  ejecutando = true;

  try {
    // 1. Comprobar conectividad.
    const red = await NetInfo.fetch();

    if (!hayInternet(red)) {
      return {
        estado: 'SIN_INTERNET',
        mensaje:
          'Sin conexiÃ³n. Los datos permanecen en SQLite.',
      };
    }

    // 2. Obtener sesiÃ³n.
    const sesion = await leerSesionGuardada();

    if (!sesion) {
      return {
        estado: 'SIN_SESION',
        mensaje:
          'No hay una sesiÃ³n iniciada. No se enviarÃ¡n registros.',
      };
    }

    // 3. Verificar token.
    if (!tokenVigente(sesion)) {
      return {
        estado: 'SESION_VENCIDA',
        mensaje:
          'El token venciÃ³. Las inspecciones pendientes se conservan.',
      };
    }

    // 4. Verificar catÃ¡logo del usuario.
    const catalogo = await leerCatalogoLocal(
      sesion.usuario.id
    );

    if (!catalogo) {
      return {
        estado: 'SIN_CATALOGO',
        mensaje:
          'No existe un catÃ¡logo oficial descargado para este usuario.',
      };
    }

    // 5. Comprobar servidor.
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
            'El servidor no respondiÃ³ correctamente.',
        };
      }
    } catch {
      return {
        estado: 'SERVIDOR_NO_DISPONIBLE',
        mensaje:
          'No se pudo contactar con FastAPI.',
      };
    }

    // 6. Consultar registros del usuario.
    const inspecciones =
      await listarInspeccionesLocales();

    const pendientes = inspecciones.filter(
      inspeccion =>
        inspeccion.estado === 'PENDIENTE' &&
        inspeccion.servidor_id === null &&
        inspeccion.usuario_local_id ===
          sesion.usuario.id
    );

    if (pendientes.length === 0) {
      return {
        estado: 'SIN_PENDIENTES',
        mensaje:
          'No hay inspecciones pendientes de este usuario.',
        pendientes: 0,
      };
    }

    // 7. ProtecciÃ³n para desarrollo.
    // No se envÃ­a nada mientras no
    // habilitemos explÃ­citamente la funciÃ³n.
    if (!HABILITAR_ENVIOS_REALES) {
      return {
        estado: 'MODO_DIAGNOSTICO',
        mensaje:
          'Hay inspecciones listas para revisar. Los envÃ­os reales estÃ¡n desactivados.',
        pendientes: pendientes.length,
      };
    }

    // 8. SincronizaciÃ³n real.
    const resultado =
      await sincronizarInspeccionesPendientes();

    return {
      estado: 'SINCRONIZADO',
      mensaje:
        'TerminÃ³ el intento de sincronizaciÃ³n.',
      pendientes: pendientes.length,
      sincronizadas:
        resultado.sincronizadas,
      fallidas:
        resultado.fallidas,
    };

  } catch (error) {
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
// ESCUCHAR CAMBIOS AUTOMÃTICOS
// ==========================================

export function useControladorSincronizacion():
  void {

  useEffect(() => {
    let activo = true;

    let teniaInternet = false;

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

    // Detectar cuando regresa internet.
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
              'ConexiÃ³n disponible'
            );
          }
        }
      );

    // Volver a comprobar cuando
    // el usuario abre la aplicaciÃ³n.
    const suscripcionApp =
      AppState.addEventListener(
        'change',
        estado => {
          if (estado === 'active') {
            void revisar(
              'AplicaciÃ³n activa'
            );
          }
        }
      );

    return () => {
      activo = false;

      cancelarRed();
      suscripcionApp.remove();
    };
  }, []);
}
