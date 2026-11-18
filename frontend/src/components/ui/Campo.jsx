import { useId } from "react";

export const claseControl =
  "w-full min-h-11 rounded-xl border bg-white px-3 py-2 text-bosque-900 outline-none transition placeholder:text-bosque-400 focus:border-miel-400 focus:ring-2 focus:ring-miel-400/40 disabled:bg-bosque-100 disabled:text-bosque-500";

// "error" puede ser un texto (se muestra bajo el campo) o true (solo marca el borde en rojo).
function Envoltura({ id, etiqueta, error, ayuda, requerido, className = "", children }) {
  const mensaje = typeof error === "string" ? error : null;
  return (
    <div className={`grid content-start gap-1.5 ${className}`}>
      {etiqueta && (
        <label htmlFor={id} className="text-sm font-medium text-bosque-800">
          {etiqueta}
          {requerido && (
            <span className="text-red-600" aria-hidden="true">
              {" "}*
            </span>
          )}
        </label>
      )}
      {children}
      {(mensaje || ayuda) && (
        <p id={`${id}-ayuda`} className={`text-sm ${mensaje ? "text-red-600" : "text-bosque-500"}`}>
          {mensaje || ayuda}
        </p>
      )}
    </div>
  );
}

function atributosControl(id, error, ayuda) {
  return {
    id,
    "aria-invalid": Boolean(error),
    "aria-describedby": typeof error === "string" || ayuda ? `${id}-ayuda` : undefined,
    className: `${claseControl} ${error ? "border-red-400" : "border-bosque-300"}`,
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
    <div
      data-invalido={error ? "true" : undefined}
      className={`grid content-start gap-1.5 ${error ? "rounded-xl border border-red-400 bg-red-50/60 p-3" : ""} ${className}`}
    >
      <span id={`${id}-etiqueta`} className="text-sm font-medium text-bosque-800">
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
              className={`min-h-11 min-w-[5.5rem] flex-1 rounded-xl border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-miel-400 ${
                activo
                  ? "border-miel-400 bg-miel-50 text-bosque-950 ring-2 ring-miel-400/40"
                  : "border-bosque-300 bg-white text-bosque-700 hover:bg-bosque-50"
              }`}
            >
              {opcion.texto}
            </button>
          );
        })}
      </div>
      {typeof error === "string" && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
