import { ArrowRight, Pencil } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Insignia, { InsigniaDe } from "../ui/Insignia";
import { Dato } from "../ui/Estructura";
import { useDatos } from "../../hooks/useDatos";
import {
  CONTENIDO_MARCO,
  ESTADO_GENERAL_TODOS,
  ESTADO_TRATAMIENTO,
  NIVEL,
  NIVEL_MIEL,
  TIPO_MARCO,
  UBICACION_MARCO,
  siNo,
  texto,
} from "../../utils/etiquetas";
import { formatearFecha, formatearFechaHora } from "../../utils/formato";
import { cajasDeInspeccion, transferenciasDeInspeccion } from "../../utils/inspecciones";

function Seccion({ titulo, children }) {
  return (
    <section className="border-t border-slate-200 pt-5">
      <h3 className="mb-3 font-semibold text-slate-900">{titulo}</h3>
      {children}
    </section>
  );
}

function SinDatos({ children }) {
  return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{children}</p>;
}

// Caja de 10 marcos en dos columnas: 1 a 5 a la izquierda y 6 a 10 a la derecha.
function Caja({ caja, codigoColmena }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{texto(UBICACION_MARCO, caja.ubicacion)}</p>
      <ol className="grid gap-2 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[repeat(5,auto)]">
        {caja.marcos.map((marco) => (
          <li
            key={marco.numero}
            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <span>
              <span className="mr-2 font-semibold text-slate-500">{marco.numero}</span>
              {texto(CONTENIDO_MARCO, marco.contenido, "Sin registrar")}
            </span>
            {marco.transferido_a_colmena_id && (
              <Insignia tono="ambar" icono={ArrowRight}>
                {codigoColmena(marco.transferido_a_colmena_id)}
              </Insignia>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Todo lo registrado en una inspección (PB-10).
export default function DetalleInspeccion({ inspeccion, puedeEditar, onEditar, onCerrar }) {
  const { datos, indices, codigoColmena, nombreApiario, nombreUsuario } = useDatos();
  const colmena = indices.colmenas.get(inspeccion.colmena_id);
  const cajas = cajasDeInspeccion(inspeccion);
  const transferencias = transferenciasDeInspeccion(inspeccion, datos.transferencias);
  const tratamientos = datos.tratamientos.filter((t) => t.inspeccion_id === inspeccion.id);

  return (
    <Modal
      titulo={`Inspección de ${codigoColmena(inspeccion.colmena_id)}`}
      descripcion={[colmena && nombreApiario(colmena.apiario_id), formatearFechaHora(inspeccion.fecha_inspeccion)]
        .filter(Boolean)
        .join(" · ")}
      onCerrar={onCerrar}
      ancho="sm:max-w-3xl"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
          {puedeEditar && (
            <Boton icono={Pencil} onClick={onEditar}>
              Editar inspección
            </Boton>
          )}
        </>
      }
    >
      <div className="grid gap-5">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Dato nombre="Estado de la colmena">
            <InsigniaDe mapa={ESTADO_GENERAL_TODOS} valor={inspeccion.estado_general} porDefecto="Sin estado" />
          </Dato>
          <Dato nombre="Responsable">{nombreUsuario(inspeccion.usuario_id)}</Dato>
          <Dato nombre="Marcos presentes">{inspeccion.cantidad_marcos ?? "Sin registrar"}</Dato>
        </dl>

        <Seccion titulo="Revisión de la colmena">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <Dato nombre="Reina observada">{siNo(inspeccion.reina_observada)}</Dato>
            <Dato nombre="Presencia de cría">{siNo(inspeccion.presencia_cria)}</Dato>
            <Dato nombre="Postura">{siNo(inspeccion.postura)}</Dato>
            <Dato nombre="Miel">{texto(NIVEL_MIEL, inspeccion.miel, "No revisado")}</Dato>
            <Dato nombre="Población">{texto(NIVEL, inspeccion.nivel_poblacion, "No revisado")}</Dato>
            <Dato nombre="Reservas de alimento">{texto(NIVEL, inspeccion.reservas_alimento, "No revisado")}</Dato>
            <Dato nombre="Alimentación suministrada">{inspeccion.alimentacion_suministrada || "No se alimentó"}</Dato>
            <Dato nombre="Alza">{siNo(inspeccion.tiene_alza, cajas.some((c) => c.ubicacion === "ALZA") ? "Sí" : "Sin registrar")}</Dato>
          </dl>
        </Seccion>

        <Seccion titulo="Sanidad">
          {inspeccion.signos_enfermedad ? (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <Dato nombre="Signos de enfermedad">
                <Insignia tono="rojo">Sí</Insignia>
              </Dato>
              <Dato nombre="Enfermedad observada">{inspeccion.enfermedad_observada || "Sin detallar"}</Dato>
              <Dato nombre="Tiras de medicamento">
                {inspeccion.tiras_medicamento == null
                  ? "Sin registrar"
                  : `${inspeccion.tiras_medicamento} ${inspeccion.tiras_medicamento === 1 ? "tira" : "tiras"}`}
              </Dato>
            </dl>
          ) : (
            <p className="text-sm text-slate-600">Sin signos de enfermedad.</p>
          )}
          {tratamientos.length > 0 && (
            <ul className="mt-3 grid gap-2 text-sm">
              {tratamientos.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Tratamiento: {t.producto || t.tipo_tratamiento || `#${t.id}`}</span>
                  <InsigniaDe mapa={ESTADO_TRATAMIENTO} valor={t.estado} />
                  {t.fecha_inicio && <span className="text-slate-500">desde {formatearFecha(t.fecha_inicio)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Seccion>

        <Seccion titulo="Revisión de marcos">
          {cajas.length > 0 ? (
            <div className="grid gap-5">
              {cajas.map((caja) => (
                <Caja key={caja.ubicacion} caja={caja} codigoColmena={codigoColmena} />
              ))}
            </div>
          ) : (
            <SinDatos>Esta inspección no tiene guardado el detalle por marco.</SinDatos>
          )}
        </Seccion>

        <Seccion titulo="Transferencias">
          {transferencias.lista.length > 0 ? (
            <>
              <ul className="grid gap-2 text-sm">
                {transferencias.lista.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <span className="font-semibold">{codigoColmena(t.colmena_origen_id)}</span>
                    <ArrowRight size={16} className="text-amber-500" aria-label="hacia" />
                    <span className="font-semibold">{codigoColmena(t.colmena_destino_id)}</span>
                    <span className="text-slate-600">
                      · {t.cantidad_marcos} {t.cantidad_marcos === 1 ? "marco" : "marcos"} de{" "}
                      {texto(TIPO_MARCO, t.tipo_marco, "tipo sin indicar").toLowerCase()}
                    </span>
                    {t.observaciones && <span className="basis-full text-slate-500">{t.observaciones}</span>}
                  </li>
                ))}
              </ul>
              {transferencias.aproximada && (
                <p className="mt-2 text-xs text-slate-500">
                  Transferencias que salieron de esta colmena el mismo día de la inspección.
                </p>
              )}
            </>
          ) : (
            <SinDatos>No se transfirieron marcos en esta inspección.</SinDatos>
          )}
        </Seccion>

        {inspeccion.observaciones && (
          <Seccion titulo="Observaciones">
            <p className="whitespace-pre-line text-sm text-slate-700">{inspeccion.observaciones}</p>
          </Seccion>
        )}
      </div>
    </Modal>
  );
}
