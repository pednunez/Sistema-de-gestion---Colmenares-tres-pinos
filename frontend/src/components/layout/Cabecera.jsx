import { Menu, RefreshCw } from "lucide-react";
import { texto, ROL } from "../../utils/etiquetas";

export default function Cabecera({ titulo, usuario, actualizando, onActualizar, onAbrirMenu }) {
  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 lg:px-8 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menú"
          className="rounded-lg border border-slate-200 p-2 lg:hidden"
        >
          <Menu size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold lg:text-2xl">{titulo}</h1>
          <p className="hidden text-sm text-slate-500 sm:block">Colmenares Tres Pinos</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onActualizar}
          disabled={actualizando}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition hover:bg-slate-50 disabled:opacity-70"
        >
          <RefreshCw size={17} className={actualizando ? "animate-spin" : ""} aria-hidden="true" />
          <span className="hidden sm:inline">{actualizando ? "Actualizando" : "Actualizar"}</span>
          <span className="sr-only sm:hidden">Actualizar datos</span>
        </button>
        <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 md:block">
          <p className="text-sm font-semibold">{usuario.nombre}</p>
          <p className="text-xs text-slate-500">{texto(ROL, usuario.rol)}</p>
        </div>
      </div>
    </header>
  );
}
