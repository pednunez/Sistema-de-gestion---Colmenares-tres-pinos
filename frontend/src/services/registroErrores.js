// Registro de errores del frontend (RNF-56, S1-T11).
//
// Cada petición al backend lleva un identificador único en el encabezado
// X-Correlation-ID. Si algo falla, el error queda registrado con ese mismo
// identificador, para poder rastrearlo en los logs del backend.
//
// Nunca se registran contraseñas, tokens, cuerpos de peticiones ni parámetros
// de la URL (el enlace de recuperación de contraseña lleva un token).

const MAXIMO_REGISTROS = 50;
const registros = [];
let contexto = { vista: "" };

export function nuevoCorrelationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Respaldo para navegadores sin randomUUID (por ejemplo, http en un equipo de la red).
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Versión corta del identificador para mostrarla al usuario.
export function codigoCorto(correlationId) {
  return correlationId ? correlationId.slice(0, 8) : "";
}

export function establecerContexto(nuevo) {
  contexto = { ...contexto, ...nuevo };
}

function pantallaActual() {
  if (contexto.vista) return contexto.vista;
  return globalThis.location?.pathname ?? "";
}

function recortar(texto, largo = 300) {
  if (texto === undefined || texto === null) return undefined;
  const limpio = String(texto);
  return limpio.length > largo ? `${limpio.slice(0, largo)}…` : limpio;
}

// tipo: "API" o "UI". nivel: "error" (fallas del servidor, de red o de la
// interfaz) o "aviso" (respuestas 4xx esperables, como un formulario inválido).
export function registrarError({ tipo, nivel = "error", mensaje, correlationId, metodo, endpoint, estado, componente }) {
  const registro = {
    fecha: new Date().toISOString(),
    tipo,
    nivel,
    pantalla: pantallaActual(),
    mensaje: recortar(mensaje),
  };
  if (correlationId) registro.correlationId = correlationId;
  if (metodo) registro.metodo = metodo;
  if (endpoint) registro.endpoint = endpoint.split("?")[0];
  if (estado !== undefined) registro.estado = estado;
  if (componente) registro.componente = recortar(componente, 200);

  registros.push(registro);
  if (registros.length > MAXIMO_REGISTROS) registros.shift();

  const salida = nivel === "aviso" ? console.warn : console.error;
  salida("[Colmenares]", JSON.stringify(registro));
  return registro;
}

// Últimos errores registrados en esta sesión del navegador.
export function erroresRegistrados() {
  return registros.map((registro) => ({ ...registro }));
}

// Errores que no capturó ningún componente: excepciones y promesas rechazadas.
export function instalarCapturaGlobal() {
  if (typeof window === "undefined" || window.__capturaErroresColmenares) return;
  window.__capturaErroresColmenares = true;

  window.addEventListener("error", (evento) => {
    registrarError({ tipo: "UI", mensaje: evento.message || "Error no controlado", componente: evento.filename });
  });

  window.addEventListener("unhandledrejection", (evento) => {
    // Los errores de la API ya quedaron registrados al ocurrir.
    if (evento.reason?.name === "ApiError") return;
    registrarError({ tipo: "UI", mensaje: evento.reason?.message ?? String(evento.reason) });
  });

  // Permite revisar el registro desde la consola del navegador: erroresColmenares()
  window.erroresColmenares = erroresRegistrados;
}
