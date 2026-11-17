
import { solicitarAPI } from './cliente';

// ==========================================
// TIPOS
// ==========================================

export type RolUsuario = 'ADMIN' | 'APICULTOR';

export type UsuarioAPI = {
  id: number;
  nombre: string;
  apellido: string | null;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  fecha_eliminacion: string | null;
};

export type UsuarioCrear = {
  nombre: string;
  apellido: string | null;
  email: string;
  rol: RolUsuario;
  password: string;
};

export type UsuarioActualizar = {
  nombre?: string;
  apellido?: string | null;
  email?: string;
  rol?: RolUsuario;
};

// ==========================================
// LISTAR USUARIOS
// GET /usuarios/
// ==========================================

export async function listarUsuarios(
  token: string
): Promise<UsuarioAPI[]> {
  const respuesta = await solicitarAPI<UsuarioAPI[]>(
    '/usuarios/',
    { token }
  );

  if (!Array.isArray(respuesta)) {
    throw new Error(
      'El servidor devolvió un listado de usuarios inválido.'
    );
  }

  return respuesta;
}

// ==========================================
// OBTENER USUARIO
// GET /usuarios/{usuario_id}
// ==========================================

export async function obtenerUsuario(
  token: string,
  usuarioId: number
): Promise<UsuarioAPI> {
  return solicitarAPI<UsuarioAPI>(
    `/usuarios/${usuarioId}`,
    { token }
  );
}

// ==========================================
// CREAR USUARIO
// POST /usuarios/
// ==========================================

export async function crearUsuario(
  token: string,
  datos: UsuarioCrear
): Promise<UsuarioAPI> {
  return solicitarAPI<UsuarioAPI>(
    '/usuarios/',
    {
      method: 'POST',
      token,
      body: datos,
    }
  );
}

// ==========================================
// ACTUALIZAR USUARIO
// PATCH /usuarios/{usuario_id}
// ==========================================

export async function actualizarUsuario(
  token: string,
  usuarioId: number,
  datos: UsuarioActualizar
): Promise<UsuarioAPI> {
  return solicitarAPI<UsuarioAPI>(
    `/usuarios/${usuarioId}`,
    {
      method: 'PATCH',
      token,
      body: datos,
    }
  );
}

// ==========================================
// DESACTIVAR USUARIO
// DELETE /usuarios/{usuario_id}
// BAJA LOGICA
// ==========================================

export async function desactivarUsuario(
  token: string,
  usuarioId: number
): Promise<void> {
  await solicitarAPI<unknown>(
    `/usuarios/${usuarioId}`,
    {
      method: 'DELETE',
      token,
    }
  );
}
