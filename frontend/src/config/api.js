// URL del backend. Se define en el archivo .env con VITE_API_URL.
//
// La sesión viaja en una cookie, y el navegador solo la envía si el frontend y
// el backend usan el mismo nombre de equipo. "localhost" y "127.0.0.1" cuentan
// como sitios distintos, así que por defecto se usa el mismo nombre con el que
// se abrió el frontend.
const porDefecto = `${window.location.protocol}//${window.location.hostname}:8000`;

export const API_URL = (import.meta.env.VITE_API_URL || porDefecto).replace(/\/+$/, "");
