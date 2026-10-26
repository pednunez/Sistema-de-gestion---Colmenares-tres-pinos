import { useId } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { AreaTexto, Entrada, Seleccion, Segmentado } from "../ui/Campo";
import { useFormulario } from "../../hooks/useFormulario";
import { useDatos } from "../../hooks/useDatos";
import { MATERIAL_STOCK, ORIGEN_MERMA, TIPO_MOVIMIENTO_STOCK, opciones } from "../../utils/etiquetas";
import {
  MAXIMO_POR_MOVIMIENTO,
  estadoQueDescuenta,
  materialesPara,
  movimientoParaEnviar,
  stockResultante,
  textoExistencia,
  validarMovimiento,
} from "../../utils/stock";
import { colmenaOperativa } from "../../utils/alertas";

// Registra un movimiento de la bodega. "inicial" permite abrirlo con el tipo,
// el material y el origen de la merma ya elegidos.
export default function FormularioMovimiento({ inventario, inicial = {}, onGuardar, onCerrar }) {
  const idFormulario = useId();
  const { datos } = useDatos();
  const formulario = useFormulario({
    tipo: inicial.tipo ?? "INGRESO",
    material: inicial.material ?? "",
    estado_origen: inicial.estado_origen ?? "",
    cantidad: "",
    apiario_id: "",
    colmena_id: "",
    observaciones: "",
  });
  const { valores, cambiar, errores } = formulario;

  const cambiarTipo = (tipo) => {
    cambiar("tipo", tipo);
    // Si el material elegido no aplica al nuevo tipo, se limpia.
    if (valores.material && !materialesPara(tipo).some((m) => m.valor === valores.material)) cambiar("material", "");
  };

  const cambiarApiario = (id) => {
    cambiar("apiario_id", id);
    cambiar("colmena_id", "");
  };

  const item = inventario.items.find((i) => i.material === valores.material);
  const estado = estadoQueDescuenta(valores.tipo, valores.estado_origen);
  const resultado = stockResultante(item, valores.tipo, valores.cantidad, valores.estado_origen);
  const esSalida = valores.tipo === "ENVIO";
  const esMerma = valores.tipo === "DESCARTE";
  const colmenasDelApiario = datos.colmenas.filter(
    (c) => colmenaOperativa(c) && String(c.apiario_id) === valores.apiario_id
  );

  let ayudaCantidad;
  if (item) {
    const actual = `Hay ${textoExistencia(item, estado ?? "disponible")}.`;
    const valido = resultado && Object.values(resultado).every((n) => n >= 0);
    const despues = !valido
      ? ""
      : item.puedeDanarse
        ? ` Después: ${resultado.disponible} disponibles, ${resultado.danado} por reparar, ${resultado.enReparacion} en reparación.`
        : ` Después: ${resultado.disponible} disponibles.`;
    ayudaCantidad = actual + despues;
  }

  const enviar = (evento) => {
    evento.preventDefault();
    formulario.enviar((v) => validarMovimiento(v, inventario), (v) => onGuardar(movimientoParaEnviar(v)));
  };

  return (
    <Modal
      titulo="Registrar movimiento de stock"
      descripcion={TIPO_MOVIMIENTO_STOCK[valores.tipo]?.ayuda}
      onCerrar={onCerrar}
      ancho="sm:max-w-3xl"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" form={idFormulario} cargando={formulario.enviando}>
            Registrar movimiento
          </Boton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
        {formulario.errorGeneral && <Alerta>{formulario.errorGeneral}</Alerta>}

        <Segmentado
          etiqueta="Tipo de movimiento"
          requerido
          opciones={opciones(TIPO_MOVIMIENTO_STOCK)}
          valor={valores.tipo}
          onCambiar={cambiarTipo}
          error={errores.tipo}
        />

        {esMerma && (
          <Segmentado
            etiqueta="La merma sale de"
            requerido
            opciones={opciones(ORIGEN_MERMA)}
            valor={valores.estado_origen}
            onCambiar={(origen) => cambiar("estado_origen", origen)}
            error={errores.estado_origen}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Seleccion
            etiqueta="Material"
            requerido
            value={valores.material}
            onChange={(e) => cambiar("material", e.target.value)}
            error={errores.material}
            placeholder="Selecciona el material"
            opciones={materialesPara(valores.tipo)}
          />
          <Entrada
            etiqueta="Cantidad"
            requerido
            type="number"
            inputMode="numeric"
            min={1}
            max={MAXIMO_POR_MOVIMIENTO}
            step={1}
            value={valores.cantidad}
            onChange={(e) => cambiar("cantidad", e.target.value)}
            error={errores.cantidad}
            ayuda={ayudaCantidad}
          />
        </div>

        {valores.tipo === "DANO" && item && !MATERIAL_STOCK[item.material].puedeDanarse && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Los marcos con cera rotos se suman a los marcos rotos.
          </p>
        )}

        {esSalida && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Seleccion
              etiqueta="Apiario (opcional)"
              value={valores.apiario_id}
              onChange={(e) => cambiarApiario(e.target.value)}
              placeholder="Sin indicar"
              opciones={datos.apiarios.map((a) => ({ valor: a.id, texto: a.nombre }))}
              ayuda="Solo para saber a dónde fue el material."
            />
            <Seleccion
              etiqueta="Colmena (opcional)"
              value={valores.colmena_id}
              onChange={(e) => cambiar("colmena_id", e.target.value)}
              disabled={!valores.apiario_id}
              placeholder={valores.apiario_id ? "Sin indicar" : "Elige primero el apiario"}
              opciones={colmenasDelApiario.map((c) => ({ valor: c.id, texto: c.codigo }))}
            />
          </div>
        )}

        <AreaTexto
          etiqueta="Observaciones"
          value={valores.observaciones}
          onChange={(e) => cambiar("observaciones", e.target.value)}
          error={errores.observaciones}
          maxLength={500}
          placeholder="Por ejemplo: compra a proveedor, colmena nueva, se rompió al cosechar..."
        />
      </form>
    </Modal>
  );
}
