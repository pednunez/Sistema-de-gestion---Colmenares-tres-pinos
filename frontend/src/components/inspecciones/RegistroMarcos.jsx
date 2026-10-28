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
  MARCOS_POR_CAJA,
  puedeRetirarse,
  puedeTransferirse,
  vaAColmena,
} from "../../utils/marcos";
import { CARGANDO, CON_DATOS, PISO_ALZA, PISO_CAMARA, claveMarco, destinoDelDesplazado } from "../../utils/capacidad";
import { useDatos } from "../../hooks/useDatos";

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
  ubicacion,
  plan,
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
                ubicacion={ubicacion}
                plan={plan}
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
function DestinoMarco({ marco, titulo, colmenaId, apiarioId, ubicacion, plan, error, retiroDisponible, onCambiar }) {
  const conBodega = puedeRetirarse(marco);
  const aBodega = marco.destino === DESTINO_BODEGA;
  const capacidad = vaAColmena(marco) && (
    <>
      <span />
      <CapacidadDestino
        marco={marco}
        titulo={titulo}
        ubicacion={ubicacion}
        colmenaId={colmenaId}
        info={plan?.get(claveMarco(ubicacion, marco.numero))}
        error={error}
        onCambiar={onCambiar}
      />
      <span />
    </>
  );

  const selector = (
    <SelectorColmena
      aria-label={`Colmena de destino del marco ${marco.numero} de ${titulo}`}
      error={Boolean(error) && !marco.destino}
      valor={marco.destino}
      excluir={colmenaId}
      apiarioId={apiarioId}
      // Otra colmena de destino: el piso y el marco que sale se eligen de nuevo.
      onCambiar={(valor) => onCambiar({ destino: valor, pisoDestino: PISO_CAMARA, desplazado: "" })}
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
        {capacidad}
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
      {capacidad}
    </div>
  );
}

// Debajo del selector: cuántos marcos tiene el piso de la colmena que recibe y,
// si está lleno, qué marco sale de ella (a bodega o de vuelta, según su contenido).
function CapacidadDestino({ marco, titulo, ubicacion, colmenaId, info, error, onCambiar }) {
  const { codigoColmena } = useDatos();
  const destino = codigoColmena(Number(marco.destino));
  const nota = "text-xs text-slate-600";

  if (!info || info.estado === CARGANDO) return <p className={nota}>Revisando cuántos marcos tiene {destino}…</p>;
  if (info.estado !== CON_DATOS) {
    return (
      <p className={nota}>No se pudo revisar cuántos marcos tiene {destino}: el servidor todavía no lo informa.</p>
    );
  }

  const nombrePiso = info.piso === PISO_ALZA ? "Alza" : "Cámara de cría";
  const elegido = info.posiciones.find((p) => String(p.numero) === String(marco.desplazado));
  const pisoOrigen = ubicacion === PISO_ALZA ? "del alza" : "de la cámara de cría";

  return (
    <div className="grid gap-1.5">
      {info.tieneAlza && (
        <div
          role="radiogroup"
          aria-label={`Piso de ${destino} que recibe el marco ${marco.numero} de ${titulo}`}
          className="flex flex-wrap items-center gap-1 text-xs"
        >
          <span className="text-slate-600">Va a:</span>
          {[
            [PISO_CAMARA, "Cámara de cría"],
            [PISO_ALZA, "Alza"],
          ].map(([valor, textoPiso]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={info.piso === valor}
              onClick={() => onCambiar({ pisoDestino: valor, desplazado: "" })}
              className={`rounded-lg border px-2 py-1 font-medium ${
                info.piso === valor
                  ? "border-amber-400 bg-amber-100 text-slate-950"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {textoPiso}
            </button>
          ))}
        </div>
      )}
      <p className={info.requiereDesplazado ? "text-xs font-medium text-amber-900" : nota}>
        {nombrePiso} de {destino}: {info.ocupados} de {MARCOS_POR_CAJA} marcos.
        {!info.requiereDesplazado
          ? " Hay espacio."
          : info.ocupados >= MARCOS_POR_CAJA
            ? ` Está llena: elige qué marco sale de ${destino}.`
            : ` El espacio que queda lo usa otro marco de esta inspección: elige qué marco sale de ${destino}.`}
      </p>
      {info.requiereDesplazado && (
        <>
          <Seleccion
            aria-label={`Marco que sale de ${destino} para recibir el marco ${marco.numero} de ${titulo}`}
            value={marco.desplazado ?? ""}
            onChange={(evento) => onCambiar({ desplazado: evento.target.value })}
            placeholder={`Marco que sale de ${destino}`}
            error={Boolean(error) && !marco.desplazado}
            opciones={info.posiciones.map((p) => ({
              valor: String(p.numero),
              texto: `Marco ${p.numero} · ${texto(CONTENIDO_MARCO, p.contenido)}`,
            }))}
          />
          {elegido && (
            <p className="text-xs text-amber-800">
              {destinoDelDesplazado(elegido.contenido) === "BODEGA"
                ? `El marco ${elegido.numero} de ${destino} se retira a bodega.`
                : `Intercambio: el marco ${elegido.numero} de ${destino} vuelve a ${codigoColmena(Number(colmenaId))}, al marco ${marco.numero} ${pisoOrigen}.`}
            </p>
          )}
        </>
      )}
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
