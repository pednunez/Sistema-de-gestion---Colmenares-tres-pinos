import { LogOut, X } from "lucide-react";
import { texto, ROL } from "../../utils/etiquetas";

export default function BarraLateral({ items, vistaActiva, onNavegar, usuario, onCerrarSesion, cerrando = false, onCerrar }) {
  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex h-20 items-center justify-between border-b border-slate-800 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-xl font-bold text-slate-950">
            CP
          </div>
          <div>
            <p className="text-lg font-bold">Colmenares</p>
            <p className="text-sm text-slate-400">Tres Pinos</p>
          </div>
        </div>
        {onCerrar && (
          <button type="button" onClick={onCerrar} aria-label="Cerrar menú" className="rounded-lg p-2 hover:bg-slate-900">
            <X size={22} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Menú principal">
        {items.map((item) => {
          const Icono = item.icono;
          const activo = vistaActiva === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavegar(item.id)}
              aria-current={activo ? "page" : undefined}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                activo ? "bg-amber-400 font-semibold text-slate-950" : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <Icono size={19} aria-hidden="true" />
              {item.nombre}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="px-4 pb-3">
          <p className="text-sm font-semibold">{usuario.nombre}</p>
          <p className="text-xs text-slate-400">{texto(ROL, usuario.rol)}</p>
        </div>
        <button
          type="button"
          onClick={() => onCerrarSesion()}
          disabled={cerrando}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-slate-400 transition hover:bg-slate-900 hover:text-white"
        >
          <LogOut size={19} aria-hidden="true" />
          {cerrando ? "Cerrando sesión..." : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}
