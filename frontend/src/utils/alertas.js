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

export function calcularAlertas(colmenas, inspecciones) {
  const ultimas = ultimaInspeccionPorColmena(inspecciones);
  const alertas = [];

  for (const colmena of colmenas) {
    if (!colmenaOperativa(colmena)) continue;

    const ultima = ultimas.get(colmena.id);
    const motivos = [];
    let prioridad = null;

    if (ultima?.estado_general === "CRITICO") {
      motivos.push("Última inspección en estado crítico");
      prioridad = "alta";
    }
    if (ultima?.signos_enfermedad) {
      motivos.push(
        ultima.enfermedad_observada
          ? `Signos de enfermedad: ${ultima.enfermedad_observada}`
          : "Signos de enfermedad"
      );
      prioridad = "alta";
    }
    if (ultima?.estado_general === "REGULAR") {
      motivos.push("Última inspección en estado regular");
      prioridad ??= "media";
    }
    if (colmena.estado === "EN_OBSERVACION") {
      motivos.push("Marcada en observación");
      prioridad ??= "media";
    }
    if (!ultima) {
      motivos.push("Sin inspecciones registradas");
      prioridad ??= "media";
    } else {
      const dias = diasDesde(ultima.fecha_inspeccion);
      if (dias !== null && dias > DIAS_SIN_INSPECCION) {
        motivos.push(`Sin inspección hace ${dias} días`);
        prioridad ??= "media";
      }
    }

    if (motivos.length > 0) alertas.push({ colmena, prioridad, motivos, ultima });
  }

  return alertas.sort((a, b) => (a.prioridad === "alta" ? 0 : 1) - (b.prioridad === "alta" ? 0 : 1));
}
