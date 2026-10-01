import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada } from "../ui/Campo";
import { useFormulario } from "../../hooks/useFormulario";
import { textoONulo } from "../../utils/validacion";

export default function FormularioApiario({ apiario, onGuardar, onCerrar }) {
  const esEdicion = Boolean(apiario?.id);
  const idFormulario = useId();
  const formulario = useFormulario({
    nombre: apiario?.nombre ?? "",
    ubicacion: apiario?.ubicacion ?? "",
    descripcion: apiario?.descripcion ?? "",
  });
  const { valores, cambiar, errores } = formulario;

  const validar = (v) => ({
    nombre:
      v.nombre.trim().length < 2
        ? "Ingresa un nombre de al menos 2 caracteres."
        : v.nombre.trim().length > 100 && "El nombre no puede superar los 100 caracteres.",
  });

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) =>
      onGuardar({
        nombre: v.nombre.trim(),
        ubicacion: textoONulo(v.ubicacion),
        descripcion: textoONulo(v.descripcion),
      })
    );
  };

  return (
    <Modal
      titulo={esEdicion ? `Editar ${apiario.nombre}` : "Nuevo apiario"}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Registrar apiario"}
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}
        <Entrada
          etiqueta="Nombre"
          requerido
          value={valores.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          error={errores.nombre}
          maxLength={100}
          autoFocus={!esEdicion}
        />
        <Entrada
          etiqueta="Ubicación"
          value={valores.ubicacion}
          onChange={(e) => cambiar("ubicacion", e.target.value)}
          ayuda="Sector, comuna o referencia para llegar."
          maxLength={255}
        />
        <AreaTexto
          etiqueta="Descripción"
          value={valores.descripcion}
          onChange={(e) => cambiar("descripcion", e.target.value)}
        />
      </form>
    </Modal>
  );
}
