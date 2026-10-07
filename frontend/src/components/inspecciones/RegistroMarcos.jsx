import { useId } from "react";
import { ArrowRight, X } from "lucide-react";
import Boton from "../ui/Boton";
import { Seleccion } from "../ui/Campo";
import SelectorColmena from "../colmenas/SelectorColmena";
import { CONTENIDO_MARCO, opciones } from "../../utils/etiquetas";
import { contarMarcos, marcosATransferir, tieneMarco } from "../../utils/marcos";

const OPCIONES_CONTENIDO = opciones(CONTENIDO_MARCO);

// Registro unitario de los 10 marcos de una caja (cámara de cría o alza).
// Cada marco puede marcarse para transferirlo a otra colmena.
export default function RegistroMarcos({ titulo, caja, onCambiar, colmenaId, error }) {
  const idTitulo = useId();
  const transferidos = marcosATransferir(caja).length;
  const presentes = contarMarcos(caja);
  const sinRegistrar = caja.filter((marco) => marco.contenido === "").length;

  const cambiarMarco = (numero, cambios) => {
    onCambiar(
      caja.map((marco) => {
        if (marco.numero !== numero) return marco;
        const nuevo = { ...marco, ...cambios };
        // Un espacio sin marco no se puede transferir.
        return tieneMarco(nuevo) ? nuevo : { ...nuevo, transferir: false, destino: "" };
      })
    );
  };

  const completarFaltantes = (contenido) => {
    if (!contenido) return;
    onCambiar(caja.map((marco) => (marco.contenido === "" ? { ...marco, contenido } : marco)));
  };

  return (
    <section aria-labelledby={idTitulo} className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={idTitulo} className="font-semibold text-slate-900">
            {titulo}
          </h3>
          <p className="text-sm text-slate-500">
            {sinRegistrar === caja.length
              ? "Sin registrar"
              : `${presentes} ${presentes === 1 ? "marco" : "marcos"}${transferidos > 0 ? `, ${transferidos} para transferir` : ""}`}
          </p>
        </div>
        {sinRegistrar > 0 && (
          <Seleccion
            aria-label={`Completar los marcos sin registrar de ${titulo}`}
            value=""
            onChange={(evento) => completarFaltantes(evento.target.value)}
            placeholder={sinRegistrar === 1 ? "Completar el que falta con…" : `Completar los ${sinRegistrar} que faltan con…`}
            opciones={OPCIONES_CONTENIDO}
            className="w-full sm:w-80"
          />
        )}
      </div>

      <ol className="grid gap-x-6 gap-y-2 lg:grid-cols-2">
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
              />
              {marco.transferir ? (
                <span className="w-[6.5rem]" />
              ) : (
                <Boton
                  variante="secundario"
                  tamano="sm"
                  className="w-[6.5rem]"
                  disabled={!tieneMarco(marco)}
                  title={tieneMarco(marco) ? undefined : "Primero indica el contenido del marco"}
                  aria-label={`Transferir el marco ${marco.numero} de ${titulo}`}
                  onClick={() => cambiarMarco(marco.numero, { transferir: true })}
                >
                  Transferir
                </Boton>
              )}
            </div>

            {marco.transferir && (
              <div className="grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 rounded-xl bg-amber-50 py-1.5 pr-1.5">
                <span className="flex items-center justify-end gap-1 text-sm text-amber-900">
                  <ArrowRight size={15} aria-hidden="true" />
                  Hacia
                </span>
                <SelectorColmena
                  aria-label={`Colmena de destino del marco ${marco.numero} de ${titulo}`}
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
