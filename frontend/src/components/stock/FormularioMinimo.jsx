import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { Entrada } from "../ui/Campo";
import { useFormulario } from "../../hooks/useFormulario";
import { MAXIMO_POR_MOVIMIENTO, validarMinimo } from "../../utils/stock";

// Cantidad mínima que debe haber en bodega. Vacío = sin mínimo.
export default function FormularioMinimo({ item, onGuardar, onCerrar }) {
  const idFormulario = useId();
  const formulario = useFormulario({ minimo: item.minimo === null ? "" : String(item.minimo) });
  const { valores, cambiar, errores } = formulario;

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(
      (v) => ({ minimo: validarMinimo(v.minimo) }),
      (v) => onGuardar(item.material, v.minimo === "" ? null : Number(v.minimo))
    );
  };

  return (
    <Modal
      titulo={`Mínimo de ${item.texto.toLowerCase()}`}
      descripcion="Cuando el disponible quede bajo este número, se mostrará un aviso de stock bajo."
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            Guardar mínimo
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}
        <Entrada
          etiqueta="Cantidad mínima"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAXIMO_POR_MOVIMIENTO}
          step={1}
          value={valores.minimo}
          onChange={(e) => cambiar("minimo", e.target.value)}
          error={errores.minimo}
          ayuda={`Hoy hay ${item.disponible} disponibles. Déjalo vacío para no usar mínimo.`}
          autoFocus
        />
      </form>
    </Modal>
  );
}
