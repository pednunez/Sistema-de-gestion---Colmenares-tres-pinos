import { useState } from "react";
import { ESTADO_GENERAL_TODOS } from "../../utils/etiquetas";
import { formatearFecha } from "../../utils/formato";
import { ESTADOS_GRAFICO } from "../../utils/graficoEstados";

const COLOR_ESTADO = Object.fromEntries(ESTADOS_GRAFICO.map((e) => [e.clave, e.color]));
const colorDe = (estado) => COLOR_ESTADO[estado] ?? COLOR_ESTADO.ANTERIOR;
const porcentajeDe = (cantidad, total) => (total ? Math.round((cantidad * 100) / total) : 0);

// Distribución de las colmenas según el estado de su última inspección:
// una barra apilada (la parte de cada estado en el total) y, debajo, una fila
// por estado con su cantidad y porcentaje, que hace de leyenda y de tabla.
export function DistribucionEstados({ conteo, total }) {
  const [resaltado, setResaltado] = useState(null);
  const filas = ESTADOS_GRAFICO.filter((fila) => !fila.soloSiHay || conteo[fila.clave] > 0);
  const conDatos = filas.filter((fila) => conteo[fila.clave] > 0);
  const descripcion = conDatos.map((f) => `${f.texto}: ${conteo[f.clave]}`).join(", ");

  return (
    <div className="grid gap-5 p-5">
      <div
        role="img"
        aria-label={total ? `Colmenas por estado. ${descripcion}.` : "Sin colmenas en operación."}
        className="flex h-4 w-full gap-0.5 overflow-hidden rounded bg-slate-100"
      >
        {conDatos.map((fila) => (
          <div
            key={fila.clave}
            title={`${fila.texto}: ${conteo[fila.clave]} (${porcentajeDe(conteo[fila.clave], total)}%)`}
            onMouseEnter={() => setResaltado(fila.clave)}
            onMouseLeave={() => setResaltado(null)}
            className="h-full transition-opacity first:rounded-l last:rounded-r"
            style={{
              flexGrow: conteo[fila.clave],
              backgroundColor: fila.color,
              opacity: resaltado && resaltado !== fila.clave ? 0.35 : 1,
            }}
          />
        ))}
      </div>

      <ul className="grid gap-3.5" aria-label="Detalle por estado">
        {filas.map((fila) => {
          const cantidad = conteo[fila.clave];
          const porcentaje = porcentajeDe(cantidad, total);
          return (
            <li
              key={fila.clave}
              onMouseEnter={() => setResaltado(fila.clave)}
              onMouseLeave={() => setResaltado(null)}
              className={`rounded-lg transition-opacity ${resaltado && resaltado !== fila.clave ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: fila.color }} aria-hidden="true" />
                  {fila.texto}
                </span>
                <span className="font-semibold text-slate-900">
                  {cantidad} <span className="font-normal text-slate-500">({porcentaje}%)</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${porcentaje}%`, backgroundColor: fila.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MAXIMO_INSPECCIONES = 12;

// Estado de una colmena en sus últimas inspecciones, de la más antigua a la
// más reciente. Cada casilla abre el detalle de esa inspección.
export function EstadosDeColmena({ inspecciones, onVer }) {
  const ultimas = [...inspecciones]
    .sort((a, b) => new Date(a.fecha_inspeccion) - new Date(b.fecha_inspeccion))
    .slice(-MAXIMO_INSPECCIONES);

  if (ultimas.length === 0) {
    return <p className="px-5 py-10 text-sm text-slate-600">Esta colmena todavía no tiene inspecciones.</p>;
  }

  const presentes = ESTADOS_GRAFICO.filter((e) =>
    ultimas.some((i) => (i.estado_general in COLOR_ESTADO ? i.estado_general : "ANTERIOR") === e.clave)
  );

  return (
    <div className="grid gap-4 p-5">
      <div>
        <ol className="flex h-10 gap-1" aria-label="Estado en cada inspección, de la más antigua a la más reciente">
          {ultimas.map((inspeccion) => {
            const estado = ESTADO_GENERAL_TODOS[inspeccion.estado_general]?.texto ?? "Sin estado";
            const fecha = formatearFecha(inspeccion.fecha_inspeccion);
            return (
              <li key={inspeccion.id} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onVer(inspeccion)}
                  title={`${fecha}: ${estado}`}
                  aria-label={`Inspección del ${fecha}: ${estado}`}
                  className="h-full w-full rounded transition hover:ring-2 hover:ring-slate-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  style={{ backgroundColor: colorDe(inspeccion.estado_general) }}
                />
              </li>
            );
          })}
        </ol>
        <div className="mt-1.5 flex justify-between text-xs text-slate-500" aria-hidden="true">
          <span>{formatearFecha(ultimas[0].fecha_inspeccion)}</span>
          {ultimas.length > 1 && <span>{formatearFecha(ultimas.at(-1).fecha_inspeccion)}</span>}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Leyenda">
        {presentes.map((e) => (
          <li key={e.clave} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: e.color }} aria-hidden="true" />
            {e.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
