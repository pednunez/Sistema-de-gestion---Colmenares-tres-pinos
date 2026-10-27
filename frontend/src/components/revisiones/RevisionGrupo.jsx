import { useId, useState } from "react";
import { CheckCircle2, ClipboardCheck, SkipForward } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import Confirmar from "../ui/Confirmar";
import Insignia, { InsigniaDe } from "../ui/Insignia";
import { AreaTexto } from "../ui/Campo";
import { Cargando, ErrorCarga } from "../ui/Estados";
import FormularioInspeccion from "../inspecciones/FormularioInspeccion";
import { useAuth } from "../../hooks/useAuth";
import { useAvisos } from "../../hooks/useAvisos";
import { useConsulta } from "../../hooks/useConsulta";
import { useDatos } from "../../hooks/useDatos";
import { useGuardarInspeccion } from "../../hooks/useGuardarInspeccion";
import { revisionesService } from "../../services/revisionesService";
import { ESTADO_GENERAL_TODOS } from "../../utils/etiquetas";
import { formatearFechaHora } from "../../utils/formato";

const ESTADO_FILA = {
  PENDIENTE: { texto: "Pendiente", tono: "gris" },
  REVISADA: { texto: "Revisada", tono: "verde" },
  OMITIDA: { texto: "Omitida", tono: "ambar" },
};

const LARGO_MOTIVO = 300;

function Omitir({ colmena, onOmitir, onCerrar }) {
  const idFormulario = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await onOmitir(motivo.trim());
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Omitir ${colmena.codigo}`}
      descripcion="Queda registrada como no revisada en esta sesión."
      onCerrar={onCerrar}
      ancho="sm:max-w-md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Volver
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={enviando}>
            Omitir colmena
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {error && <Alerta>{error}</Alerta>}
        <AreaTexto
          etiqueta="Motivo (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={LARGO_MOTIVO}
          placeholder="Por ejemplo: colmena muy agresiva, lluvia, sin acceso"
          autoFocus
        />
      </form>
    </Modal>
  );
}

// Revisión de un grupo en terreno (PB-18): se inspeccionan sus colmenas en orden,
// una tras otra, y se puede omitir alguna. Se puede finalizar aunque queden pendientes.
export default function RevisionGrupo({ sesionId, onCambio, onCerrar }) {
  const { usuario, esAdmin } = useAuth();
  const { nombreApiario, nombreUsuario } = useDatos();
  const avisos = useAvisos();
  const guardarInspeccion = useGuardarInspeccion();
  const [version, setVersion] = useState(0);
  const [inspeccionando, setInspeccionando] = useState(null);
  const [omitiendo, setOmitiendo] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [pendientes, setPendientes] = useState(null);
  const consulta = useConsulta(() => revisionesService.obtener(sesionId), [sesionId, version]);
  const sesion = consulta.datos;

  const refrescar = () => {
    setVersion((v) => v + 1);
    onCambio?.();
  };

  if (!sesion) {
    return (
      <Modal titulo="Revisión del grupo" onCerrar={onCerrar}>
        {consulta.error ? (
          <ErrorCarga mensaje={consulta.error} onReintentar={consulta.recargar} />
        ) : (
          <Cargando texto="Cargando revisión..." />
        )}
      </Modal>
    );
  }

  const enCurso = sesion.estado === "EN_CURSO";
  // El backend solo deja continuar la revisión a quien la inició o a un administrador.
  const puedeTrabajar = enCurso && (esAdmin || sesion.usuario_id === usuario.id);
  const { total, revisadas, omitidas } = sesion.progreso;
  const avance = total ? Math.round(((revisadas + omitidas) * 100) / total) : 0;
  const siguiente = sesion.colmenas.find((c) => c.colmena_id === sesion.siguiente_colmena_id);

  const guardar = async (valores, cantidadTransferencias, finalizar) => {
    const { codigo, tratamientosFallidos } = await guardarInspeccion({ valores, cantidadTransferencias, finalizar });
    setInspeccionando(null);
    setPendientes(tratamientosFallidos.length > 0 ? { codigo, tratamientos: tratamientosFallidos } : null);
    refrescar();
  };

  const omitir = async (motivo) => {
    await revisionesService.omitir(sesion.id, omitiendo.colmena_id, motivo);
    avisos.exito(`${omitiendo.codigo} omitida.`);
    setOmitiendo(null);
    refrescar();
  };

  const finalizar = async () => {
    await revisionesService.finalizar(sesion.id);
    avisos.exito(`Revisión de ${sesion.grupo_nombre} finalizada.`);
    refrescar();
  };

  return (
    <>
      <Modal
        titulo={`Revisión de ${sesion.grupo_nombre}`}
        descripcion={`${nombreApiario(sesion.apiario_id)} · iniciada ${formatearFechaHora(sesion.fecha_inicio)} por ${nombreUsuario(sesion.usuario_id)}`}
        onCerrar={onCerrar}
        ancho="sm:max-w-3xl"
        pie={
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              {enCurso ? "Seguir después" : "Cerrar"}
            </Boton>
            {puedeTrabajar && (
              <Boton
                variante={siguiente ? "secundario" : "primario"}
                icono={CheckCircle2}
                onClick={() => setFinalizando(true)}
              >
                Finalizar revisión
              </Boton>
            )}
          </>
        }
      >
        <div className="grid gap-5">
          {pendientes && (
            <Alerta
              accion={
                <Boton variante="secundario" tamano="sm" onClick={() => setPendientes(null)}>
                  Entendido
                </Boton>
              }
            >
              La inspección de {pendientes.codigo} quedó guardada, pero no se pudo finalizar:{" "}
              {pendientes.tratamientos.map((t) => `${t.nombre} (${t.mensaje})`).join("; ")}. Puedes finalizarlo desde
              Tratamientos.
            </Alerta>
          )}

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800">
                {revisadas + omitidas} de {total} colmenas
              </span>
              <span className="text-slate-500">
                {revisadas} {revisadas === 1 ? "revisada" : "revisadas"} · {omitidas}{" "}
                {omitidas === 1 ? "omitida" : "omitidas"} · {sesion.progreso.pendientes}{" "}
                {sesion.progreso.pendientes === 1 ? "pendiente" : "pendientes"}
              </span>
            </div>
            <div
              className="mt-2 h-2.5 rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={avance}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Avance de la revisión"
            >
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${avance}%` }} />
            </div>
          </div>

          {!enCurso && (
            <Alerta tipo="info">
              Revisión finalizada el {formatearFechaHora(sesion.fecha_fin)}.
              {sesion.progreso.pendientes > 0 && ` Quedaron ${sesion.progreso.pendientes} colmenas sin revisar.`}
            </Alerta>
          )}
          {enCurso && !puedeTrabajar && (
            <Alerta tipo="info">
              Esta revisión la inició {nombreUsuario(sesion.usuario_id)}. Solo esa persona o un administrador puede
              continuarla.
            </Alerta>
          )}

          {puedeTrabajar && siguiente && (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-amber-900">Siguiente colmena</p>
                <p className="text-2xl font-bold text-slate-900">{siguiente.codigo}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton variante="secundario" icono={SkipForward} onClick={() => setOmitiendo(siguiente)}>
                  Omitir
                </Boton>
                <Boton icono={ClipboardCheck} onClick={() => setInspeccionando(siguiente)}>
                  Inspeccionar {siguiente.codigo}
                </Boton>
              </div>
            </div>
          )}
          {puedeTrabajar && !siguiente && (
            <Alerta tipo="info">
              Todas las colmenas del grupo están revisadas u omitidas. Ya puedes finalizar la revisión.
            </Alerta>
          )}

          <ol className="grid gap-2">
            {sesion.colmenas.map((c) => (
              <li
                key={c.colmena_id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                  c.colmena_id === sesion.siguiente_colmena_id && enCurso ? "border-amber-300" : "border-slate-200"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 text-right text-sm font-semibold text-slate-400">{c.orden}</span>
                  <span className="font-semibold">{c.codigo}</span>
                  <InsigniaDe mapa={ESTADO_FILA} valor={c.estado} />
                  {c.estado_general && <InsigniaDe mapa={ESTADO_GENERAL_TODOS} valor={c.estado_general} />}
                  {c.motivo_omision && <span className="truncate text-sm text-slate-500">{c.motivo_omision}</span>}
                </div>
                {puedeTrabajar && c.estado !== "REVISADA" && c.colmena_id !== sesion.siguiente_colmena_id && (
                  <Boton
                    variante="fantasma"
                    tamano="sm"
                    onClick={() => setInspeccionando(c)}
                    aria-label={`Inspeccionar ${c.codigo}`}
                  >
                    Inspeccionar
                  </Boton>
                )}
              </li>
            ))}
          </ol>

          {Object.keys(sesion.resumen_estados).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Resultado:</span>
              {Object.entries(sesion.resumen_estados).map(([estado, cantidad]) => (
                <Insignia key={estado} tono="gris">
                  {cantidad} · {ESTADO_GENERAL_TODOS[estado]?.texto ?? estado}
                </Insignia>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {inspeccionando && (
        <FormularioInspeccion
          colmenaInicial={inspeccionando.colmena_id}
          sesionRevisionId={sesion.id}
          contexto={`Revisión de ${sesion.grupo_nombre}, colmena ${inspeccionando.orden} de ${total}`}
          onGuardar={guardar}
          onCerrar={() => setInspeccionando(null)}
        />
      )}

      {omitiendo && <Omitir colmena={omitiendo} onOmitir={omitir} onCerrar={() => setOmitiendo(null)} />}

      {finalizando && (
        <Confirmar
          titulo={`¿Finalizar la revisión de ${sesion.grupo_nombre}?`}
          textoConfirmar="Finalizar revisión"
          variante="primario"
          onConfirmar={finalizar}
          onCerrar={() => setFinalizando(false)}
        >
          <p>
            {sesion.progreso.pendientes > 0
              ? `Quedan ${sesion.progreso.pendientes} colmenas sin revisar. Quedarán como pendientes en el historial de esta revisión.`
              : "Todas las colmenas quedaron revisadas u omitidas."}
          </p>
        </Confirmar>
      )}
    </>
  );
}
