
import * as SecureStore from 'expo-secure-store';

import {
  ErrorAPI,
  solicitarAPI,
} from './cliente';

// ==========================================
// COLMENARES TRES PINOS
// AUTENTICACION MOVIL CON FASTAPI
// ==========================================

const CLAVE_SESION =
  'colmenares_tres_pinos_sesion_v1';

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
};

type RespuestaLogin = {
  access_token: string;
  token_type: string;
  expira_en: number;
  usuario: UsuarioMovil;
};

// ==========================================
// VALIDACIONES
// ==========================================

const ROLES_PERMITIDOS = [
  'ADMIN',
  'APICULTOR',
];

function usuarioValido(
  valor: unknown
): valor is UsuarioMovil {
  if (
    !valor ||
    typeof valor !== 'object'
  ) {
    return false;
  }

  const usuario =
    valor as Partial<UsuarioMovil>;

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

export function tokenVigente(
  sesion: SesionMovil
): boolean {
  // Margen de seguridad de 30 segundos.
  return Date.now() < sesion.expiraEn - 30000;
}

// ==========================================
// INICIAR SESION
// POST /auth/token
// ==========================================

export async function iniciarSesion(
  correoIngresado: string,
  password: string
): Promise<SesionMovil> {
  const email = correoIngresado
    .trim()
    .toLowerCase();

  // Validar correo.
  if (
    email.length < 5 ||
    email.length > 150 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error(
      'Ingresa un correo electrónico válido.'
    );
  }

  // Validar contraseña.
  if (
    password.length < 8 ||
    password.length > 128
  ) {
    throw new Error(
      'La contraseña debe tener entre 8 y 128 caracteres.'
    );
  }

  let respuesta: RespuestaLogin;

  try {
    respuesta =
      await solicitarAPI<RespuestaLogin>(
        '/auth/token',
        {
          method: 'POST',
          body: {
            email,
            password,
          },
        }
      );
  } catch (error) {
    if (
      error instanceof ErrorAPI &&
      error.estado === 404
    ) {
      throw new Error(
        'El servidor conectado no tiene disponible /auth/token. Debe utilizarse el backend actualizado del equipo.'
      );
    }

    throw error;
  }

  // ========================================
  // VALIDAR RESPUESTA DEL SERVIDOR
  // ========================================

  if (
    !respuesta ||
    typeof respuesta.access_token !==
      'string' ||
    respuesta.access_token.length === 0 ||
    respuesta.token_type?.toLowerCase() !==
      'bearer' ||
    !Number.isInteger(respuesta.expira_en) ||
    respuesta.expira_en <= 0 ||
    !usuarioValido(respuesta.usuario)
  ) {
    throw new Error(
      'El servidor devolvió una respuesta de autenticación inválida.'
    );
  }

  // ========================================
  // CREAR SESION
  // ========================================

  const sesion: SesionMovil = {
    accessToken: respuesta.access_token,
    expiraEn:
      Date.now() +
      respuesta.expira_en * 1000,
    usuario: respuesta.usuario,
  };

  // Guardar token y datos de sesion
  // en almacenamiento seguro.
  await SecureStore.setItemAsync(
    CLAVE_SESION,
    JSON.stringify(sesion)
  );

  return sesion;
}

// ==========================================
// RECUPERAR SESION GUARDADA
// ==========================================

export async function leerSesionGuardada():
  Promise<SesionMovil | null> {
  const texto =
    await SecureStore.getItemAsync(
      CLAVE_SESION
    );

  if (!texto) {
    return null;
  }

  try {
    const datos: unknown =
      JSON.parse(texto);

    if (
      !datos ||
      typeof datos !== 'object'
    ) {
      return null;
    }

    const sesion =
      datos as Partial<SesionMovil>;

    if (
      typeof sesion.accessToken !==
        'string' ||
      !sesion.accessToken ||
      typeof sesion.expiraEn !==
        'number' ||
      !Number.isFinite(sesion.expiraEn) ||
      !usuarioValido(sesion.usuario)
    ) {
      return null;
    }

    return sesion as SesionMovil;
  } catch {
    return null;
  }
}

// ==========================================
// VERIFICAR USUARIO CON FASTAPI
// GET /auth/me
// ==========================================

export async function verificarUsuario(
  sesion: SesionMovil
): Promise<void> {
  if (!tokenVigente(sesion)) {
    throw new ErrorAPI(
      401,
      'El token ha vencido.'
    );
  }

  const usuario =
    await solicitarAPI<UsuarioMovil>(
      '/auth/me',
      {
        token: sesion.accessToken,
      }
    );

  if (
    !usuarioValido(usuario) ||
    usuario.id !== sesion.usuario.id
  ) {
    throw new ErrorAPI(
      401,
      'La identidad de la sesión no coincide.'
    );
  }
}

// ==========================================
// COMPROBAR DISPONIBILIDAD DE FASTAPI
// GET /health
// ==========================================

export async function comprobarServidor():
  Promise<boolean> {
  try {
    const resultado =
      await solicitarAPI<{
        status: string;
      }>('/health');

    return resultado.status === 'ok';
  } catch {
    return false;
  }
}

// ==========================================
// CERRAR SESION EN ESTE DISPOSITIVO
// ==========================================

export async function salirDeEsteDispositivo():
  Promise<void> {
  await SecureStore.deleteItemAsync(
    CLAVE_SESION
  );

  // No se eliminan inspecciones,
  // tratamientos ni registros SQLite.
}
