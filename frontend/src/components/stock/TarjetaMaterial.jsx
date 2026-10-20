import { SlidersHorizontal } from "lucide-react";
import Boton from "../ui/Boton";
import Insignia from "../ui/Insignia";
import { cantidadCon } from "../../utils/stock";

export default function TarjetaMaterial({ item, onCambiarMinimo }) {
  return (
    <article
      className={`rounded-2xl border bg-white p-5 ${item.bajoMinimo ? "border-amber-300 ring-1 ring-amber-200" : "border-slate-200"}`}
      aria-label={item.texto}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-500">{item.texto}</h3>
        {item.bajoMinimo && <Insignia tono="ambar">Stock bajo</Insignia>}
      </div>
      <p className={`mt-2 text-3xl font-bold ${item.bajoMinimo ? "text-amber-700" : "text-slate-900"}`}>{item.disponible}</p>
      <p className="text-xs text-slate-500">disponibles en bodega</p>

      <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm">
        {item.puedeDanarse ? (
          <span className={item.danado > 0 ? "font-medium text-red-600" : "text-slate-500"}>
            {item.danado > 0 ? `${cantidadCon(item.danado, item.unidad)} por reparar` : "Sin material dañado"}
          </span>
        ) : (
          <span className="text-slate-400">Si se rompe, cuenta como marco roto</span>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">{item.minimo === null ? "Sin mínimo" : `Mínimo: ${item.minimo}`}</span>
          {onCambiarMinimo && (
            <Boton
              variante="fantasma"
              tamano="sm"
              icono={SlidersHorizontal}
              aria-label={`Cambiar mínimo de ${item.texto.toLowerCase()}`}
              onClick={() => onCambiarMinimo(item)}
            >
              Mínimo
            </Boton>
          )}
        </div>
      </div>
    </article>
  );
}
