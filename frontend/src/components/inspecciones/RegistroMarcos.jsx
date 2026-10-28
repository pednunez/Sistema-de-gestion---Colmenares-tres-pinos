import { useId } from "react";
import { ArrowRight, Boxes, Warehouse, X } from "lucide-react";
import Boton from "../ui/Boton";
import { Seleccion } from "../ui/Campo";
import SelectorColmena from "../colmenas/SelectorColmena";
import { CONTENIDO_MARCO, opciones, texto } from "../../utils/etiquetas";
import {
  DESTINO_BODEGA,
  ajustarAccion,
  contarMarcos,
  marcosARetirar,
  marcosATransferir,
  puedeRetirarse,
  puedeTransferirse,
} from "../../utils/marcos";

const OPCIONES_CONTENIDO = opciones(CONTENIDO_MARCO);

// Motivo por el que un marco no tiene acción disponible.
function motivoSinAccion(marco) {
  if (marco.contenido === "") return "Primero indica el contenido del marco";
  return "No hay marco en esta posición";
}

// Registro unitario de los 10 marcos de una caja (cámara de cría o alza).
// Cualquier marco se puede transferir a otra colmena del mismo apiario (`apiarioId`); los de cera o miel también
// pueden ir a «Bodega (Stock)». `retiroDisponible` indica si el servidor ya suma
// esos marcos al stock; si no, se muestra un aviso.
export default function RegistroMarcos({
  titulo,
  caja,
  onCambiar,
  colmenaId,
  apiarioId,
  error,
  retiroDisponible = false,
}) {
  const idTitulo = useId();
  const transferidos = marcosATransferir(caja).length;
  const retirados = marcosARetirar(caja).length;
  const presentes = contarMarcos(caja);
  const sinRegistrar = caja.filter((marco) => marco.contenido === "").length;

  const cambiarMarco = (numero, cambios) => {
    onCambiar(
      caja.map((marco) => {
        if (marco.numero !== numero) return marco;
        // Si cambia el contenido, se quita la acción que ya no corresponde.
        return ajustarAccion({ ...marco, ...cambios });
      })
    );
  };

  const completarFaltantes = (contenido) => {
    if (!contenido) return;
    onCambiar(caja.map((marco) => (marco.contenido === "" ? { ...marco, contenido } : marco)));
  };

  return (
    <section
      aria-labelledby={idTitulo}
      data-invalido={error ? "true" : undefined}
      className={`rounded-2xl border p-4 ${error ? "border-red-400 bg-red-50/40" : "border-slate-200"}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={idTitulo} className="font-semibold text-slate-900">
            {titulo}
          </h3>
          <p className="text-sm text-slate-500">
            {sinRegistrar === caja.length
              ? "Sin registrar"
              : [
                  `${presentes} ${presentes === 1 ? "marco" : "marcos"}`,
                  transferidos > 0 && `${transferidos} para transferir`,
                  retirados > 0 && `${retirados} a bodega`,
                ]
                  .filter(Boolean)
                  .join(", ")}
          </p>
        </div>
        {sinRegistrar > 0 && (
          <Seleccion
            aria-label={`Completar los marcos sin registrar de ${titulo}`}
            value=""
            onChange={(evento) => completarFaltantes(evento.target.value)}
            placeholder={
              sinRegistrar === 1 ? "Completar el que falta con…" : `Completar los ${sinRegistrar} que faltan con…`
            }
            opciones={OPCIONES_CONTENIDO}
            className="w-full sm:w-80"
          />
        )}
      </div>

      {/* En pantallas anchas, del 1 al 5 a la izquierda y del 6 al 10 a la derecha. */}
      <ol className="grid gap-x-6 gap-y-2 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-[repeat(5,auto)]">
        {caja.map((marco) => (
          <li key={marco.numero} className="grid content-start gap-2 border-t border-slate-100 pt-2">
            <div className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2">
              <span className="text-sm font-medium text-slate-700">Marco {marco.numero}</span>
              <Seleccion
                aria-label={`Contenido del marco ${marco.numero} de ${titulo}`}
                value={marco.contenido}
                onChange={(evento) => cambiarMarco(marco.numero, { contenido: evento.target.value })}
                placeholder="Sin registrar"
                opciones={OPCIONES_CONTENIDO}
                error={Boolean(error) && marco.contenido === ""}
              />
              <AccionMarco marco={marco} titulo={titulo} onCambiar={(cambios) => cambiarMarco(marco.numero, cambios)} />
            </div>

            {marco.transferir && (
              <DestinoMarco
                marco={marco}
                titulo={titulo}
                colmenaId={colmenaId}
                apiarioId={apiarioId}
                error={error}
                retiroDisponible={retiroDisponible}
                onCambiar={(cambios) => cambiarMarco(marco.numero, cambios)}
              />
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

// Franja «Hacia» de un marco que se transfiere. Los marcos con cría solo eligen
// colmena; los de cera o miel eligen primero «Colmena» o «Bodega» (uno u otro).
function DestinoMarco({ marco, titulo, colmenaId, apiarioId, error, retiroDisponible, onCambiar }) {
  const conBodega = puedeRetirarse(marco);
  const aBodega = marco.destino === DESTINO_BODEGA;

  const selector = (
    <SelectorColmena
      aria-label={`Colmena de destino del marco ${marco.numero} de ${titulo}`}
      error={Boolean(error) && !marco.destino}
      valor={marco.destino}
      excluir={colmenaId}
      apiarioId={apiarioId}
      onCambiar={(valor) => onCambiar({ destino: valor })}
    />
  );
  const quitar = (
    <Boton
      variante="fantasma"
      tamano="icono"
      icono={X}
      aria-label={`No transferir el marco ${marco.numero} de ${titulo}`}
      title="No transferir"
      onClick={() => onCambiar({ transferir: false, destino: "" })}
    />
  );
  const hacia = (
    <span className="flex items-center justify-end gap-1 text-sm text-amber-900">
      <ArrowRight size={15} aria-hidden="true" />
      Hacia
    </span>
  );

  if (!conBodega) {
    return (
      <div className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 rounded-xl bg-amber-50 py-1.5 pr-1.5">
        {hacia}
        {selector}
        {quitar}
      </div>
    );
  }

  const opcion = (activa, Icono, textoOpcion, cambios) => (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      onClick={() => onCambiar(cambios)}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        activa ? "bg-amber-400 text-slate-950 shadow-sm" : "text-slate-700 hover:bg-white"
      }`}
    >
      <Icono size={15} aria-hidden="true" />
      {textoOpcion}
    </button>
  );

  return (
    <div className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 rounded-xl bg-amber-50 py-1.5 pr-1.5">
      {hacia}
      <div
        role="radiogroup"
        aria-label={`Destino del marco ${marco.numero} de ${titulo}`}
        className="grid grid-cols-2 gap-1 rounded-xl border border-amber-200 bg-amber-100/60 p-1"
      >
        {opcion(!aBodega, Boxes, "Colmena", { destino: aBodega ? "" : marco.destino })}
        {opcion(aBodega, Warehouse, "Bodega", { destino: DESTINO_BODEGA })}
      </div>
      {quitar}
      <span />
      {aBodega ? (
        <p className="flex items-start gap-1 text-xs text-amber-800">
          <Warehouse size={13} className="mt-px shrink-0" aria-hidden="true" />
          <span>
            Entra al stock como «{texto(CONTENIDO_MARCO, marco.contenido)}».
            {!retiroDisponible && " El servidor todavía no lo suma: regístralo también en Stock."}
          </span>
        </p>
      ) : (
        selector
      )}
      <span />
    </div>
  );
}

// Botón «Transferir» de cada marco: se habilita cuando la posición tiene marco.
function AccionMarco({ marco, titulo, onCambiar }) {
  if (marco.transferir) return <span className="w-[6.5rem]" />;

  const transferible = puedeTransferirse(marco);
  return (
    <Boton
      variante="secundario"
      tamano="sm"
      className="w-[6.5rem]"
      disabled={!transferible}
      title={transferible ? undefined : motivoSinAccion(marco)}
      aria-label={`Transferir el marco ${marco.numero} de ${titulo}`}
      onClick={() => onCambiar({ transferir: true })}
    >
      Transferir
    </Boton>
  );
}
