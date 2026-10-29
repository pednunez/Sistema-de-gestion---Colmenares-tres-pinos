
import { useEffect, useState } from 'react';

import NetInfo from '@react-native-community/netinfo';

import type {
  NetInfoState,
} from '@react-native-community/netinfo';

// ==========================================
// COLMENARES TRES PINOS
// DETECCIÓN DE CONECTIVIDAD
// ==========================================

export type EstadoConexion =
  | 'CON_INTERNET'
  | 'SIN_INTERNET'
  | 'COMPROBANDO';

// ==========================================
// INTERPRETAR CONEXIÓN
// ==========================================

export function interpretarConexion(
  estado: NetInfoState
): EstadoConexion {

  if (
    estado.isConnected === false ||
    estado.isInternetReachable === false
  ) {
    return 'SIN_INTERNET';
  }

  if (
    estado.isConnected === true &&
    estado.isInternetReachable === true
  ) {
    return 'CON_INTERNET';
  }

  return 'COMPROBANDO';
}

// ==========================================
// HOOK PARA LAS PANTALLAS
// ==========================================

export function useConexion():
  EstadoConexion {

  const [conexion, setConexion] =
    useState<EstadoConexion>(
      'COMPROBANDO'
    );

  useEffect(() => {

    // Escuchar cambios de conectividad.
    const cancelar = NetInfo.addEventListener(
      estado => {
        setConexion(
          interpretarConexion(estado)
        );
      }
    );

    // Eliminar listener al cerrar
    // o desmontar la pantalla.
    return () => {
      cancelar();
    };

  }, []);

  return conexion;
}
