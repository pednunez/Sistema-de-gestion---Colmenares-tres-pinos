import * as SecureStore from 'expo-secure-store';

import {
  ErrorAPI,
  solicitarAPI,
} from './cliente';

// ==========================================
// COLMENARES TRES PINOS
// AUTENTICACION MOVIL CON SESION PERSISTENTE
// ==========================================

const CLAVE_SESION = 'colmenares_tres_pinos_sesion_v1';
const UMBRAL_RENOVACION_MS = 2 * 60 * 1000;

export type UsuarioMovil = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
};

export type SesionMovil = {
  accessToken: string;
  expiraEn: number;
  usuario: UsuarioMovil;
  mantenerSesion?: boolean;
  refreshToken?: string;
  refreshExpiraEn?: number;
};

type RespuestaLogin = {
  access_token: string;
  token_type: string;
  expira_en: number;
  usuario: UsuarioMovil;
  refresh_token?: string | null;
  refresh_expira_en?: number | null;
};

type RespuestaRenovacion = {
  access_token: string;
  token_type: string;
  expira_en: number;
  usuario: UsuarioMovil;
};

const ROLES_PERMITIDOS = ['ADMIN', 'APICULTOR'];

function usuarioValido(valor: unknown): valor is UsuarioMovil {
  if (!valor || typeof valor !== 'object') return false;
  const usuario = valor as Partial<UsuarioMovil>;
  return (
    typeof usuario.id === 'number' &&
    Number.isInteger(usuario.id) &&
    usuario.id > 0 &&
    typeof usuario.nombre === 'string' &&
    usuario.nombre.trim().length > 0 &&
    typeof usuario.email === 'string' &&
    usuario.email.trim().length > 0 &&
    typeof usuario.rol === 'string' &&
    ROLES_PERMITIDOS.includes(usuario.rol)
  );
}

export function tokenVigente(sesion: SesionMovil): boolean {
  return Date.now() < sesion.expiraEn - 30000;
}

export function sesionPuedeMantenerseOffline(
  sesion: SesionMovil
): boolean {
  return (
    sesion.mantenerSesion === true &&
    typeof sesion.refreshToken === 'string' &&
    sesion.refreshToken.length > 0 &&
    typeof sesion.refreshExpiraEn === 'number' &&
    Date.now() < sesion.refreshExpiraEn - 30000
  );
}

async function guardarSesion(sesion: SesionMovil): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(sesion));
}

// Evita que varias pantallas soliciten renovar el mismo token al mismo tiempo.
const renovacionesEnCurso = new Map<string, Promise<SesionMovil>>();

export async function renovarSesion(
  sesion: SesionMovil
): Promise<SesionMovil> {
  if (!sesionPuedeMantenerseOffline(sesion)) {
    throw new ErrorAPI(401, 'La sesión persistente venció. Inicia sesión nuevamente.');
  }

  const refreshToken = sesion.refreshToken!;
  const existente = renovacionesEnCurso.get(refreshToken);
  if (existente) return existente;

  const solicitud = (async (): Promise<SesionMovil> => {
    const respuesta = await solicitarAPI<RespuestaRenovacion>(
      '/auth/refresh',
      {
        method: 'POST',
        body: { refresh_token: refreshToken },
      }
    );

    if (
      !respuesta ||
      typeof respuesta.access_token !== 'string' ||
      respuesta.access_token.length === 0 ||
      respuesta.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isInteger(respuesta.expira_en) ||
      respuesta.expira_en <= 0 ||
      !usuarioValido(respuesta.usuario) ||
      respuesta.usuario.id !== sesion.usuario.id
    ) {
      throw new ErrorAPI(0, 'El servidor devolvió una respuesta de renovación inválida.');
    }

    const renovada: SesionMovil = {
      ...sesion,
      accessToken: respuesta.access_token,
      expiraEn: Date.now() + respuesta.expira_en * 1000,
      usuario: respuesta.usuario,
    };

    await guardarSesion(renovada);
    return renovada;
  })();

  renovacionesEnCurso.set(refreshToken, solicitud);
  try {
    return await solicitud;
  } finally {
    if (renovacionesEnCurso.get(refreshToken) === solicitud) {
      renovacionesEnCurso.delete(refreshToken);
    }
  }
}

// ==========================================
// INICIAR SESION
// POST /auth/token
// ==========================================

export async function iniciarSesion(
  correoIngresado: string,
  password: string,
  mantenerSesion: boolean = true
): Promise<SesionMovil> {
  const email = correoIngresado.trim().toLowerCase();

  if (
    email.length < 5 ||
    email.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error('Ingresa un correo electrónico válido.');
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error('La contraseña debe tener entre 8 y 128 caracteres.');
  }

  let respuesta: RespuestaLogin;
  try {
    respuesta = await solicitarAPI<RespuestaLogin>('/auth/token', {
      method: 'POST',
      body: { email, password, mantener_sesion: mantenerSesion },
    });
  } catch (error) {
    if (error instanceof ErrorAPI && error.estado === 404) {
      throw new Error('El backend todavía no tiene disponible la autenticación persistente. Debe actualizarse FastAPI.');
    }
    throw error;
  }

  if (
    !respuesta ||
    typeof respuesta.access_token !== 'string' ||
    respuesta.access_token.length === 0 ||
    respuesta.token_type?.toLowerCase() !== 'bearer' ||
    !Number.isInteger(respuesta.expira_en) ||
    respuesta.expira_en <= 0 ||
    !usuarioValido(respuesta.usuario)
  ) {
    throw new Error('El servidor devolvió una respuesta de autenticación inválida.');
  }

  if (
    mantenerSesion &&
    (
      typeof respuesta.refresh_token !== 'string' ||
      respuesta.refresh_token.length === 0 ||
      !Number.isInteger(respuesta.refresh_expira_en) ||
      (respuesta.refresh_expira_en ?? 0) <= 0
    )
  ) {
    throw new Error('El backend no entregó el token para mantener la sesión. Actualiza el servidor e inténtalo nuevamente.');
  }

  const sesion: SesionMovil = {
    accessToken: respuesta.access_token,
    expiraEn: Date.now() + respuesta.expira_en * 1000,
    usuario: respuesta.usuario,
    mantenerSesion,
    refreshToken: mantenerSesion ? respuesta.refresh_token! : undefined,
    refreshExpiraEn: mantenerSesion
      ? Date.now() + respuesta.refresh_expira_en! * 1000
      : undefined,
  };

  await guardarSesion(sesion);
  return sesion;
}

// ==========================================
// RECUPERAR SESION GUARDADA Y RENOVARLA
// ==========================================

export async function leerSesionGuardada(): Promise<SesionMovil | null> {
  const texto = await SecureStore.getItemAsync(CLAVE_SESION);
  if (!texto) return null;

  let sesion: SesionMovil;
  try {
    const datos: unknown = JSON.parse(texto);
    if (!datos || typeof datos !== 'object') return null;

    const parcial = datos as Partial<SesionMovil>;
    if (
      typeof parcial.accessToken !== 'string' ||
      !parcial.accessToken ||
      typeof parcial.expiraEn !== 'number' ||
      !Number.isFinite(parcial.expiraEn) ||
      !usuarioValido(parcial.usuario)
    ) {
      return null;
    }

    sesion = parcial as SesionMovil;
  } catch {
    return null;
  }

  if (sesion.mantenerSesion === true) {
    if (!sesionPuedeMantenerseOffline(sesion)) {
      await SecureStore.deleteItemAsync(CLAVE_SESION);
      return null;
    }

    if (sesion.expiraEn <= Date.now() + UMBRAL_RENOVACION_MS) {
      try {
        return await renovarSesion(sesion);
      } catch (error) {
        if (error instanceof ErrorAPI && (error.estado === 401 || error.estado === 403)) {
          await SecureStore.deleteItemAsync(CLAVE_SESION);
          return null;
        }
        // Si no hay red o el servidor está temporalmente indisponible,
        // se conserva la sesión para seguir trabajando con SQLite.
        return sesion;
      }
    }
  }

  return sesion;
}

// ==========================================
// VERIFICAR USUARIO CON FASTAPI
// GET /auth/me
// ==========================================

export async function verificarUsuario(sesion: SesionMovil): Promise<void> {
  if (!tokenVigente(sesion)) {
    throw new ErrorAPI(401, 'El token ha vencido.');
  }

  const usuario = await solicitarAPI<UsuarioMovil>('/auth/me', {
    token: sesion.accessToken,
  });

  if (!usuarioValido(usuario) || usuario.id !== sesion.usuario.id) {
    throw new ErrorAPI(401, 'La identidad de la sesión no coincide.');
  }
}

// ==========================================
// COMPROBAR DISPONIBILIDAD DE FASTAPI
// ==========================================

export async function comprobarServidor(): Promise<boolean> {
  try {
    const resultado = await solicitarAPI<{ status: string }>('/health');
    return resultado.status === 'ok';
  } catch {
    return false;
  }
}

// ==========================================
// CERRAR SESION EN ESTE DISPOSITIVO
// ==========================================

export async function salirDeEsteDispositivo(): Promise<void> {
  await SecureStore.deleteItemAsync(CLAVE_SESION);
  // Se eliminan access y refresh tokens; los registros SQLite se conservan.
}
