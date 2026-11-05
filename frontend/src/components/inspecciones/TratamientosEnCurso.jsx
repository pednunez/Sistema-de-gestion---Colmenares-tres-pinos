import { Pill } from "lucide-react";
import { formatearFecha, humanizar } from "../../utils/formato";

// Tratamientos en curso de la colmena inspeccionada. Se pueden marcar para
// finalizarlos al guardar la inspección.
export default function TratamientosEnCurso({ tratamientos, seleccionados, onCambiar, puedeFinalizar }) {
  if (tratamientos.length === 0) return null;

  const alternar = (id) =>
    onCambiar(seleccionados.includes(id) ? seleccionados.filter((otro) => otro !== id) : [...seleccionados, id]);

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4" aria-label="Tratamientos en curso">
      <div className="mb-3 flex items-start gap-3">
        <Pill size={20} className="mt-0.5 text-sky-700" aria-hidden="true" />
        <div>
          <h3 className="font-semibold text-slate-900">
            {tratamientos.length === 1 ? "Esta colmena tiene un tratamiento en curso" : `Esta colmena tiene ${tratamientos.length} tratamientos en curso`}
          </h3>
          <p className="text-sm text-slate-600">Si el tratamiento terminó, márcalo para finalizarlo con fecha de hoy al guardar la inspección.</p>
        </div>
      </div>
      <ul className="grid gap-2">
        {tratamientos.map((t) => {
          const permitido = puedeFinalizar(t);
          const marcado = seleccionados.includes(t.id);
          const nombre = [humanizar(t.tipo_tratamiento), t.producto].filter(Boolean).join(" · ");
          return (
            <li key={t.id} className={`rounded-xl border bg-white p-3 ${marcado ? "border-emerald-400" : "border-slate-200"}`}>
              <label className={`flex items-start gap-3 ${permitido ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-emerald-600"
                  checked={marcado}
                  disabled={!permitido}
                  onChange={() => alternar(t.id)}
                  aria-label={`Finalizar ${nombre} en esta inspección`}
                />
                <span className="min-w-0 text-sm">
                  <span className="block font-medium text-slate-900">{nombre}</span>
                  <span className="block text-slate-500">
                    Desde {formatearFecha(t.fecha_inicio)}
                    {t.dosis && ` · Dosis: ${t.dosis}`}
                  </span>
                  <span className={`mt-1 block ${marcado ? "font-medium text-emerald-700" : "text-slate-600"}`}>
                    {!permitido
                      ? "Solo quien lo registró o un administrador puede finalizarlo."
                      : marcado
                        ? "Se finalizará al guardar la inspección."
                        : "Finalizar en esta inspección"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
