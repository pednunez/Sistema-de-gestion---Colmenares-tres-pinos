import { useId } from "react";
import { ArrowRight, Warehouse, X } from "lucide-react";
import Boton from "../ui/Boton";
import { Seleccion } from "../ui/Campo";
import SelectorColmena from "../colmenas/SelectorColmena";
import { CONTENIDO_MARCO, opciones, texto } from "../../utils/etiquetas";
import {
  SIN_MARCO,
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
  if (marco.contenido === SIN_MARCO) return "No hay marco en esta posición";
  return "Solo se transfieren marcos con cría";
}

// Registro unitario de los 10 marcos de una caja (cámara de cría o alza).
// El contenido decide la acción: los marcos con cría se pueden transferir a otra
// colmena y los de cera o miel se pueden retirar a bodega (si `retiroDisponible`).
export default function RegistroMarcos({ titulo, caja, onCambiar, colmenaId, error, retiroDisponible = false }) {
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
              <AccionMarco
                marco={marco}
                titulo={titulo}
                retiroDisponible={retiroDisponible}
                onCambiar={(cambios) => cambiarMarco(marco.numero, cambios)}
              />
            </div>

            {marco.transferir && (
              <div className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 rounded-xl bg-amber-50 py-1.5 pr-1.5">
                <span className="flex items-center justify-end gap-1 text-sm text-amber-900">
                  <ArrowRight size={15} aria-hidden="true" />
                  Hacia
                </span>
                <SelectorColmena
                  aria-label={`Colmena de destino del marco ${marco.numero} de ${titulo}`}
                  error={Boolean(error) && !marco.destino}
                  valor={marco.destino}
                  excluir={colmenaId}
                  onCambiar={(valor) => cambiarMarco(marco.numero, { destino: valor })}
                />
                <Boton
                  variante="fantasma"
                  tamano="icono"
                  icono={X}
                  aria-label={`No transferir el marco ${marco.numero} de ${titulo}`}
                  title="No transferir"
                  onClick={() => cambiarMarco(marco.numero, { transferir: false, destino: "" })}
                />
              </div>
            )}

            {marco.retirar && (
              <div className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 rounded-xl bg-sky-50 py-1.5 pr-1.5">
                <span className="flex items-center justify-end gap-1 text-sm text-sky-900">
                  <Warehouse size={15} aria-hidden="true" />
                  Bodega
                </span>
                <p className="text-sm text-sky-900">
                  Se retira y entra al stock como «{texto(CONTENIDO_MARCO, marco.contenido)}».
                </p>
                <Boton
                  variante="fantasma"
                  tamano="icono"
                  icono={X}
                  aria-label={`No retirar el marco ${marco.numero} de ${titulo}`}
                  title="No retirar"
                  onClick={() => cambiarMarco(marco.numero, { retirar: false })}
                />
              </div>
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

// Botón de la derecha de cada marco: Transferir, A bodega o deshabilitado.
function AccionMarco({ marco, titulo, retiroDisponible, onCambiar }) {
  if (marco.transferir || marco.retirar) return <span className="w-[6.5rem]" />;

  if (retiroDisponible && puedeRetirarse(marco)) {
    return (
      <Boton
        variante="secundario"
        tamano="sm"
        className="w-[6.5rem]"
        aria-label={`Retirar a bodega el marco ${marco.numero} de ${titulo}`}
        onClick={() => onCambiar({ retirar: true })}
      >
        A bodega
      </Boton>
    );
  }

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
