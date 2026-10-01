import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada, Seleccion } from "../ui/Campo";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { ESTADO_COLMENA, opciones } from "../../utils/etiquetas";
import { hoyISO } from "../../utils/formato";
import { textoONulo } from "../../utils/validacion";

export default function FormularioColmena({ colmena, apiarioInicial, onGuardar, onCerrar }) {
  const esEdicion = Boolean(colmena?.id);
  const idFormulario = useId();
  const { datos } = useDatos();

  const formulario = useFormulario({
    apiario_id: String(colmena?.apiario_id ?? apiarioInicial ?? ""),
    codigo: colmena?.codigo ?? "",
    estado: colmena?.estado ?? "ACTIVA",
    fecha_instalacion: colmena?.fecha_instalacion ?? "",
    observaciones: colmena?.observaciones ?? "",
  });
  const { valores, cambiar, errores } = formulario;

  const validar = (v) => {
    const codigo = v.codigo.trim();
    const duplicada = datos.colmenas.some(
      (otra) => otra.id !== colmena?.id && otra.codigo.toLowerCase() === codigo.toLowerCase()
    );
    return {
      apiario_id: !v.apiario_id && "Selecciona el apiario donde está la colmena.",
      codigo: !codigo
        ? "Ingresa el código de la colmena."
        : codigo.length > 50
          ? "El código no puede superar los 50 caracteres."
          : duplicada && "Ya existe una colmena con ese código.",
      fecha_instalacion: v.fecha_instalacion > hoyISO() && "La fecha de instalación no puede ser futura.",
    };
  };

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) =>
      onGuardar({
        apiario_id: Number(v.apiario_id),
        codigo: v.codigo.trim().toUpperCase(),
        estado: v.estado,
        fecha_instalacion: v.fecha_instalacion || null,
        observaciones: textoONulo(v.observaciones),
      })
    );
  };

  return (
    <Modal
      titulo={esEdicion ? `Editar colmena ${colmena.codigo}` : "Nueva colmena"}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Registrar colmena"}
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}

        <Seleccion
          etiqueta="Apiario"
          requerido
          value={valores.apiario_id}
          onChange={(e) => cambiar("apiario_id", e.target.value)}
          error={errores.apiario_id}
          placeholder="Selecciona un apiario"
          opciones={datos.apiarios.map((a) => ({ valor: a.id, texto: a.nombre }))}
        />

        <Entrada
          etiqueta="Código"
          requerido
          value={valores.codigo}
          onChange={(e) => cambiar("codigo", e.target.value)}
          error={errores.codigo}
          ayuda="Identificador único, por ejemplo COL-004."
          maxLength={50}
          autoCapitalize="characters"
          autoFocus={!esEdicion}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Seleccion
            etiqueta="Estado"
            value={valores.estado}
            onChange={(e) => cambiar("estado", e.target.value)}
            opciones={opciones(ESTADO_COLMENA, ["BAJA"])}
          />
          <Entrada
            etiqueta="Fecha de instalación"
            type="date"
            max={hoyISO()}
            value={valores.fecha_instalacion}
            onChange={(e) => cambiar("fecha_instalacion", e.target.value)}
            error={errores.fecha_instalacion}
          />
        </div>

        <AreaTexto
          etiqueta="Observaciones"
          value={valores.observaciones}
          onChange={(e) => cambiar("observaciones", e.target.value)}
        />
      </form>
    </Modal>
  );
}
