import { TONOS, texto, tono } from "../../utils/etiquetas";

export default function Insignia({ tono: tonoInsignia = "gris", icono: Icono, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        TONOS[tonoInsignia] ?? TONOS.gris
      }`}
    >
      {Icono && <Icono size={13} aria-hidden="true" />}
      {children}
    </span>
  );
}

// Insignia a partir de un mapa de etiquetas, por ejemplo <InsigniaDe mapa={ESTADO_COLMENA} valor="ACTIVA" />
export function InsigniaDe({ mapa, valor, porDefecto = "Sin registrar" }) {
  return <Insignia tono={tono(mapa, valor)}>{texto(mapa, valor, porDefecto)}</Insignia>;
}
