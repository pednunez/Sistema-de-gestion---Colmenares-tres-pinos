// Lectura de las etiquetas QR de las colmenas (PB-07, RF-19 a RF-21).
// La etiqueta puede traer la URL del backend (/colmenas/qr/<código>), la del
// frontend (?qr=<código>) o solo el código. Siempre se busca el UUID.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extraerCodigoQr(texto) {
  const encontrado = String(texto ?? "").match(UUID);
  return encontrado ? encontrado[0].toLowerCase() : null;
}

// Código QR que viene en la dirección al abrir el sistema desde una etiqueta.
export function codigoQrDeLaUrl(ubicacion = window.location) {
  return extraerCodigoQr(new URLSearchParams(ubicacion.search).get("qr"));
}

// Dirección del frontend que abre la colmena: es la que conviene imprimir.
export function enlaceDeColmena(codigoQr, origen = window.location.origin) {
  return `${origen}/?qr=${codigoQr}`;
}

// El navegador puede leer QR con la cámara (Chrome y Edge en Android y escritorio).
export function lectorDisponible() {
  return typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);
}
