import { Search } from "lucide-react";

// Descripción y acciones de cada módulo. El título está en la cabecera.
export function EncabezadoModulo({ descripcion, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <p className="text-slate-500">{descripcion}</p>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function BarraFiltros({ children }) {
  return <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">{children}</div>;
}

export function Buscador({ valor, onCambiar, placeholder = "Buscar...", etiqueta = "Buscar" }) {
  return (
    <div className="relative">
      <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={(evento) => onCambiar(evento.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40"
      />
    </div>
  );
}

export function Panel({ titulo, descripcion, accion, children, className = "" }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}>
      {titulo && (
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">{titulo}</h3>
            {descripcion && <p className="text-sm text-slate-500">{descripcion}</p>}
          </div>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export function Dato({ nombre, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{nombre}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function TarjetaIndicador({ titulo, valor, detalle, icono: Icono, alerta = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-amber-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{titulo}</p>
          <p className={`mt-2 text-3xl font-bold ${alerta ? "text-red-600" : "text-slate-900"}`}>{valor}</p>
          {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
        </div>
        <div className={`rounded-xl p-3 ${alerta ? "bg-red-50 text-red-600" : "bg-amber-100 text-amber-700"}`}>
          <Icono size={24} aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}
