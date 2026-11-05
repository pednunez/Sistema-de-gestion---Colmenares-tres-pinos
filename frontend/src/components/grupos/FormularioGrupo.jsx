import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada, Seleccion } from "../ui/Campo";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { textoONulo } from "../../utils/validacion";

const LARGO_NOMBRE = 60;
const LARGO_DESCRIPCION = 500;

// Crear o renombrar un grupo. El apiario no se cambia después de crearlo.
export default function FormularioGrupo({ grupo, apiarioInicial, gruposExistentes = [], onGuardar, onCerrar }) {
  const esEdicion = Boolean(grupo?.id);
  const idFormulario = useId();
  const { datos, nombreApiario } = useDatos();
  const formulario = useFormulario({
    apiario_id: String(grupo?.apiario_id ?? apiarioInicial ?? ""),
    nombre: grupo?.nombre ?? "",
    descripcion: grupo?.descripcion ?? "",
  });
  const { valores, cambiar, errores } = formulario;

  const validar = (v) => {
    const nombre = v.nombre.trim().replace(/\s+/g, " ");
    const repetido = gruposExistentes.some(
      (otro) =>
        otro.id !== grupo?.id &&
        String(otro.apiario_id) === String(v.apiario_id) &&
        otro.nombre.toLowerCase() === nombre.toLowerCase()
    );
    return {
      apiario_id: !v.apiario_id && "Selecciona el apiario del grupo.",
      nombre: !nombre
        ? "Ingresa el nombre del grupo."
        : nombre.length > LARGO_NOMBRE
          ? `El nombre no puede superar los ${LARGO_NOMBRE} caracteres.`
          : repetido && "Ya existe un grupo con ese nombre en este apiario.",
      descripcion: v.descripcion.length > LARGO_DESCRIPCION && `Máximo ${LARGO_DESCRIPCION} caracteres.`,
    };
  };

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) => {
      const nombre = v.nombre.trim().replace(/\s+/g, " ");
      const descripcion = textoONulo(v.descripcion);
      return onGuardar(esEdicion ? { nombre, descripcion } : { apiario_id: Number(v.apiario_id), nombre, descripcion });
    });
  };

  return (
    <Modal
      titulo={esEdicion ? `Editar ${grupo.nombre}` : "Nuevo grupo"}
      descripcion={
        esEdicion ? nombreApiario(grupo.apiario_id) : "Agrupa colmenas de un apiario para revisarlas juntas."
      }
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Crear grupo"}
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}
        {!esEdicion && (
          <Seleccion
            etiqueta="Apiario"
            requerido
            value={valores.apiario_id}
            onChange={(e) => cambiar("apiario_id", e.target.value)}
            error={errores.apiario_id}
            placeholder="Selecciona un apiario"
            opciones={datos.apiarios.map((a) => ({
              valor: String(a.id),
              texto: a.nombre,
            }))}
          />
        )}
        <Entrada
          etiqueta="Nombre"
          requerido
          value={valores.nombre}
          onChange={(e) => cambiar("nombre", e.target.value)}
          error={errores.nombre}
          maxLength={LARGO_NOMBRE}
          placeholder="Por ejemplo: Grupo 1, Fila norte"
          autoFocus
        />
        <AreaTexto
          etiqueta="Descripción"
          value={valores.descripcion}
          onChange={(e) => cambiar("descripcion", e.target.value)}
          error={errores.descripcion}
          maxLength={LARGO_DESCRIPCION}
        />
      </form>
    </Modal>
  );
}
