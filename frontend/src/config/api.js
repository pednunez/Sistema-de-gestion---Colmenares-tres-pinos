// En desarrollo, ambas direcciones locales deben compartir el hostname
// para que el navegador envie la cookie SameSite=Lax.
export function resolverApiUrl(configurada, ubicacion, desarrollo) {
  const porDefecto = `${ubicacion.protocol}//${ubicacion.hostname}:8000`;
  const url = new URL(configurada || porDefecto, ubicacion.origin);
  const locales = ["localhost", "127.0.0.1"];
  if (desarrollo && locales.includes(url.hostname) && locales.includes(ubicacion.hostname)) {
    url.hostname = ubicacion.hostname;
  }
  return url.href.replace(/\/+$/, "");
}

export const API_URL = resolverApiUrl(
  import.meta.env?.VITE_API_URL,
  globalThis.location ?? new URL("http://localhost:5173"),
  import.meta.env?.DEV ?? false
);
