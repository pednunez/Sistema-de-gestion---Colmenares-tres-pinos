import { CheckCircle2 } from "lucide-react";
import Boton from "../ui/Boton";
import { Panel } from "../ui/Estructura";
import { cantidadCon } from "../../utils/stock";

// Material dañado y en reparación, con sus acciones. "onAccion" recibe el
// valor inicial del formulario de movimiento (tipo, material y origen).
export default function PanelReparaciones({ items, puedeEditar, onAccion }) {
  const accion = (texto, inicial, etiqueta, variante = "secundario") =>
    puedeEditar && (
      <Boton variante={variante} tamano="sm" aria-label={etiqueta} onClick={() => onAccion(inicial)}>
        {texto}
      </Boton>
    );

  return (
    <Panel titulo="Dañado y en reparación" descripcion="El material dañado se lleva a reparar; si no tiene arreglo, va a merma.">
      <div id="reparaciones" className="scroll-mt-24" />
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-slate-600">
          <CheckCircle2 className="text-emerald-500" aria-hidden="true" />
          No hay material dañado ni en reparación.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-4 font-medium">Material</th>
                <th className="p-4 font-medium">Dañado (por reparar)</th>
                <th className="p-4 font-medium">En reparación</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const nombre = (item.textoDanado ?? item.texto).toLowerCase();
                return (
                  <tr key={item.material} className="border-b border-slate-100 last:border-0">
                    <td className="p-4 font-medium">{item.textoDanado ?? item.texto}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={item.danado > 0 ? "min-w-20 font-semibold text-red-600" : "min-w-20 text-slate-400"}>
                          {cantidadCon(item.danado, item)}
                        </span>
                        {item.danado > 0 && (
                          <>
                            {accion("A reparación", { tipo: "ENVIO_REPARACION", material: item.material }, `Llevar a reparación ${nombre}`)}
                            {accion("Merma", { tipo: "DESCARTE", material: item.material, estado_origen: "DANADO" }, `Merma de ${nombre} dañados`, "fantasma")}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={item.enReparacion > 0 ? "min-w-20 font-semibold text-amber-700" : "min-w-20 text-slate-400"}>
                          {cantidadCon(item.enReparacion, item)}
                        </span>
                        {item.enReparacion > 0 && (
                          <>
                            {accion("Reparado", { tipo: "REPARACION", material: item.material }, `Marcar reparados ${nombre}`)}
                            {accion("Merma", { tipo: "DESCARTE", material: item.material, estado_origen: "EN_REPARACION" }, `Merma de ${nombre} en reparación`, "fantasma")}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
