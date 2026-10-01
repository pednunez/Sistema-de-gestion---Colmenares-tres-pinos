import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada, Segmentado } from "../ui/Campo";
import SelectorColmena from "../colmenas/SelectorColmena";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { ESTADO_GENERAL, NIVEL, opciones } from "../../utils/etiquetas";
import { textoONulo } from "../../utils/validacion";

const OPCIONES_SI_NO = [
  { valor: true, texto: "Sí" },
  { valor: false, texto: "No" },
  { valor: null, texto: "No revisado" },
];

const OPCIONES_NIVEL = [...opciones(NIVEL), { valor: null, texto: "No revisado" }];

// Pensado para usarse en terreno desde el celular: botones grandes y pocos campos de texto.
export default function FormularioInspeccion({ inspeccion, colmenaInicial, onGuardar, onCerrar }) {
  const esEdicion = Boolean(inspeccion?.id);
  const idFormulario = useId();
  const { codigoColmena } = useDatos();

  const formulario = useFormulario({
    colmena_id: String(inspeccion?.colmena_id ?? colmenaInicial ?? ""),
    estado_general: inspeccion?.estado_general ?? null,
    reina_observada: inspeccion?.reina_observada ?? null,
    presencia_cria: inspeccion?.presencia_cria ?? null,
    nivel_poblacion: inspeccion?.nivel_poblacion ?? null,
    reservas_alimento: inspeccion?.reservas_alimento ?? null,
    signos_enfermedad: inspeccion?.signos_enfermedad ?? false,
    enfermedad_observada: inspeccion?.enfermedad_observada ?? "",
    observaciones: inspeccion?.observaciones ?? "",
  });
  const { valores, cambiar, errores } = formulario;

  const validar = (v) => ({
    colmena_id: !v.colmena_id && "Selecciona la colmena inspeccionada.",
    estado_general: !v.estado_general && "Indica el estado general de la colmena.",
    enfermedad_observada:
      v.signos_enfermedad && !v.enfermedad_observada.trim() && "Describe brevemente lo que observaste.",
  });

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) =>
      onGuardar({
        colmena_id: Number(v.colmena_id),
        estado_general: v.estado_general,
        reina_observada: v.reina_observada,
        presencia_cria: v.presencia_cria,
        nivel_poblacion: v.nivel_poblacion,
        reservas_alimento: v.reservas_alimento,
        signos_enfermedad: v.signos_enfermedad,
        enfermedad_observada: v.signos_enfermedad ? textoONulo(v.enfermedad_observada) : null,
        observaciones: textoONulo(v.observaciones),
      })
    );
  };

  return (
    <Modal
      titulo={esEdicion ? "Editar inspección" : "Registrar inspección"}
      descripcion={esEdicion ? `Colmena ${codigoColmena(inspeccion.colmena_id)}` : undefined}
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Registrar inspección"}
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-5">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}

        {!esEdicion && (
          <SelectorColmena
            etiqueta="Colmena"
            requerido
            valor={valores.colmena_id}
            onCambiar={(valor) => cambiar("colmena_id", valor)}
            error={errores.colmena_id}
          />
        )}

        <Segmentado
          etiqueta="Estado general"
          requerido
          opciones={opciones(ESTADO_GENERAL)}
          valor={valores.estado_general}
          onCambiar={(valor) => cambiar("estado_general", valor)}
          error={errores.estado_general}
        />

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

        <AreaTexto
          etiqueta="Observaciones"
          value={valores.observaciones}
          onChange={(e) => cambiar("observaciones", e.target.value)}
        />
      </form>
    </Modal>
  );
}
