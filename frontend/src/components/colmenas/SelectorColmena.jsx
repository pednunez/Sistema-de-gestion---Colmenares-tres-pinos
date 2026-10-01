import { useMemo } from "react";
import { Seleccion } from "../ui/Campo";
import { useDatos } from "../../hooks/useDatos";
import { colmenaOperativa } from "../../utils/alertas";

// Select de colmenas agrupadas por apiario, para ubicar rápido entre cientos de colmenas.
export default function SelectorColmena({ valor, onCambiar, excluir, soloOperativas = true, ...props }) {
  const { datos, nombreApiario } = useDatos();

  const grupos = useMemo(() => {
    const porApiario = new Map();
    for (const colmena of datos.colmenas) {
      if (soloOperativas && !colmenaOperativa(colmena) && String(colmena.id) !== String(valor)) continue;
      if (excluir !== undefined && String(colmena.id) === String(excluir)) continue;
      if (!porApiario.has(colmena.apiario_id)) porApiario.set(colmena.apiario_id, []);
      porApiario.get(colmena.apiario_id).push(colmena);
    }
    return [...porApiario.entries()]
      .map(([apiarioId, colmenas]) => ({
        apiario: nombreApiario(apiarioId),
        colmenas: colmenas.sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })),
      }))
      .sort((a, b) => a.apiario.localeCompare(b.apiario, "es"));
  }, [datos.colmenas, excluir, nombreApiario, soloOperativas, valor]);

  return (
    <Seleccion value={valor} onChange={(evento) => onCambiar(evento.target.value)} placeholder="Selecciona una colmena" {...props}>
      {grupos.map((grupo) => (
        <optgroup key={grupo.apiario} label={grupo.apiario}>
          {grupo.colmenas.map((colmena) => (
            <option key={colmena.id} value={colmena.id}>
              {colmena.codigo}
            </option>
          ))}
        </optgroup>
      ))}
    </Seleccion>
  );
}
