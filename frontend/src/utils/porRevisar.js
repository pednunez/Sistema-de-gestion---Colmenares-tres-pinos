// Colmenas que requieren revisión (S4-T04, RAN-08).
//
// Junta dos motivos:
// - SIN_REVISION: el backend (GET /colmenas/sin-revision) informa que la colmena
//   no tiene inspecciones en el período elegido o que nunca se inspeccionó.
// - ESTADO: su última inspección quedó en «Requiere revisión» (o «Crítico» en la
//   escala anterior). Se calcula con las inspecciones ya cargadas.
import { colmenaOperativa, ultimaInspeccionPorColmena } from "./alertas";
import { diasDesde } from "./formato";

export const PERIODOS = [15, 30, 60, 90];
export const PERIODO_INICIAL = 30;

const ESTADOS_A_REVISAR = ["REQUIERE_REVISION", "CRITICO"];

// Devuelve [{ colmena, ultima, fechaUltima, dias, requiereRevision, sinRevision, nunca }]
// ordenadas: primero «Requiere revisión», luego las nunca inspeccionadas y
// después las que llevan más días sin revisar.
export function armarPorRevisar(sinRevision, colmenas, inspecciones, apiarioId = "") {
  const ultimas = ultimaInspeccionPorColmena(inspecciones);
  const delApiario = (colmena) => !apiarioId || String(colmena.apiario_id) === String(apiarioId);
  const filas = new Map();

  const agregar = (colmena, cambios) => {
    const ultima = ultimas.get(colmena.id) ?? null;
    const previa = filas.get(colmena.id) ?? {
      colmena,
      ultima,
      fechaUltima: ultima?.fecha_inspeccion ?? null,
      requiereRevision: false,
      sinRevision: false,
    };
    filas.set(colmena.id, { ...previa, ...cambios });
  };

  for (const fila of sinRevision ?? []) {
    if (!delApiario(fila)) continue;
    agregar(fila, {
      sinRevision: true,
      // La fecha del backend manda: considera todas las inspecciones, no solo las cargadas.
      fechaUltima: fila.ultima_inspeccion ?? null,
    });
  }

  for (const colmena of colmenas) {
    if (!colmenaOperativa(colmena) || !delApiario(colmena)) continue;
    const ultima = ultimas.get(colmena.id);
    if (ultima && ESTADOS_A_REVISAR.includes(ultima.estado_general)) {
      agregar(filas.get(colmena.id)?.colmena ?? colmena, { requiereRevision: true });
    }
  }

  return [...filas.values()]
    .map((fila) => ({
      ...fila,
      nunca: !fila.fechaUltima,
      dias: fila.fechaUltima ? diasDesde(fila.fechaUltima) : null,
    }))
    .sort(
      (a, b) =>
        Number(b.requiereRevision) - Number(a.requiereRevision) ||
        Number(b.nunca) - Number(a.nunca) ||
        (b.dias ?? 0) - (a.dias ?? 0) ||
        String(a.colmena.codigo).localeCompare(String(b.colmena.codigo), "es", { numeric: true })
    );
}

export function contarMotivos(filas) {
  return {
    total: filas.length,
    requiereRevision: filas.filter((f) => f.requiereRevision).length,
    nunca: filas.filter((f) => f.nunca).length,
    sinRevision: filas.filter((f) => f.sinRevision && !f.nunca).length,
  };
}
