// Capa de acceso HTTP: el único archivo que llama a fetch.
// Agrega el token, traduce los errores de FastAPI a mensajes claros (RF-62)
// y avisa cuando la sesión expira.
import { API_URL } from "../config/api";
import { obtenerToken } from "./tokenStorage";

export class ApiError extends Error {
  constructor(mensaje, estado = 0, detalle = null) {
    super(mensaje);
    this.name = "ApiError";
    this.estado = estado;
    this.detalle = detalle;
  }
}

let manejarSesionExpirada = null;

export function alExpirarSesion(funcion) {
  manejarSesionExpirada = funcion;
}

const MENSAJES_POR_ESTADO = {
  400: "La solicitud no es válida. Revisa los datos ingresados.",
  401: "Tu sesión expiró. Vuelve a iniciar sesión.",
  403: "No tienes permisos para realizar esta acción.",
  404: "El registro no existe o fue dado de baja.",
  409: "Ya existe un registro con esos datos.",
  422: "Hay datos inválidos en el formulario. Revísalos e intenta nuevamente.",
};

const MENSAJE_SERVIDOR = "El servidor tuvo un problema. Intenta nuevamente en unos minutos.";

// Pydantic devuelve una lista de errores. Los value_error traen mensajes
// escritos por el equipo en español; el resto se reemplaza por un mensaje genérico.
function mensajeDeValidacion(detalle) {
  if (!Array.isArray(detalle) || detalle.length === 0) return null;
  const error = detalle[0];
  if (error?.type === "value_error" && error.msg) {
    return error.msg.replace(/^Value error,\s*/i, "");
  }
  return null;
}

async function solicitar(ruta, { metodo = "GET", cuerpo, tipoRespuesta = "json" } = {}) {
  const token = obtenerToken();
  const headers = {};
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión a internet.");
  }

  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null);
    const detalle = datos?.detail ?? null;

    if (respuesta.status === 401 && token) {
      manejarSesionExpirada?.();
      throw new ApiError(MENSAJES_POR_ESTADO[401], 401, detalle);
    }

    let mensaje;
    if (respuesta.status >= 500) mensaje = MENSAJE_SERVIDOR;
    else if (typeof detalle === "string") mensaje = detalle;
    else
      mensaje =
        mensajeDeValidacion(detalle) ??
        MENSAJES_POR_ESTADO[respuesta.status] ??
        "No se pudo completar la operación.";

    throw new ApiError(mensaje, respuesta.status, detalle);
  }

  if (respuesta.status === 204) return null;
  if (tipoRespuesta === "blob") return respuesta.blob();
  return respuesta.json();
}

export const api = {
  get: (ruta) => solicitar(ruta),
  post: (ruta, cuerpo) => solicitar(ruta, { metodo: "POST", cuerpo }),
  patch: (ruta, cuerpo) => solicitar(ruta, { metodo: "PATCH", cuerpo }),
  delete: (ruta) => solicitar(ruta, { metodo: "DELETE" }),
  blob: (ruta) => solicitar(ruta, { tipoRespuesta: "blob" }),
};
