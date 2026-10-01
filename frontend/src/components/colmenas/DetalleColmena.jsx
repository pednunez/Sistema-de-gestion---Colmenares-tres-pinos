import { ArrowRightLeft, ClipboardCheck, History, Pill, Plus } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import { InsigniaDe } from "../ui/Insignia";
import { Cargando, ErrorCarga } from "../ui/Estados";
import { Dato } from "../ui/Estructura";
import ImagenQr from "./ImagenQr";
import { useConsulta } from "../../hooks/useConsulta";
import { useDatos } from "../../hooks/useDatos";
import { useNavegacion } from "../../hooks/useNavegacion";
import { historialService } from "../../services/historialService";
import { ESTADO_COLMENA, ESTADO_GENERAL } from "../../utils/etiquetas";
import { formatearFecha, formatearFechaHora, humanizar } from "../../utils/formato";
import { ultimaInspeccionPorColmena } from "../../utils/alertas";

function iconoEvento(tipo = "") {
  const valor = tipo.toUpperCase();
  if (valor.includes("INSPEC")) return ClipboardCheck;
  if (valor.includes("TRAT")) return Pill;
  if (valor.includes("TRANSF")) return ArrowRightLeft;
  return History;
}

// Ficha de la colmena con su historial completo (RF-43, RF-44, RF-48).
export default function DetalleColmena({ colmenaId, onCerrar }) {
  const { indices, datos, nombreApiario } = useDatos();
  const { navegar } = useNavegacion();
  const colmena = indices.colmenas.get(colmenaId);
  const historial = useConsulta(() => historialService.deColmena(colmenaId), [colmenaId]);

  if (!colmena) {
    return (
      <Modal titulo="Colmena no disponible" onCerrar={onCerrar}>
        <p className="text-slate-600">Esta colmena fue dada de baja o ya no existe.</p>
      </Modal>
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
                <InsigniaDe mapa={ESTADO_GENERAL} valor={ultima.estado_general} />
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

      <h3 className="mb-3 mt-8 font-semibold text-slate-900">Historial</h3>
      {historial.cargando && <Cargando texto="Cargando historial..." />}
      {historial.error && <ErrorCarga mensaje={historial.error} onReintentar={historial.recargar} />}
      {historial.datos?.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Esta colmena todavía no tiene actividad registrada.
        </p>
      )}
      {historial.datos?.length > 0 && (
        <ol className="relative ml-3 border-l border-slate-200">
          {historial.datos.map((evento) => {
            const Icono = iconoEvento(evento.tipo_evento);
            return (
              <li key={`${evento.tipo_evento}-${evento.evento_id}`} className="mb-5 ml-6">
                <span className="absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-4 ring-white">
                  <Icono size={14} aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-slate-900">{humanizar(evento.tipo_evento)}</p>
                <p className="text-xs text-slate-500">{formatearFechaHora(evento.fecha)}</p>
                {evento.detalle && <p className="mt-1 text-sm text-slate-600">{humanizar(evento.detalle)}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
