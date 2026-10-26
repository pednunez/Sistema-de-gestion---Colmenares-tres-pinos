// Botones para ver todo junto o un apiario a la vez. Se usa en el Dashboard y en Transferencias.
// "valor" es "" para todos los apiarios o el id del apiario elegido.
export default function FiltroApiario({ apiarios, valor, onCambiar }) {
  const opcionesFiltro = [{ id: "", nombre: "Todos los apiarios" }, ...apiarios];
  return (
    <div className="mb-6 flex items-center gap-3 overflow-x-auto pb-1" role="radiogroup" aria-label="Ver apiario">
      <span className="shrink-0 text-sm font-medium text-slate-600">Ver:</span>
      {opcionesFiltro.map((apiario) => {
        const activo = String(valor) === String(apiario.id);
        return (
          <button
            key={apiario.id || "todos"}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambiar(String(apiario.id))}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              activo ? "border-amber-400 bg-amber-400 text-slate-950" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {apiario.nombre}
          </button>
        );
      })}
    </div>
  );
}
