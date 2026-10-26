import { useMemo } from "react";
import { Seleccion } from "../ui/Campo";
import { useDatos } from "../../hooks/useDatos";
import { colmenaOperativa } from "../../utils/alertas";

// Primero el apiario y después solo las colmenas de ese apiario.
export default function SelectorApiarioColmena({ apiarioId, colmenaId, onCambiarApiario, onCambiarColmena, errores = {} }) {
  const { datos } = useDatos();

  const apiarios = useMemo(
    () =>
      [...datos.apiarios]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map((a) => ({ valor: String(a.id), texto: a.nombre })),
    [datos.apiarios]
  );

  const colmenas = useMemo(
    () =>
      datos.colmenas
        .filter((c) => String(c.apiario_id) === String(apiarioId) && (colmenaOperativa(c) || String(c.id) === String(colmenaId)))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
        .map((c) => ({ valor: String(c.id), texto: c.codigo })),
    [datos.colmenas, apiarioId, colmenaId]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Seleccion
        etiqueta="Apiario"
        requerido
        value={apiarioId}
        onChange={(e) => onCambiarApiario(e.target.value)}
        error={errores.apiario_id}
        placeholder="Selecciona un apiario"
        opciones={apiarios}
      />
      <Seleccion
        etiqueta="Colmena"
        requerido
        value={colmenaId}
        onChange={(e) => onCambiarColmena(e.target.value)}
        error={errores.colmena_id}
        disabled={!apiarioId}
        placeholder={!apiarioId ? "Elige primero el apiario" : colmenas.length === 0 ? "Este apiario no tiene colmenas activas" : "Selecciona una colmena"}
        opciones={colmenas}
      />
    </div>
  );
}
