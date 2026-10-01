import Modal from "../ui/Modal";
import { InsigniaDe } from "../ui/Insignia";
import { useDatos } from "../../hooks/useDatos";
import { ACCION_AUDITORIA, ENTIDAD, texto } from "../../utils/etiquetas";
import { formatearFechaHora } from "../../utils/formato";
import { calcularCambios, nombreCampo, valorLegible } from "../../utils/auditoria";

export default function DetalleAuditoria({ registro, onCerrar }) {
  const buscar = useDatos();
  const cambios = calcularCambios(registro);
  const esCreacion = registro.datos_anteriores === null;

  return (
    <Modal
      titulo={`${texto(ACCION_AUDITORIA, registro.accion)} de ${texto(ENTIDAD, registro.entidad).toLowerCase()}`}
      descripcion={`${formatearFechaHora(registro.fecha)} · ${buscar.nombreUsuario(registro.usuario_id)}`}
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
    >
      <div className="mb-4">
        <InsigniaDe mapa={ACCION_AUDITORIA} valor={registro.accion} />
      </div>

      {cambios.length === 0 ? (
        <p className="text-slate-500">No hay cambios de datos registrados para esta acción.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Campo</th>
                {!esCreacion && <th className="px-4 py-2 font-medium">Antes</th>}
                <th className="px-4 py-2 font-medium">{esCreacion ? "Valor registrado" : "Después"}</th>
              </tr>
            </thead>
            <tbody>
              {cambios.map(({ campo, antes, despues }) => (
                <tr key={campo} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 font-medium text-slate-700">{nombreCampo(campo)}</td>
                  {!esCreacion && <td className="px-4 py-2 text-slate-500 line-through decoration-slate-300">{valorLegible(campo, antes, buscar)}</td>}
                  <td className="px-4 py-2 text-slate-900">{valorLegible(campo, despues, buscar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
