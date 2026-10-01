export function esCorreoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(correo).trim());
}

// Convierte "" o espacios en null para no guardar textos vacíos.
export function textoONulo(valor) {
  const limpio = String(valor ?? "").trim();
  return limpio === "" ? null : limpio;
}
