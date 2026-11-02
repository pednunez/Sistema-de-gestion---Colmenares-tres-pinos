import { useState } from "react";
import { Pill, Plus } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import { InsigniaDe } from "../ui/Insignia";
import { Dato } from "../ui/Estructura";
import ImagenQr from "./ImagenQr";
import HistorialColmena from "./HistorialColmena";
import DetalleInspeccion from "../inspecciones/DetalleInspeccion";
import { useConsulta } from "../../hooks/useConsulta";
import { useDatos } from "../../hooks/useDatos";
import { useNavegacion } from "../../hooks/useNavegacion";
import { historialService } from "../../services/historialService";
import { ESTADO_COLMENA, ESTADO_GENERAL_TODOS } from "../../utils/etiquetas";
import { formatearFecha } from "../../utils/formato";
import { ultimaInspeccionPorColmena } from "../../utils/alertas";

// Ficha de la colmena con su historial completo (RF-43, RF-44, RF-48; PB-12).
export default function DetalleColmena({ colmenaId, onCerrar }) {
  const { indices, datos, nombreApiario } = useDatos();
  const { navegar } = useNavegacion();
  const colmena = indices.colmenas.get(colmenaId);
  const historial = useConsulta(() => historialService.deColmena(colmenaId), [colmenaId]);
  // Inspección abierta desde el historial: se muestra en lugar de la ficha y al
  // cerrarla se vuelve a la colmena.
  const [inspeccionAbierta, setInspeccionAbierta] = useState(null);

  if (!colmena) {
    return (
      <Modal titulo="Colmena no disponible" onCerrar={onCerrar}>
        <p className="text-slate-600">Esta colmena fue dada de baja o ya no existe.</p>
      </Modal>
    );
  }

  if (inspeccionAbierta) {
    return (
      <DetalleInspeccion
        inspeccion={inspeccionAbierta}
        puedeEditar={false}
        onCerrar={() => setInspeccionAbierta(null)}
      />
    );
  }

  const ultima = ultimaInspeccionPorColmena(datos.inspecciones).get(colmena.id);

  return (
    <Modal
      titulo={`Colmena ${colmena.codigo}`}
      descripcion={nombreApiario(colmena.apiario_id)}
      onCerrar={onCerrar}
      ancho="sm:max-w-3xl"
      pie={
        <>
          <Boton variante="secundario" icono={Pill} onClick={() => navegar("tratamientos", { nuevoPara: colmena.id })}>
            Registrar tratamiento
          </Boton>
          <Boton icono={Plus} onClick={() => navegar("inspecciones", { nuevaPara: colmena.id })}>
            Registrar inspección
          </Boton>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <dl className="grid content-start gap-4 sm:grid-cols-2">
          <Dato nombre="Estado">
            <InsigniaDe mapa={ESTADO_COLMENA} valor={colmena.estado} />
          </Dato>
          <Dato nombre="Instalación">{formatearFecha(colmena.fecha_instalacion)}</Dato>
          <Dato nombre="Última inspección">
            {ultima ? (
              <span className="flex flex-wrap items-center gap-2">
                {formatearFecha(ultima.fecha_inspeccion)}
                <InsigniaDe mapa={ESTADO_GENERAL_TODOS} valor={ultima.estado_general} />
              </span>
            ) : (
              "Sin inspecciones"
            )}
          </Dato>
          <Dato nombre="Observaciones">{colmena.observaciones || "Sin observaciones"}</Dato>
        </dl>
        <div className="justify-self-center">
          <ImagenQr colmena={colmena} className="w-40" conDescarga />
        </div>
      </div>

      <HistorialColmena colmenaId={colmena.id} consulta={historial} onVerInspeccion={setInspeccionAbierta} />
    </Modal>
  );
}
