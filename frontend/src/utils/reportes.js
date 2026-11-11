// Reportes con filtros (S4-T10, RAN-09).
//
// Cada reporte arma sus filas con los datos ya cargados en el frontend. Las
// mismas filas sirven para la vista previa y, según lo que se acuerde con el
// backend (S4-T07 a S4-T09), para descargar el PDF, XLSX o CSV.
//
// Minimización de datos (S4-T11): el responsable va solo con su nombre; no se
// incluyen correos ni otros datos personales.
import { colmenaOperativa, ultimaInspeccionPorColmena } from "./alertas";
import { ESTADO_COLMENA, ESTADO_GENERAL, ESTADO_GENERAL_TODOS, ESTADO_TRATAMIENTO, texto } from "./etiquetas";
import { diaLocal, diasDesde, formatearFecha, humanizar } from "./formato";

export const TIPO_REPORTE = {
  INSPECCIONES: {
    texto: "Inspecciones",
    titulo: "Inspecciones",
    descripcion: "Inspecciones realizadas en el período, con su estado, sanidad y responsable.",
    conPeriodo: true,
    estados: ESTADO_GENERAL,
  },
  TRATAMIENTOS: {
    texto: "Tratamientos",
    titulo: "Tratamientos",
    descripcion: "Tratamientos iniciados en el período, con producto, dosis y estado.",
    conPeriodo: true,
    estados: ESTADO_TRATAMIENTO,
  },
  COLMENAS: {
    texto: "Colmenas",
    titulo: "Estado de las colmenas",
    descripcion: "Situación actual de cada colmena en operación según su última inspección.",
    conPeriodo: false,
    estados: { ...ESTADO_GENERAL, SIN: { texto: "Sin inspección" } },
  },
};

export const FILTROS_REPORTE = { tipo: "INSPECCIONES", desde: "", hasta: "", apiario: "", colmena: "", estado: "" };

const enPeriodo = (valor, desde, hasta) => {
  const dia = diaLocal(valor);
  if (desde && (!dia || dia < desde)) return false;
  if (hasta && (!dia || dia > hasta)) return false;
  return true;
};

const siNo = (valor) => (valor === true ? "Sí" : valor === false ? "No" : "—");

// Devuelve { columnas: [nombres], filas: [[valores]] } listo para mostrar o exportar.
export function armarReporte(filtros, datos, buscar) {
  const { tipo, desde, hasta, apiario, colmena, estado } = filtros;
  const colmenas = new Map(datos.colmenas.map((c) => [c.id, c]));
  const delFiltro = (colmenaId) => {
    const c = colmenas.get(colmenaId);
    if (!c) return false;
    if (apiario && String(c.apiario_id) !== String(apiario)) return false;
    if (colmena && String(c.id) !== String(colmena)) return false;
    return true;
  };
  const apiarioDe = (colmenaId) => buscar.nombreApiario(colmenas.get(colmenaId)?.apiario_id);

  if (tipo === "INSPECCIONES") {
    const lista = datos.inspecciones
      .filter((i) => delFiltro(i.colmena_id))
      .filter((i) => enPeriodo(i.fecha_inspeccion, desde, hasta))
      .filter((i) => !estado || i.estado_general === estado)
      .sort((a, b) => new Date(b.fecha_inspeccion) - new Date(a.fecha_inspeccion));
    return {
      columnas: ["Fecha", "Colmena", "Apiario", "Estado", "Signos de enfermedad", "Marcos", "Alza", "Responsable", "Observaciones"],
      filas: lista.map((i) => [
        formatearFecha(i.fecha_inspeccion),
        buscar.codigoColmena(i.colmena_id),
        apiarioDe(i.colmena_id),
        texto(ESTADO_GENERAL_TODOS, i.estado_general, "Sin estado"),
        i.signos_enfermedad ? `Sí${i.enfermedad_observada ? `: ${i.enfermedad_observada}` : ""}` : "No",
        i.cantidad_marcos ?? "—",
        siNo(i.tiene_alza),
        buscar.nombreUsuario(i.usuario_id),
        i.observaciones || "",
      ]),
    };
  }

  if (tipo === "TRATAMIENTOS") {
    const lista = datos.tratamientos
      .filter((t) => delFiltro(t.colmena_id))
      .filter((t) => enPeriodo(t.fecha_inicio, desde, hasta))
      .filter((t) => !estado || t.estado === estado)
      .sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
    return {
      columnas: ["Inicio", "Término", "Colmena", "Apiario", "Tipo", "Producto", "Dosis", "Estado", "Responsable"],
      filas: lista.map((t) => [
        formatearFecha(t.fecha_inicio),
        t.fecha_fin ? formatearFecha(t.fecha_fin) : "—",
        buscar.codigoColmena(t.colmena_id),
        apiarioDe(t.colmena_id),
        humanizar(t.tipo_tratamiento),
        t.producto || "—",
        t.dosis || "—",
        texto(ESTADO_TRATAMIENTO, t.estado),
        buscar.nombreUsuario(t.usuario_id),
      ]),
    };
  }

  // Estado actual de las colmenas: no depende del período.
  const ultimas = ultimaInspeccionPorColmena(datos.inspecciones);
  const enCurso = new Map();
  for (const t of datos.tratamientos) {
    if (t.estado === "EN_CURSO") enCurso.set(t.colmena_id, (enCurso.get(t.colmena_id) ?? 0) + 1);
  }
  const lista = datos.colmenas
    .filter((c) => colmenaOperativa(c) && delFiltro(c.id))
    .filter((c) => !estado || (ultimas.get(c.id)?.estado_general ?? "SIN") === estado)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  return {
    columnas: ["Colmena", "Apiario", "Estado de la colmena", "Última inspección", "Estado según inspección", "Días sin inspección", "Tratamientos en curso"],
    filas: lista.map((c) => {
      const ultima = ultimas.get(c.id);
      return [
        c.codigo,
        buscar.nombreApiario(c.apiario_id),
        texto(ESTADO_COLMENA, c.estado),
        ultima ? formatearFecha(ultima.fecha_inspeccion) : "Nunca",
        ultima ? texto(ESTADO_GENERAL_TODOS, ultima.estado_general, "Sin estado") : "—",
        ultima ? diasDesde(ultima.fecha_inspeccion) : "—",
        enCurso.get(c.id) ?? 0,
      ];
    }),
  };
}

// Texto que resume los filtros aplicados, para el encabezado del reporte.
export function describirFiltros(filtros, buscar) {
  const partes = [];
  if (TIPO_REPORTE[filtros.tipo].conPeriodo) {
    if (filtros.desde && filtros.hasta) partes.push(`Del ${formatearFecha(filtros.desde)} al ${formatearFecha(filtros.hasta)}`);
    else if (filtros.desde) partes.push(`Desde el ${formatearFecha(filtros.desde)}`);
    else if (filtros.hasta) partes.push(`Hasta el ${formatearFecha(filtros.hasta)}`);
    else partes.push("Todo el período");
  }
  partes.push(filtros.apiario ? `Apiario ${buscar.nombreApiario(Number(filtros.apiario))}` : "Todos los apiarios");
  if (filtros.colmena) partes.push(`Colmena ${buscar.codigoColmena(Number(filtros.colmena))}`);
  if (filtros.estado) partes.push(`Estado: ${texto(TIPO_REPORTE[filtros.tipo].estados, filtros.estado)}`);
  return partes.join(" · ");
}
