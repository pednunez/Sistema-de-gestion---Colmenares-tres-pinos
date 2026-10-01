import { useId } from "react";

export const claseControl =
  "w-full min-h-11 rounded-xl border bg-white px-3 py-2 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 disabled:bg-slate-100 disabled:text-slate-500";

function Envoltura({ id, etiqueta, error, ayuda, requerido, className = "", children }) {
  return (
    <div className={`grid content-start gap-1.5 ${className}`}>
      {etiqueta && (
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {etiqueta}
          {requerido && (
            <span className="text-red-600" aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
      )}
      {children}
      {(error || ayuda) && (
        <p id={`${id}-ayuda`} className={`text-sm ${error ? "text-red-600" : "text-slate-500"}`}>
          {error || ayuda}
        </p>
      )}
    </div>
  );
}

function atributosControl(id, error, ayuda) {
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": error || ayuda ? `${id}-ayuda` : undefined,
    className: `${claseControl} ${error ? "border-red-400" : "border-slate-300"}`,
  };
}

export function Entrada({ etiqueta, error, ayuda, requerido, className, ...props }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido} className={className}>
      <input {...atributosControl(id, error, ayuda)} required={requerido} {...props} />
    </Envoltura>
  );
}

export function AreaTexto({ etiqueta, error, ayuda, requerido, className, rows = 3, ...props }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido} className={className}>
      <textarea rows={rows} {...atributosControl(id, error, ayuda)} {...props} />
    </Envoltura>
  );
}

// Acepta una lista de opciones [{ valor, texto }] o elementos <option>/<optgroup> como hijos.
export function Seleccion({ etiqueta, error, ayuda, requerido, className, opciones, placeholder, children, ...props }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda} requerido={requerido} className={className}>
      <select {...atributosControl(id, error, ayuda)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {opciones?.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
        {children}
      </select>
    </Envoltura>
  );
}

// Botones grandes para elegir una opción: más fáciles de tocar en terreno que un select.
export function Segmentado({ etiqueta, opciones, valor, onCambiar, error, requerido, className = "" }) {
  const id = useId();
  return (
    <div className={`grid content-start gap-1.5 ${className}`}>
      <span id={`${id}-etiqueta`} className="text-sm font-medium text-slate-800">
        {etiqueta}
        {requerido && (
          <span className="text-red-600" aria-hidden="true">
            {" "}*
          </span>
        )}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-etiqueta`} className="flex flex-wrap gap-2">
        {opciones.map((opcion) => {
          const activo = valor === opcion.valor;
          return (
            <button
              key={String(opcion.valor)}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => onCambiar(opcion.valor)}
              className={`min-h-11 min-w-[5.5rem] flex-1 rounded-xl border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                activo
                  ? "border-amber-400 bg-amber-50 text-slate-950 ring-2 ring-amber-400/40"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opcion.texto}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
