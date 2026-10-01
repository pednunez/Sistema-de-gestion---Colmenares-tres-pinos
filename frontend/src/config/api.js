// URL del backend. Se define en el archivo .env con VITE_API_URL.
export const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
