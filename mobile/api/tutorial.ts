import * as SecureStore from 'expo-secure-store';

// ==========================================
// PREFERENCIAS DEL TUTORIAL
// COLMENARES TRES PINOS
// ==========================================

const CLAVE_TUTORIAL =
  'colmenares_tres_pinos_tutorial_v1_usuario_';

// ==========================================
// GENERAR CLAVE POR USUARIO
// ==========================================

function obtenerClave(usuarioId: number): string {

  if (
    !Number.isInteger(usuarioId) ||
    usuarioId <= 0
  ) {
    throw new Error('Identificador de usuario inválido.');
  }

  return `${CLAVE_TUTORIAL}${usuarioId}`;
}

// ==========================================
// COMPROBAR SI YA VIO EL TUTORIAL
// ==========================================

export async function tutorialFueVisto(
  usuarioId: number
): Promise<boolean> {

  const valor = await SecureStore.getItemAsync(
    obtenerClave(usuarioId)
  );

  return valor === 'VISTO';
}

// ==========================================
// GUARDAR QUE EL TUTORIAL FUE VISTO
// ==========================================

export async function marcarTutorialVisto(
  usuarioId: number
): Promise<void> {

  await SecureStore.setItemAsync(
    obtenerClave(usuarioId),
    'VISTO'
  );
}