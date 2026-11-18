import { SlidersHorizontal } from "lucide-react";
import Boton from "../ui/Boton";
import Insignia from "../ui/Insignia";

function Estado({ nombre, valor, destacar }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-bosque-500">{nombre}</dt>
      <dd className={valor > 0 && destacar ? `font-semibold ${destacar}` : "text-bosque-700"}>{valor}</dd>
    </div>
  );
}

export default function TarjetaMaterial({ item, onCambiarMinimo }) {
  return (
    <article
      className={`rounded-2xl border bg-white p-5 ${item.bajoMinimo ? "border-miel-300 ring-1 ring-miel-200" : "border-bosque-200"}`}
      aria-label={item.texto}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-bosque-500">{item.texto}</h3>
        {item.pendienteServidor ? (
          <Insignia tono="gris">Pendiente en el servidor</Insignia>
        ) : (
          item.bajoMinimo && <Insignia tono="ambar">Stock bajo</Insignia>
        )}
      </div>
      <p className={`mt-2 text-3xl font-bold ${item.bajoMinimo ? "text-miel-700" : "text-bosque-900"}`}>{item.disponible}</p>
      <p className="text-xs text-bosque-500">disponibles en bodega</p>

      <div className="mt-4 grid gap-2 border-t border-bosque-100 pt-3 text-sm">
        {item.puedeDanarse ? (
          <dl className="grid gap-1">
            <Estado nombre={item.textoDanado ? "Rotos (por reparar)" : "Dañados (por reparar)"} valor={item.danado} destacar="text-red-600" />
            <Estado nombre="En reparación" valor={item.enReparacion} destacar="text-miel-700" />
            <Estado nombre="Merma acumulada" valor={item.merma} />
          </dl>
        ) : (
          <span className="text-bosque-400">Si se rompe, cuenta como marco roto</span>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-bosque-100 pt-2">
          <span className="text-bosque-500">{item.minimo === null ? "Sin mínimo" : `Mínimo: ${item.minimo}`}</span>
          {onCambiarMinimo && !item.pendienteServidor && (
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
