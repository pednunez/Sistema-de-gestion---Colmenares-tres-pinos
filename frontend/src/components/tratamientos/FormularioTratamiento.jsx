import { useId, useMemo } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada, Seleccion } from "../ui/Campo";
import SelectorColmena from "../colmenas/SelectorColmena";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { ESTADO_GENERAL, ESTADO_TRATAMIENTO, opciones, texto } from "../../utils/etiquetas";
import { formatearFecha, hoyISO, humanizar } from "../../utils/formato";
import { textoONulo } from "../../utils/validacion";

export default function FormularioTratamiento({ tratamiento, colmenaInicial, onGuardar, onCerrar }) {
  const esEdicion = Boolean(tratamiento?.id);
  const idFormulario = useId();
  const idSugerencias = useId();
  const { datos, codigoColmena } = useDatos();

  const formulario = useFormulario({
    colmena_id: String(tratamiento?.colmena_id ?? colmenaInicial ?? ""),
    inspeccion_id: String(tratamiento?.inspeccion_id ?? ""),
    tipo_tratamiento: tratamiento ? humanizar(tratamiento.tipo_tratamiento) : "",
    producto: tratamiento?.producto ?? "",
    dosis: tratamiento?.dosis ?? "",
    motivo: tratamiento?.motivo ?? "",
    fecha_inicio: tratamiento?.fecha_inicio ?? hoyISO(),
    fecha_fin: tratamiento?.fecha_fin ?? "",
    estado: tratamiento?.estado ?? "EN_CURSO",
    observaciones: tratamiento?.observaciones ?? "",
  });
  const { valores, cambiar, errores } = formulario;

  const inspeccionesDeColmena = useMemo(
    () => datos.inspecciones.filter((i) => String(i.colmena_id) === valores.colmena_id).slice(0, 10),
    [datos.inspecciones, valores.colmena_id]
  );

  const tiposUsados = useMemo(
    () => [...new Set(datos.tratamientos.map((t) => humanizar(t.tipo_tratamiento)))].sort(),
    [datos.tratamientos]
  );

  const validar = (v) => ({
    colmena_id: !v.colmena_id && "Selecciona la colmena tratada.",
    tipo_tratamiento:
      v.tipo_tratamiento.trim().length < 2
        ? "Indica el tipo de tratamiento."
        : v.tipo_tratamiento.trim().length > 100 && "Máximo 100 caracteres.",
    fecha_inicio: !v.fecha_inicio && "Indica cuándo comenzó el tratamiento.",
    fecha_fin: v.fecha_fin && v.fecha_fin < v.fecha_inicio && "La fecha de término no puede ser anterior al inicio.",
  });

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar(validar, (v) => {
      const comunes = {
        tipo_tratamiento: v.tipo_tratamiento.trim(),
        producto: textoONulo(v.producto),
        dosis: textoONulo(v.dosis),
        motivo: textoONulo(v.motivo),
        fecha_fin: v.fecha_fin || null,
        estado: v.estado,
        observaciones: textoONulo(v.observaciones),
      };
      // Al editar, el backend no permite cambiar colmena, inspección ni fecha de inicio.
      return onGuardar(
        esEdicion
          ? comunes
          : {
              ...comunes,
              colmena_id: Number(v.colmena_id),
              inspeccion_id: v.inspeccion_id ? Number(v.inspeccion_id) : null,
              fecha_inicio: v.fecha_inicio,
            }
      );
    });
  };

  return (
    <Modal
      titulo={esEdicion ? "Editar tratamiento" : "Registrar tratamiento"}
      descripcion={esEdicion ? `Colmena ${codigoColmena(tratamiento.colmena_id)}` : undefined}
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            {esEdicion ? "Guardar cambios" : "Registrar tratamiento"}
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}

        {!esEdicion && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectorColmena
              etiqueta="Colmena"
              requerido
              valor={valores.colmena_id}
              onCambiar={(valor) => {
                cambiar("colmena_id", valor);
                cambiar("inspeccion_id", "");
              }}
              error={errores.colmena_id}
            />
            <Seleccion
              etiqueta="Inspección asociada"
              value={valores.inspeccion_id}
              onChange={(e) => cambiar("inspeccion_id", e.target.value)}
              disabled={!valores.colmena_id || inspeccionesDeColmena.length === 0}
              placeholder={inspeccionesDeColmena.length === 0 ? "Sin inspecciones" : "Ninguna"}
              ayuda="Opcional: la inspección que motivó el tratamiento."
              opciones={inspeccionesDeColmena.map((i) => ({
                valor: String(i.id),
                texto: `${formatearFecha(i.fecha_inspeccion)} · ${texto(ESTADO_GENERAL, i.estado_general, "Sin estado")}`,
              }))}
            />
          </div>
        )}

        <Entrada
          etiqueta="Tipo de tratamiento"
          requerido
          value={valores.tipo_tratamiento}
          onChange={(e) => cambiar("tipo_tratamiento", e.target.value)}
          error={errores.tipo_tratamiento}
          list={idSugerencias}
          placeholder="Por ejemplo: Control de varroa"
          maxLength={100}
        />
        <datalist id={idSugerencias}>
          {tiposUsados.map((tipo) => (
            <option key={tipo} value={tipo} />
          ))}
        </datalist>

        <div className="grid gap-4 sm:grid-cols-2">
          <Entrada etiqueta="Producto" value={valores.producto} onChange={(e) => cambiar("producto", e.target.value)} maxLength={150} />
          <Entrada etiqueta="Dosis" value={valores.dosis} onChange={(e) => cambiar("dosis", e.target.value)} maxLength={100} />
          <Entrada
            etiqueta="Fecha de inicio"
            type="date"
            requerido
            disabled={esEdicion}
            value={valores.fecha_inicio}
            onChange={(e) => cambiar("fecha_inicio", e.target.value)}
            error={errores.fecha_inicio}
          />
          <Entrada
            etiqueta="Fecha de término"
            type="date"
            min={valores.fecha_inicio}
            value={valores.fecha_fin}
            onChange={(e) => cambiar("fecha_fin", e.target.value)}
            error={errores.fecha_fin}
          />
        </div>

        <Seleccion
          etiqueta="Estado"
          value={valores.estado}
          onChange={(e) => cambiar("estado", e.target.value)}
          opciones={opciones(ESTADO_TRATAMIENTO, esEdicion ? [] : ["CANCELADO"])}
        />
        <AreaTexto etiqueta="Motivo" rows={2} value={valores.motivo} onChange={(e) => cambiar("motivo", e.target.value)} />
        <AreaTexto etiqueta="Observaciones" rows={2} value={valores.observaciones} onChange={(e) => cambiar("observaciones", e.target.value)} />
      </form>
    </Modal>
  );
}
