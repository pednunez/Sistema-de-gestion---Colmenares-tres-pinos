import Alerta from "../ui/Alerta";
import Boton from "../ui/Boton";
import { textoStockBajo } from "../../utils/stock";

// Lista el material bajo su mínimo. Se usa en Stock y en el Dashboard.
export default function AvisoStockBajo({ bajos, onVer }) {
  if (!bajos?.length) return null;
  return (
    <Alerta
      tipo="aviso"
      accion={
        onVer && (
          <Boton variante="secundario" tamano="sm" onClick={onVer}>
            Ver stock
          </Boton>
        )
      }
    >
      <p className="font-semibold">
        {bajos.length === 1 ? "Un material está bajo su mínimo" : `${bajos.length} materiales están bajo su mínimo`}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {bajos.map((item) => (
          <li key={item.material}>{textoStockBajo(item)}</li>
        ))}
      </ul>
    </Alerta>
  );
}
