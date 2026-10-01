const formatoFecha = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
const formatoFechaHora = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// "2026-09-23" se interpreta como fecha local; si no, el navegador la toma
// en UTC y en Chile aparecería un día antes.
function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return new Date(`${valor}T00:00:00`);
  }
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function formatearFecha(valor, porDefecto = "Sin fecha") {
  const fecha = aFecha(valor);
  return fecha ? formatoFecha.format(fecha) : porDefecto;
}

export function formatearFechaHora(valor, porDefecto = "Sin fecha") {
  const fecha = aFecha(valor);
  return fecha ? formatoFechaHora.format(fecha) : porDefecto;
}

export function hoyISO() {
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  return ahora.toISOString().slice(0, 10);
}

export function diasDesde(valor) {
  const fecha = aFecha(valor);
  if (!fecha) return null;
  return Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
}

// "CONTROL_SANITARIO" -> "Control sanitario". Textos normales quedan igual.
export function humanizar(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const texto = String(valor);
  if (!/^[A-Z0-9_]+$/.test(texto)) return texto;
  const minusculas = texto.replace(/_/g, " ").toLowerCase();
  return minusculas.charAt(0).toUpperCase() + minusculas.slice(1);
}

export function nombreCompleto(usuario) {
  if (!usuario) return "";
  return [usuario.nombre, usuario.apellido].filter(Boolean).join(" ");
}
