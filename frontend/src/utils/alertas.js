// Reglas de alerta (RF-51, RF-53, RF-54). Se calculan en el frontend con los
// datos ya cargados. Los umbrales deben validarse con el cliente.
import { diasDesde } from "./formato";

export const DIAS_SIN_INSPECCION = 30;

export function colmenaOperativa(colmena) {
  return colmena.estado !== "INACTIVA" && colmena.estado !== "BAJA";
}

export function ultimaInspeccionPorColmena(inspecciones) {
  const ultimas = new Map();
  for (const inspeccion of inspecciones) {
    const actual = ultimas.get(inspeccion.colmena_id);
    if (!actual || new Date(inspeccion.fecha_inspeccion) > new Date(actual.fecha_inspeccion)) {
      ultimas.set(inspeccion.colmena_id, inspeccion);
    }
  }
  return ultimas;
}

// Cada alerta trae sus motivos como texto (`motivos`) y con el registro que
// los originó (`detalles`, S4-T06):
// - origen INSPECCION: la última inspección de la colmena (estado, enfermedad,
//   colmena débil o días sin inspección).
// - origen COLMENA: el estado de la colmena (en observación).
// - origen SIN_INSPECCION: la colmena nunca se inspeccionó.
export function calcularAlertas(colmenas, inspecciones) {
  const ultimas = ultimaInspeccionPorColmena(inspecciones);
  const alertas = [];

  for (const colmena of colmenas) {
    if (!colmenaOperativa(colmena)) continue;

    const ultima = ultimas.get(colmena.id);
    const detalles = [];
    const agregar = (texto, prioridad, origen) => detalles.push({ texto, prioridad, origen });

    if (ultima?.estado_general === "REQUIERE_REVISION" || ultima?.estado_general === "CRITICO") {
      agregar(
        ultima.estado_general === "CRITICO" ? "Última inspección en estado crítico" : "Última inspección: requiere revisión",
        "alta",
        "INSPECCION"
      );
    }
    if (ultima?.signos_enfermedad) {
      agregar(
        ultima.enfermedad_observada ? `Signos de enfermedad: ${ultima.enfermedad_observada}` : "Signos de enfermedad",
        "alta",
        "INSPECCION"
      );
    }
    if (ultima?.estado_general === "DEBIL" || ultima?.estado_general === "REGULAR") {
      agregar(
        ultima.estado_general === "REGULAR" ? "Última inspección en estado regular" : "Última inspección: colmena débil",
        "media",
        "INSPECCION"
      );
    }
    if (colmena.estado === "EN_OBSERVACION") agregar("Marcada en observación", "media", "COLMENA");
    if (!ultima) {
      agregar("Sin inspecciones registradas", "media", "SIN_INSPECCION");
    } else {
      const dias = diasDesde(ultima.fecha_inspeccion);
      if (dias !== null && dias > DIAS_SIN_INSPECCION) agregar(`Sin inspección hace ${dias} días`, "media", "INSPECCION");
    }

    if (detalles.length > 0) {
      alertas.push({
        colmena,
        prioridad: detalles.some((d) => d.prioridad === "alta") ? "alta" : "media",
        motivos: detalles.map((d) => d.texto),
        detalles,
        ultima: ultima ?? null,
      });
    }
  }

  return alertas.sort((a, b) => (a.prioridad === "alta" ? 0 : 1) - (b.prioridad === "alta" ? 0 : 1));
}
