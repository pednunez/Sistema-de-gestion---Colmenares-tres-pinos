// Historial de una colmena (PB-12, RF-43 a RF-45).
//
// Une los eventos que entrega el backend (GET /historial/colmenas/{id}) con los
// registros ya cargados en el frontend, para mostrar el detalle de cada uno y
// las transferencias en las dos direcciones (salida y llegada).

export const TIPO_EVENTO = {
  INSPECCION: { texto: "Inspecciones", singular: "Inspección" },
  TRATAMIENTO: { texto: "Tratamientos", singular: "Tratamiento" },
  TRANSFERENCIA: { texto: "Transferencias", singular: "Transferencia" },
  OTRO: { texto: "Otros", singular: "Otro" },
};

export function tipoDeEvento(tipo = "") {
  const valor = String(tipo).toUpperCase();
  if (valor.includes("INSPEC")) return "INSPECCION";
  if (valor.includes("TRAT")) return "TRATAMIENTO";
  if (valor.includes("TRANSF")) return "TRANSFERENCIA";
  return "OTRO";
}

const fechaDe = {
  INSPECCION: (r) => r.fecha_inspeccion,
  TRATAMIENTO: (r) => r.fecha_inicio,
  TRANSFERENCIA: (r) => r.fecha_transferencia ?? r.fecha_creacion,
};

// Devuelve los eventos ordenados del más reciente al más antiguo:
// { clave, tipo, id, fecha, registro, detalleServidor, direccion, otraColmenaId }
export function armarHistorial(eventosServidor, datos, colmenaId) {
  const id = Number(colmenaId);
  const eventos = new Map();
  const agregar = (tipo, registro, extra = {}) => {
    const clave = `${tipo}-${registro.id}`;
    eventos.set(clave, {
      ...eventos.get(clave),
      clave,
      tipo,
      id: registro.id,
      registro,
      fecha: fechaDe[tipo](registro),
      ...extra,
    });
  };

  for (const evento of eventosServidor ?? []) {
    const tipo = tipoDeEvento(evento.tipo_evento);
    const clave = `${tipo}-${evento.evento_id}`;
    eventos.set(clave, {
      clave,
      tipo,
      id: evento.evento_id,
      fecha: evento.fecha,
      registro: null,
      detalleServidor: evento.detalle ?? null,
    });
  }

  for (const inspeccion of datos.inspecciones ?? []) {
    if (Number(inspeccion.colmena_id) === id) agregar("INSPECCION", inspeccion);
  }
  for (const tratamiento of datos.tratamientos ?? []) {
    if (Number(tratamiento.colmena_id) === id) agregar("TRATAMIENTO", tratamiento);
  }
  for (const transferencia of datos.transferencias ?? []) {
    const sale = Number(transferencia.colmena_origen_id) === id;
    const llega = Number(transferencia.colmena_destino_id) === id;
    if (!sale && !llega) continue;
    agregar("TRANSFERENCIA", transferencia, {
      direccion: sale ? "SALIDA" : "LLEGADA",
      otraColmenaId: Number(sale ? transferencia.colmena_destino_id : transferencia.colmena_origen_id),
    });
  }

  return [...eventos.values()].sort((a, b) => new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0));
}

export function contarPorTipo(eventos) {
  const conteo = { TODOS: eventos.length };
  for (const evento of eventos) conteo[evento.tipo] = (conteo[evento.tipo] ?? 0) + 1;
  return conteo;
}

// Filtro por tipo ("TODOS" o un tipo) y por rango de fechas (YYYY-MM-DD, inclusivo).
export function filtrarHistorial(eventos, { tipo = "TODOS", desde = "", hasta = "" } = {}) {
  return eventos.filter((evento) => {
    if (tipo !== "TODOS" && evento.tipo !== tipo) return false;
    const dia = String(evento.fecha ?? "").slice(0, 10);
    if (desde && (!dia || dia < desde)) return false;
    if (hasta && (!dia || dia > hasta)) return false;
    return true;
  });
}
