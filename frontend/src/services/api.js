// Capa de acceso HTTP: el único archivo que llama a fetch.
// La sesión viaja en una cookie que maneja el navegador; aquí se envía el
// token anti-CSRF, se traducen los errores de FastAPI a mensajes claros (RF-62)
// y se avisa cuando la sesión expira.
import { API_URL } from "../config/api.js";

export class ApiError extends Error {
  constructor(mensaje, estado = 0, detalle = null) {
    super(mensaje);
    this.name = "ApiError";
    this.estado = estado;
    this.detalle = detalle;
  }
}

// El token anti-CSRF se guarda solo en memoria. Tras recargar la página se
// vuelve a pedir al backend.
let csrfToken = "";
let haySesion = false;
let manejarSesionExpirada = null;

export function establecerSesion(activa, csrf = "") {
  haySesion = activa;
  csrfToken = activa ? csrf : "";
}

export function alExpirarSesion(funcion) {
  manejarSesionExpirada = funcion;
}

const METODOS_SIN_CSRF = ["GET", "HEAD", "OPTIONS"];

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

async function enviar(ruta, metodo, cuerpo) {
  const headers = {};
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken && !METODOS_SIN_CSRF.includes(metodo)) headers["X-CSRF-Token"] = csrfToken;

  try {
    return await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers,
      credentials: "include",
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión a internet.");
  }
}

function notificarSesionExpirada() {
  if (!haySesion) return;
  establecerSesion(false);
  manejarSesionExpirada?.();
}

async function renovarCsrf() {
  const respuesta = await enviar("/auth/csrf", "GET");
  if (respuesta.status === 401) {
    notificarSesionExpirada();
    throw new ApiError(MENSAJES_POR_ESTADO[401], 401);
  }
  if (!respuesta.ok) {
    throw new ApiError(
      respuesta.status >= 500 ? MENSAJE_SERVIDOR : "No se pudo comprobar la sesión. Intenta nuevamente.",
      respuesta.status
    );
  }
  csrfToken = (await respuesta.json()).csrf_token ?? "";
  return Boolean(csrfToken);
}

async function solicitar(ruta, { metodo = "GET", cuerpo, tipoRespuesta = "json" } = {}) {
  let respuesta = await enviar(ruta, metodo, cuerpo);

  if (!respuesta.ok) {
    let datos = await respuesta.json().catch(() => null);

    // Si el token anti-CSRF quedó desactualizado, se renueva y se reintenta una vez.
    const csrfInvalido =
      respuesta.status === 403 && typeof datos?.detail === "string" && datos.detail.includes("CSRF");
    if (csrfInvalido && haySesion && (await renovarCsrf())) {
      respuesta = await enviar(ruta, metodo, cuerpo);
      datos = respuesta.ok ? null : await respuesta.json().catch(() => null);
    }

    if (!respuesta.ok) {
      const detalle = datos?.detail ?? null;

      if (respuesta.status === 401 && haySesion && ruta !== "/auth/login") {
        notificarSesionExpirada();
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
