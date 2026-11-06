
import * as Crypto from 'expo-crypto';

import {
  API_BASE_URL,
  API_TIMEOUT_MS,
} from './config';

// ============================================
// COLMENARES TRES PINOS
// CLIENTE DE COMUNICACIÓN CON FASTAPI
// ============================================

export class ErrorAPI extends Error {
  constructor(
    public readonly estado: number,
    mensaje: string
  ) {
    super(mensaje);
    this.name = 'ErrorAPI';
  }
}

type OpcionesPeticion = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  token?: string;
};

// ============================================
// OBTENER MENSAJES DE ERROR DEL BACKEND
// ============================================

function obtenerDetalle(datos: unknown): string | null {
  if (
    !datos ||
    typeof datos !== 'object' ||
    !('detail' in datos)
  ) {
    return null;
  }

  const detalle = (datos as { detail: unknown }).detail;

  if (typeof detalle === 'string') {
    return detalle;
  }

  return null;
}

// ============================================
// REALIZAR PETICIONES A FASTAPI
// ============================================

export async function solicitarAPI<T>(
  ruta: string,
  opciones: OpcionesPeticion = {}
): Promise<T> {
  const controller = new AbortController();

  const temporizador = setTimeout(() => {
    controller.abort();
  }, API_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-ID': Crypto.randomUUID(),
  };

  // Enviar datos JSON cuando corresponda.
  if (opciones.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // Incluir autenticación cuando exista un token.
  if (opciones.token) {
    headers.Authorization = `Bearer ${opciones.token}`;
  }

  try {
    const respuesta = await fetch(
      `${API_BASE_URL}${ruta}`,
      {
        method: opciones.method ?? 'GET',
        headers,
        body:
          opciones.body === undefined
            ? undefined
            : JSON.stringify(opciones.body),
        signal: controller.signal,
      }
    );

    const datos: unknown = await respuesta
      .json()
      .catch(() => null);

    // ========================================
    // MANEJO DE ERRORES HTTP
    // ========================================

    if (!respuesta.ok) {
      const detalle = obtenerDetalle(datos);

      let mensaje =
        detalle ??
        `Error del servidor (${respuesta.status}).`;

      if (respuesta.status === 401) {
        mensaje =
          'Credenciales incorrectas o sesión vencida.';
      } else if (respuesta.status === 403) {
        mensaje =
          detalle ??
          'No tienes permisos para realizar esta acción.';
      } else if (respuesta.status === 422) {
        mensaje =
          'El servidor rechazó los datos ingresados.';
      } else if (respuesta.status >= 500) {
        mensaje =
          'El servidor presentó un problema. Intenta nuevamente.';
      }

      throw new ErrorAPI(
        respuesta.status,
        mensaje
      );
    }

    if (datos === null) {
      throw new ErrorAPI(
        0,
        'El servidor no devolvió una respuesta JSON válida.'
      );
    }

    return datos as T;

  } catch (error) {
    if (error instanceof ErrorAPI) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new ErrorAPI(
        0,
        'La conexión con FastAPI tardó demasiado.'
      );
    }

    throw new ErrorAPI(
      0,
      'No fue posible conectar con FastAPI. Comprueba la IP, el puerto y la conexión.'
    );

  } finally {
    clearTimeout(temporizador);
  }
}
