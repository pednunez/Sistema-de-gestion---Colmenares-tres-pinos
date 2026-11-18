import { api } from "./api";

const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" };

export async function descargarReporte(filtros, formato) {
  const tipo = filtros.tipo.toLowerCase();
  const extension = formato.toLowerCase();
  if (!["inspecciones", "tratamientos", "colmenas"].includes(tipo) || !MIME[extension]) {
    throw new Error("Reporte o formato no válido.");
  }
  const params = new URLSearchParams({ formato: extension });
  for (const [campo, valor] of Object.entries({
    apiario_id: filtros.apiario, colmena_id: filtros.colmena, estado: filtros.estado,
    desde: tipo === "colmenas" ? "" : filtros.desde,
    hasta: tipo === "colmenas" ? "" : filtros.hasta,
  })) if (valor) params.set(campo, valor);
  const { blob, disposition } = await api.archivo(`/reportes/${tipo}?${params}`);
  if (blob.type.split(";")[0] !== MIME[extension] || !blob.size) {
    throw new Error("El servidor no devolvió un archivo válido. Intenta nuevamente.");
  }
  const sugerido = disposition?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1];
  const nombre = sugerido?.endsWith(`.${extension}`) ? sugerido : `reporte-${tipo}.${extension}`;
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.append(enlace);
  try { enlace.click(); }
  finally {
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
