/**
 * Colmenares Tres Pinos
 * Configuracion de conexion con FastAPI.
 */

const url = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!url) {
  throw new Error('Falta configurar EXPO_PUBLIC_API_URL');
}

export const API_BASE_URL = url.replace(/\/+$/, '');

export const API_TIMEOUT_MS = 12000;
