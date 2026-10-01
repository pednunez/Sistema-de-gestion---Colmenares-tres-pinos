import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// En celular se abre como hoja desde abajo; en escritorio, centrado.
export default function Modal({ titulo, descripcion, onCerrar, pie, ancho = "sm:max-w-lg", children }) {
  const idTitulo = useId();
  const panel = useRef(null);
  const cerrarRef = useRef(onCerrar);

  useEffect(() => {
    cerrarRef.current = onCerrar;
  });

  useEffect(() => {
    const enfocadoAntes = document.activeElement;
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();

    const alPresionar = (evento) => {
      if (evento.key === "Escape") cerrarRef.current?.();
    };
    document.addEventListener("keydown", alPresionar);

    return () => {
      document.body.style.overflow = overflowAntes;
      document.removeEventListener("keydown", alPresionar);
      enfocadoAntes?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4 print:hidden"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) cerrarRef.current?.();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl ${ancho}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="text-lg font-semibold text-slate-900">
              {titulo}
            </h2>
            {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={() => cerrarRef.current?.()}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">{children}</div>

        {pie && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end">
            {pie}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
