// Capa de acceso HTTP: el único archivo que llama a fetch.
// La sesión viaja en una cookie que maneja el navegador; aquí se envía el
// token anti-CSRF, se traducen los errores de FastAPI a mensajes claros (RF-62)
// y se avisa cuando la sesión expira.
import { API_URL } from "../config/api.js";
import { codigoCorto, nuevoCorrelationId, registrarError } from "./registroErrores.js";

export class ApiError extends Error {
  constructor(mensaje, estado = 0, detalle = null, correlationId = null) {
    super(mensaje);
    this.name = "ApiError";
    this.estado = estado;
    this.detalle = detalle;
    this.correlationId = correlationId;
  }
}

// En fallas del servidor o de conexión se agrega un código corto para que el
// usuario pueda reportarlo y se encuentre el error en los logs.
function conCodigo(mensaje, correlationId) {
  return correlationId ? `${mensaje} Código de seguimiento: ${codigoCorto(correlationId)}.` : mensaje;
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

// Cada petición lleva su propio X-Correlation-ID. Devuelve la respuesta junto
// con ese identificador para registrar el error si algo falla.
// Con "silencioso" no se registra la falta de conexión: lo usa la verificación
// periódica de /health, que ya muestra ese estado en pantalla.
async function enviar(ruta, metodo, cuerpo, silencioso = false) {
  const correlationId = nuevoCorrelationId();
  const headers = { "X-Correlation-ID": correlationId };
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken && !METODOS_SIN_CSRF.includes(metodo)) headers["X-CSRF-Token"] = csrfToken;

  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers,
      credentials: "include",
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { respuesta, correlationId };
  } catch {
    if (!silencioso) registrarError({
      tipo: "API",
      mensaje: "Sin conexión con el servidor",
      correlationId,
      metodo,
      endpoint: ruta,
      estado: 0,
    });
    throw new ApiError(
      conCodigo("No se pudo conectar con el servidor. Revisa tu conexión a internet.", correlationId),
      0,
      null,
      correlationId
    );
  }
}

function notificarSesionExpirada() {
  if (!haySesion) return;
  establecerSesion(false);
  manejarSesionExpirada?.();
}

async function renovarCsrf() {
  const { respuesta, correlationId } = await enviar("/auth/csrf", "GET");
  if (respuesta.status === 401) {
    notificarSesionExpirada();
    throw new ApiError(MENSAJES_POR_ESTADO[401], 401, null, correlationId);
  }
  if (!respuesta.ok) {
    registrarError({
      tipo: "API",
      mensaje: "No se pudo renovar el token CSRF",
      correlationId,
      metodo: "GET",
      endpoint: "/auth/csrf",
      estado: respuesta.status,
    });
    throw new ApiError(
      respuesta.status >= 500
        ? conCodigo(MENSAJE_SERVIDOR, correlationId)
        : "No se pudo comprobar la sesión. Intenta nuevamente.",
      respuesta.status,
      null,
      correlationId
    );
  }
  csrfToken = (await respuesta.json()).csrf_token ?? "";
  return Boolean(csrfToken);
}

async function solicitar(ruta, { metodo = "GET", cuerpo, tipoRespuesta = "json", silencioso = false } = {}) {
  let { respuesta, correlationId } = await enviar(ruta, metodo, cuerpo, silencioso);

  if (!respuesta.ok) {
    let datos = await respuesta.json().catch(() => null);

    // La cookie puede seguir vigente aunque se pierda el estado en memoria.
    // Ante rechazo CSRF, consultar la sesion al backend y reintentar solo una vez.
    const csrfInvalido =
      respuesta.status === 403 && typeof datos?.detail === "string" && datos.detail.includes("CSRF");
    if (csrfInvalido && !METODOS_SIN_CSRF.includes(metodo) && (await renovarCsrf())) {
      ({ respuesta, correlationId } = await enviar(ruta, metodo, cuerpo));
      datos = respuesta.ok ? null : await respuesta.json().catch(() => null);
    }

    if (!respuesta.ok) {
      const detalle = datos?.detail ?? null;

      // Un 401 sin sesión es lo esperable al abrir la app sin haber ingresado:
      // no es un error que haya que registrar.
      if (!silencioso && (respuesta.status !== 401 || haySesion)) {
        registrarError({
          tipo: "API",
          nivel: respuesta.status >= 500 ? "error" : "aviso",
          mensaje: typeof detalle === "string" ? detalle : `HTTP ${respuesta.status}`,
          correlationId,
          metodo,
          endpoint: ruta,
          estado: respuesta.status,
        });
      }

      if (respuesta.status === 401 && haySesion && ruta !== "/auth/login") {
        notificarSesionExpirada();
        throw new ApiError(MENSAJES_POR_ESTADO[401], 401, detalle, correlationId);
      }

      let mensaje;
      if (respuesta.status >= 500) mensaje = conCodigo(MENSAJE_SERVIDOR, correlationId);
      else if (typeof detalle === "string") mensaje = detalle;
      else
        mensaje =
          mensajeDeValidacion(detalle) ??
          MENSAJES_POR_ESTADO[respuesta.status] ??
          "No se pudo completar la operación.";

      throw new ApiError(mensaje, respuesta.status, detalle, correlationId);
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
  // Consulta que no deja registro si no hay conexión (estado del servidor).
  sondear: (ruta) => solicitar(ruta, { silencioso: true }),
};
