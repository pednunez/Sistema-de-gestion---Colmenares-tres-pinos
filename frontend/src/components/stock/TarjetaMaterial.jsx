import { cantidadCon } from "../../utils/stock";

export default function TarjetaMaterial({ item }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5" aria-label={item.texto}>
      <h3 className="text-sm font-medium text-slate-500">{item.texto}</h3>
      <p className="mt-2 text-3xl font-bold text-slate-900">{item.disponible}</p>
      <p className="text-xs text-slate-500">disponibles en bodega</p>
      <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
        {item.puedeDanarse ? (
          <span className={item.danado > 0 ? "font-medium text-red-600" : "text-slate-500"}>
            {item.danado > 0 ? `${cantidadCon(item.danado, item.unidad)} por reparar` : "Sin material dañado"}
          </span>
        ) : (
          <span className="text-slate-400">Si se rompe, cuenta como marco roto</span>
        )}
      </div>
    </article>
  );
}
