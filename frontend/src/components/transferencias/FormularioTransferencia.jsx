import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada, Segmentado } from "../ui/Campo";
import SelectorColmena from "../colmenas/SelectorColmena";
import { useFormulario } from "../../hooks/useFormulario";
import { TIPO_MARCO, opciones } from "../../utils/etiquetas";
import { textoONulo } from "../../utils/validacion";

export default function FormularioTransferencia({ colmenaOrigen, onGuardar, onCerrar }) {
  const idFormulario = useId();
  const formulario = useFormulario({
    colmena_origen_id: String(colmenaOrigen ?? ""),
    colmena_destino_id: "",
    cantidad_marcos: "1",
    tipo_marco: "CRIA",
    motivo: "",
    observaciones: "",
  });
  const { valores, cambiar, errores } = formulario;

  const validar = (v) => {
    const cantidad = Number(v.cantidad_marcos);
    return {
      colmena_origen_id: !v.colmena_origen_id && "Selecciona la colmena de la que salen los marcos.",
      colmena_destino_id: !v.colmena_destino_id
        ? "Selecciona la colmena que recibe los marcos."
        : v.colmena_destino_id === v.colmena_origen_id && "Origen y destino deben ser colmenas distintas.",
      cantidad_marcos: (!Number.isInteger(cantidad) || cantidad < 1) && "Ingresa una cantidad entera mayor a cero.",
      motivo: v.motivo.length > 255 && "Máximo 255 caracteres.",
    };
  };

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) =>
      onGuardar({
        colmena_origen_id: Number(v.colmena_origen_id),
        colmena_destino_id: Number(v.colmena_destino_id),
        cantidad_marcos: Number(v.cantidad_marcos),
        tipo_marco: v.tipo_marco,
        motivo: textoONulo(v.motivo),
        observaciones: textoONulo(v.observaciones),
      })
    );
  };

  return (
    <Modal
      titulo="Registrar transferencia de marcos"
      descripcion="Registra el movimiento que hiciste entre dos colmenas."
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            Registrar transferencia
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-5">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectorColmena
            etiqueta="Colmena de origen"
            requerido
            valor={valores.colmena_origen_id}
            onCambiar={(valor) => cambiar("colmena_origen_id", valor)}
            error={errores.colmena_origen_id}
          />
          <SelectorColmena
            etiqueta="Colmena de destino"
            requerido
            valor={valores.colmena_destino_id}
            excluir={valores.colmena_origen_id}
            onCambiar={(valor) => cambiar("colmena_destino_id", valor)}
            error={errores.colmena_destino_id}
          />
        </div>

        <Entrada
          etiqueta="Cantidad de marcos"
          requerido
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={valores.cantidad_marcos}
          onChange={(e) => cambiar("cantidad_marcos", e.target.value)}
          error={errores.cantidad_marcos}
          className="sm:max-w-xs"
        />

        <Segmentado
          etiqueta="Tipo de marco"
          opciones={opciones(TIPO_MARCO)}
          valor={valores.tipo_marco}
          onCambiar={(valor) => cambiar("tipo_marco", valor)}
        />

        <Entrada
          etiqueta="Motivo"
          value={valores.motivo}
          onChange={(e) => cambiar("motivo", e.target.value)}
          error={errores.motivo}
          placeholder="Por ejemplo: fortalecer colmena débil"
          maxLength={255}
        />
        <AreaTexto etiqueta="Observaciones" rows={2} value={valores.observaciones} onChange={(e) => cambiar("observaciones", e.target.value)} />
      </form>
    </Modal>
  );
}
