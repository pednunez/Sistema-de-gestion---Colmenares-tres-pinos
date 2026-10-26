import { useId, useMemo, useRef } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import { AreaTexto, Entrada, Segmentado } from "../ui/Campo";
import SelectorApiarioColmena from "../colmenas/SelectorApiarioColmena";
import RegistroMarcos from "./RegistroMarcos";
import TratamientosEnCurso from "./TratamientosEnCurso";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { ESTADO_GENERAL, ESTADO_GENERAL_ANTERIOR, NIVEL, NIVEL_MIEL, opciones, texto } from "../../utils/etiquetas";
import { textoONulo } from "../../utils/validacion";
import {
  crearCaja,
  detalleMarcos,
  marcosATransferir,
  planDeTransferencias,
  totalMarcos,
  validarCaja,
} from "../../utils/marcos";

const OPCIONES_SI_NO = [
  { valor: true, texto: "Sí" },
  { valor: false, texto: "No" },
  { valor: null, texto: "No revisado" },
];

const OPCIONES_NIVEL = [...opciones(NIVEL), { valor: null, texto: "No revisado" }];

// Tiras de medicamento aplicadas cuando hay signos de enfermedad.
const OPCIONES_TIRAS = [
  { valor: 1, texto: "1" },
  { valor: 2, texto: "2" },
  { valor: 3, texto: "3" },
  { valor: null, texto: "No se aplicaron" },
];

// Nombre de cada campo para el resumen de errores al pie del formulario.
const NOMBRES_CAMPO = {
  apiario_id: "Apiario",
  colmena_id: "Colmena",
  estado_general: "Estado de la colmena",
  enfermedad_observada: "Qué se observó",
  alimentacion_suministrada: "Alimentación suministrada",
  camara: "Cámara de cría",
  alza: "Alza",
};

const LARGO_MAXIMO_MIEL = 50;
const LARGO_MAXIMO_ALIMENTACION = 500;

// Si una inspección antigua guardó otro texto en "miel", se agrega como opción
// para no perderlo al editar.
function opcionesMiel(valorActual) {
  const base = [...opciones(NIVEL_MIEL), { valor: null, texto: "No revisado" }];
  if (valorActual && !NIVEL_MIEL[valorActual]) return [{ valor: valorActual, texto: valorActual }, ...base];
  return base;
}

// Al registrar una inspección se revisan los marcos uno por uno. Las transferencias
// marcadas en esa revisión se guardan junto con la inspección.
export default function FormularioInspeccion({ inspeccion, colmenaInicial, onGuardar, onCerrar }) {
  const esEdicion = Boolean(inspeccion?.id);
  const idFormulario = useId();
  const { datos, indices, codigoColmena } = useDatos();
  const refFormulario = useRef(null);
  const colmenaPrevia = indices.colmenas.get(Number(inspeccion?.colmena_id ?? colmenaInicial));

  const formulario = useFormulario({
    apiario_id: String(colmenaPrevia?.apiario_id ?? ""),
    colmena_id: String(inspeccion?.colmena_id ?? colmenaInicial ?? ""),
    // Tratamientos en curso que se finalizan al guardar la inspección.
    finalizar: [],
    // Una inspección con la escala anterior obliga a elegir el estado nuevo al editarla.
    estado_general: inspeccion?.estado_general in ESTADO_GENERAL ? inspeccion.estado_general : null,
    reina_observada: inspeccion?.reina_observada ?? null,
    presencia_cria: inspeccion?.presencia_cria ?? null,
    nivel_poblacion: inspeccion?.nivel_poblacion ?? null,
    reservas_alimento: inspeccion?.reservas_alimento ?? null,
    postura: inspeccion?.postura ?? null,
    miel: inspeccion?.miel ?? null,
    alimentacion_suministrada: inspeccion?.alimentacion_suministrada ?? "",
    signos_enfermedad: inspeccion?.signos_enfermedad ?? false,
    enfermedad_observada: inspeccion?.enfermedad_observada ?? "",
    tiras_medicamento: inspeccion?.tiras_medicamento ?? null,
    observaciones: inspeccion?.observaciones ?? "",
    camara: crearCaja(),
    tieneAlza: false,
    alza: crearCaja(),
  });
  const { valores, cambiar, errores } = formulario;

  const tratamientosEnCurso = useMemo(
    () => datos.tratamientos.filter((t) => String(t.colmena_id) === String(valores.colmena_id) && t.estado === "EN_CURSO"),
    [datos.tratamientos, valores.colmena_id]
  );
  // Los apicultores rotan entre apiarios: quien inspecciona puede finalizar el
  // tratamiento aunque lo haya registrado otra persona (decisión del Product Owner, 26-10).
  const puedeFinalizar = () => true;

  const cambiarApiario = (id) => {
    cambiar("apiario_id", id);
    cambiar("colmena_id", "");
    cambiar("finalizar", []);
  };

  const cambiarColmena = (id) => {
    cambiar("colmena_id", id);
    cambiar("finalizar", []);
  };

  const validar = (v) => ({
    apiario_id: !esEdicion && !v.apiario_id && "Selecciona el apiario.",
    colmena_id: !v.colmena_id && "Selecciona la colmena inspeccionada.",
    estado_general: !v.estado_general && "Indica el estado de la colmena.",
    enfermedad_observada:
      v.signos_enfermedad && !v.enfermedad_observada.trim() && "Describe brevemente lo que observaste.",
    alimentacion_suministrada:
      v.alimentacion_suministrada.trim().length > LARGO_MAXIMO_ALIMENTACION &&
      `Máximo ${LARGO_MAXIMO_ALIMENTACION} caracteres.`,
    camara: !esEdicion && validarCaja(v.camara, "de la cámara de cría", v.colmena_id, { obligatoria: v.tieneAlza }),
    alza: !esEdicion && v.tieneAlza && validarCaja(v.alza, "del alza", v.colmena_id, { obligatoria: true }),
  });

  // Lleva la vista al primer campo marcado en rojo para que el usuario vea qué falta.
  const mostrarPrimerError = () =>
    requestAnimationFrame(() => {
      const campo = refFormulario.current?.querySelector('[data-invalido="true"], [aria-invalid="true"]');
      campo?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    });

  const enviar = async (evento) => {
    evento.preventDefault();
    const guardado = await formulario.enviar(validar, (v) => {
      const datos = {
        colmena_id: Number(v.colmena_id),
        estado_general: v.estado_general,
        reina_observada: v.reina_observada,
        presencia_cria: v.presencia_cria,
        nivel_poblacion: v.nivel_poblacion,
        reservas_alimento: v.reservas_alimento,
        postura: v.postura,
        miel: v.miel ? String(v.miel).slice(0, LARGO_MAXIMO_MIEL) : null,
        alimentacion_suministrada: textoONulo(v.alimentacion_suministrada),
        signos_enfermedad: v.signos_enfermedad,
        enfermedad_observada: v.signos_enfermedad ? textoONulo(v.enfermedad_observada) : null,
        tiras_medicamento: v.signos_enfermedad ? v.tiras_medicamento : null,
        observaciones: textoONulo(v.observaciones),
      };
      if (esEdicion) return onGuardar(datos, [], v.finalizar);

      return onGuardar(
        {
          ...datos,
          cantidad_marcos: totalMarcos(v),
          tiene_alza: v.tieneAlza,
          marcos: detalleMarcos(v),
        },
        planDeTransferencias(v, v.colmena_id),
        v.finalizar
      );
    });
    if (!guardado) mostrarPrimerError();
  };

  const camposConError = Object.keys(errores).filter((campo) => errores[campo]);

  const cantidadTransferencias =
    marcosATransferir(valores.camara).length + (valores.tieneAlza ? marcosATransferir(valores.alza).length : 0);
  const marcosRegistrados = totalMarcos(valores);

  return (
    <Modal
      titulo={esEdicion ? "Editar inspección" : "Registrar inspección"}
      descripcion={esEdicion ? `Colmena ${codigoColmena(inspeccion.colmena_id)}` : undefined}
      onCerrar={onCerrar}
      ancho={esEdicion ? "sm:max-w-2xl" : "sm:max-w-4xl"}
      pie={
        <>
          {/* El aviso de error queda al pie, siempre visible junto a los botones. */}
          {(formulario.errorGeneral || camposConError.length > 0) && (
            <div role="alert" className="text-sm text-red-700 sm:mr-auto sm:max-w-md sm:self-center">
              {formulario.errorGeneral && <p className="font-medium">{formulario.errorGeneral}</p>}
              {camposConError.length > 0 && (
                <p>
                  Revisa lo marcado en rojo:{" "}
                  {camposConError.map((campo) => NOMBRES_CAMPO[campo] ?? campo).join(", ")}.
                </p>
              )}
            </div>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Registrar inspección"}
          </Boton>
        </>
      }
    >
      <form ref={refFormulario} id={idFormulario} onSubmit={enviar} noValidate className="grid gap-5">
        {!esEdicion && (
          <SelectorApiarioColmena
            apiarioId={valores.apiario_id}
            colmenaId={valores.colmena_id}
            onCambiarApiario={cambiarApiario}
            onCambiarColmena={cambiarColmena}
            errores={errores}
          />
        )}

        <TratamientosEnCurso
          tratamientos={tratamientosEnCurso}
          seleccionados={valores.finalizar}
          onCambiar={(ids) => cambiar("finalizar", ids)}
          puedeFinalizar={puedeFinalizar}
        />

        <div className="grid gap-1.5">
          <Segmentado
            etiqueta="Estado de la colmena"
            requerido
            opciones={opciones(ESTADO_GENERAL)}
            valor={valores.estado_general}
            onCambiar={(valor) => cambiar("estado_general", valor)}
            error={errores.estado_general}
          />
          {inspeccion?.estado_general in ESTADO_GENERAL_ANTERIOR && (
            <p className="text-sm text-slate-500">
              Esta inspección tenía el estado «{texto(ESTADO_GENERAL_ANTERIOR, inspeccion.estado_general)}». Elige el estado actual.
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Segmentado
            etiqueta="¿Se observó la reina?"
            opciones={OPCIONES_SI_NO}
            valor={valores.reina_observada}
            onCambiar={(valor) => cambiar("reina_observada", valor)}
          />
          <Segmentado
            etiqueta="¿Hay cría?"
            opciones={OPCIONES_SI_NO}
            valor={valores.presencia_cria}
            onCambiar={(valor) => cambiar("presencia_cria", valor)}
          />
          <Segmentado
            etiqueta="¿Hay postura?"
            opciones={OPCIONES_SI_NO}
            valor={valores.postura}
            onCambiar={(valor) => cambiar("postura", valor)}
          />
          <Segmentado
            etiqueta="Miel"
            opciones={opcionesMiel(inspeccion?.miel)}
            valor={valores.miel}
            onCambiar={(valor) => cambiar("miel", valor)}
          />
          <Segmentado
            etiqueta="Población"
            opciones={OPCIONES_NIVEL}
            valor={valores.nivel_poblacion}
            onCambiar={(valor) => cambiar("nivel_poblacion", valor)}
          />
          <Segmentado
            etiqueta="Reservas de alimento"
            opciones={OPCIONES_NIVEL}
            valor={valores.reservas_alimento}
            onCambiar={(valor) => cambiar("reservas_alimento", valor)}
          />
        </div>

        <Entrada
          etiqueta="Alimentación suministrada"
          value={valores.alimentacion_suministrada}
          onChange={(e) => cambiar("alimentacion_suministrada", e.target.value)}
          error={errores.alimentacion_suministrada}
          ayuda={errores.alimentacion_suministrada ? undefined : "Déjalo vacío si no se alimentó la colmena."}
          placeholder="Por ejemplo: jarabe 1:1, 2 litros"
          maxLength={LARGO_MAXIMO_ALIMENTACION}
        />

        <Segmentado
          etiqueta="¿Hay signos de enfermedad?"
          opciones={OPCIONES_SI_NO.slice(0, 2)}
          valor={valores.signos_enfermedad}
          onCambiar={(valor) => cambiar("signos_enfermedad", valor)}
        />

        {valores.signos_enfermedad && (
          <Entrada
            etiqueta="¿Qué se observó?"
            requerido
            value={valores.enfermedad_observada}
            onChange={(e) => cambiar("enfermedad_observada", e.target.value)}
            error={errores.enfermedad_observada}
            placeholder="Por ejemplo: varroa visible en zánganos"
          />
        )}

        {valores.signos_enfermedad && (
          <Segmentado
            etiqueta="Tiras de medicamento aplicadas"
            opciones={OPCIONES_TIRAS}
            valor={valores.tiras_medicamento}
            onCambiar={(valor) => cambiar("tiras_medicamento", valor)}
          />
        )}

        {!esEdicion && (
          <div className="grid gap-4">
            <div>
              <h3 className="font-semibold text-slate-900">Revisión de marcos</h3>
              <p className="text-sm text-slate-500">
                Indica qué contiene cada marco. Si mueves un marco a otra colmena, márcalo con «Transferir»: la
                transferencia se guarda sola al registrar la inspección.
              </p>
            </div>

            <RegistroMarcos
              titulo="Cámara de cría"
              caja={valores.camara}
              onCambiar={(caja) => cambiar("camara", caja)}
              colmenaId={valores.colmena_id}
              error={errores.camara}
            />

            <Segmentado
              etiqueta="¿La colmena tiene alza?"
              opciones={OPCIONES_SI_NO.slice(0, 2)}
              valor={valores.tieneAlza}
              onCambiar={(valor) => cambiar("tieneAlza", valor)}
              className="sm:max-w-xs"
            />

            {valores.tieneAlza && (
              <RegistroMarcos
                titulo="Alza"
                caja={valores.alza}
                onCambiar={(caja) => cambiar("alza", caja)}
                colmenaId={valores.colmena_id}
                error={errores.alza}
              />
            )}

            {marcosRegistrados !== null && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700" role="status">
                Se registrarán{" "}
                <strong>
                  {marcosRegistrados} {marcosRegistrados === 1 ? "marco" : "marcos"}
                </strong>{" "}
                en la colmena
                {cantidadTransferencias > 0 && (
                  <>
                    {" "}y{" "}
                    <strong>
                      {cantidadTransferencias} {cantidadTransferencias === 1 ? "transferencia" : "transferencias"}
                    </strong>{" "}
                    hacia otras colmenas
                  </>
                )}
                .
              </p>
            )}
          </div>
        )}

        <AreaTexto
          etiqueta="Observaciones"
          value={valores.observaciones}
          onChange={(e) => cambiar("observaciones", e.target.value)}
        />
      </form>
    </Modal>
  );
}
