import { useMemo, useState } from "react";
import { AlertTriangle, CalendarX2, CheckCircle2, ClipboardPlus, Clock } from "lucide-react";
import Boton from "../components/ui/Boton";
import Insignia, { InsigniaDe } from "../components/ui/Insignia";
import { Seleccion } from "../components/ui/Campo";
import { Cargando, ErrorCarga, EstadoVacio } from "../components/ui/Estados";
import { EncabezadoModulo } from "../components/ui/Estructura";
import FiltroApiario from "../components/ui/FiltroApiario";
import { useConsulta } from "../hooks/useConsulta";
import { useDatos } from "../hooks/useDatos";
import { useNavegacion } from "../hooks/useNavegacion";
import { colmenasService } from "../services/colmenasService";
import { ESTADO_GENERAL_TODOS } from "../utils/etiquetas";
import { formatearFecha } from "../utils/formato";
import { PERIODOS, PERIODO_INICIAL, armarPorRevisar, contarMotivos } from "../utils/porRevisar";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Colmenas que requieren revisión (S4-T04): sin inspección en el período
// elegido, nunca inspeccionadas o con su última inspección en «Requiere revisión».
export default function PorRevisarPage() {
  const { datos, cargado, nombreApiario } = useDatos();
  const { navegar, parametros } = useNavegacion();
  const [apiarioId, setApiarioId] = useState(String(parametros.apiario ?? ""));
  const [dias, setDias] = useState(PERIODO_INICIAL);

  const consulta = useConsulta(() => colmenasService.sinRevision({ dias, apiarioId }), [dias, apiarioId]);

  const apiariosOrdenados = useMemo(
    () => [...datos.apiarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [datos.apiarios]
  );
  const filas = useMemo(
    () => armarPorRevisar(consulta.datos, datos.colmenas, datos.inspecciones, apiarioId),
    [consulta.datos, datos.colmenas, datos.inspecciones, apiarioId]
  );
  const conteo = contarMotivos(filas);

  if (!cargado) return <Cargando texto="Cargando colmenas..." />;

  return (
    <>
      <EncabezadoModulo
        descripcion={`Colmenas sin inspección en los últimos ${dias} días, nunca inspeccionadas o con su última inspección en «Requiere revisión».`}
      />

      <FiltroApiario apiarios={apiariosOrdenados} valor={apiarioId} onCambiar={setApiarioId} />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Seleccion
          etiqueta="Sin inspección en los últimos"
          value={String(dias)}
          onChange={(e) => setDias(Number(e.target.value))}
          opciones={PERIODOS.map((n) => ({ valor: String(n), texto: `${n} días` }))}
          className="sm:w-56"
        />
        {filas.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Resumen de motivos">
            <Insignia tono="gris">{plural(conteo.total, "colmena", "colmenas")}</Insignia>
            {conteo.requiereRevision > 0 && (
              <Insignia tono="rojo" icono={AlertTriangle}>
                {conteo.requiereRevision} en «Requiere revisión»
              </Insignia>
            )}
            {conteo.nunca > 0 && (
              <Insignia tono="ambar" icono={CalendarX2}>
                {plural(conteo.nunca, "nunca inspeccionada", "nunca inspeccionadas")}
              </Insignia>
            )}
            {conteo.sinRevision > 0 && (
              <Insignia tono="ambar" icono={Clock}>
                {conteo.sinRevision} con más de {dias} días
              </Insignia>
            )}
          </div>
        )}
      </div>

      {consulta.error && (
        <div className="mb-4">
          <ErrorCarga
            mensaje={`No se pudo consultar las colmenas sin inspección (${consulta.error.replace(/\.$/, "")}). Por ahora se muestran solo las que quedaron en «Requiere revisión».`}
            onReintentar={consulta.recargar}
          />
        </div>
      )}

      {consulta.cargando && filas.length === 0 ? (
        <Cargando texto="Buscando colmenas por revisar..." />
      ) : filas.length === 0 ? (
        <EstadoVacio
          icono={CheckCircle2}
          titulo="No hay colmenas por revisar"
          texto={`Todas las colmenas ${apiarioId ? `de ${nombreApiario(Number(apiarioId))} ` : ""}tienen una inspección en los últimos ${dias} días y ninguna quedó en «Requiere revisión».`}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Colmenas que requieren revisión</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-4 font-medium">Colmena</th>
                <th className="p-4 font-medium">Apiario</th>
                <th className="p-4 font-medium">Motivo</th>
                <th className="p-4 font-medium">Última inspección</th>
                <th className="p-4 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.colmena.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="p-4">
                    <button
                      type="button"
                      onClick={() => navegar("colmenas", { detalle: fila.colmena.id })}
                      className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                    >
                      {fila.colmena.codigo}
                    </button>
                  </td>
                  <td className="p-4">{nombreApiario(fila.colmena.apiario_id)}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {fila.requiereRevision && (
                        <Insignia tono="rojo" icono={AlertTriangle}>
                          Quedó en «Requiere revisión»
                        </Insignia>
                      )}
                      {fila.nunca ? (
                        <Insignia tono="ambar" icono={CalendarX2}>
                          Nunca inspeccionada
                        </Insignia>
                      ) : (
                        fila.sinRevision && (
                          <Insignia tono="ambar" icono={Clock}>
                            {plural(fila.dias, "día", "días")} sin inspección
                          </Insignia>
                        )
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    {fila.nunca ? (
                      <span className="text-slate-500">Sin inspecciones</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{formatearFecha(fila.fechaUltima)}</span>
                        {fila.ultima && <InsigniaDe mapa={ESTADO_GENERAL_TODOS} valor={fila.ultima.estado_general} />}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <Boton
                      variante="secundario"
                      tamano="sm"
                      icono={ClipboardPlus}
                      aria-label={`Registrar inspección de ${fila.colmena.codigo}`}
                      onClick={() => navegar("inspecciones", { nuevaPara: fila.colmena.id })}
                    >
                      Inspeccionar
                    </Boton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
