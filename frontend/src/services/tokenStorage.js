// Único lugar donde se guarda y lee el token JWT.
const CLAVE = "access_token";

export function obtenerToken() {
  try {
    return localStorage.getItem(CLAVE) || sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarToken(token, recordar) {
  borrarToken();
  (recordar ? localStorage : sessionStorage).setItem(CLAVE, token);
}

export function borrarToken() {
  localStorage.removeItem(CLAVE);
  sessionStorage.removeItem(CLAVE);
}
