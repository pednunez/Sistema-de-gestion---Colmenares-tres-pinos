import { useId, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import Insignia from "../ui/Insignia";
import { Buscador } from "../ui/Estructura";
import { useDatos } from "../../hooks/useDatos";
import { colmenaOperativa } from "../../utils/alertas";

const MAXIMO_POR_VEZ = 100;

// Elegir colmenas del mismo apiario para agregarlas al grupo. "grupoDe" indica en
// qué otro grupo está cada colmena: el backend la mueve y conserva el historial.
export default function AsignarColmenas({
  grupo,
  idsEnGrupo,
  grupoDe,
  onGuardar,
  onCerrar,
}) {
  const idTitulo = useId();
  const { datos } = useDatos();
  const [seleccion, setSeleccion] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const disponibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return datos.colmenas
      .filter(
        (c) =>
          c.apiario_id === grupo.apiario_id &&
          colmenaOperativa(c) &&
          !idsEnGrupo.has(c.id),
      )
      .filter((c) => !termino || c.codigo.toLowerCase().includes(termino))
      .sort((a, b) =>
        a.codigo.localeCompare(b.codigo, "es", { numeric: true }),
      );
  }, [datos.colmenas, grupo.apiario_id, idsEnGrupo, busqueda]);

  const alternar = (id) =>
    setSeleccion((s) =>
      s.includes(id) ? s.filter((otro) => otro !== id) : [...s, id],
    );
  const sinGrupo = disponibles
    .filter((c) => !grupoDe.has(c.id))
    .map((c) => c.id);
  const moviendo = seleccion.filter((id) => grupoDe.has(id)).length;

  const guardar = async () => {
    if (seleccion.length === 0) return setError("Elige al menos una colmena.");
    if (seleccion.length > MAXIMO_POR_VEZ)
      return setError(
        `Puedes agregar hasta ${MAXIMO_POR_VEZ} colmenas por vez.`,
      );
    setEnviando(true);
    setError("");
    try {
      await onGuardar(seleccion);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Agregar colmenas a ${grupo.nombre}`}
      descripcion="Solo colmenas activas del mismo apiario."
      onCerrar={onCerrar}
      ancho="sm:max-w-2xl"
      pie={
        <>
          {error && (
            <p
              role="alert"
              className="text-sm text-red-700 sm:mr-auto sm:self-center"
            >
              {error}
            </p>
          )}
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            onClick={guardar}
            cargando={enviando}
            disabled={seleccion.length === 0}
          >
            {seleccion.length === 0
              ? "Agregar colmenas"
              : `Agregar ${seleccion.length} ${seleccion.length === 1 ? "colmena" : "colmenas"}`}
          </Boton>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-56 flex-1">
            <Buscador
              valor={busqueda}
              onCambiar={setBusqueda}
              placeholder="Buscar por código"
              etiqueta="Buscar colmena por código"
            />
          </div>
          {sinGrupo.length > 0 && (
            <Boton
              variante="secundario"
              tamano="sm"
              onClick={() =>
                setSeleccion((s) => [...new Set([...s, ...sinGrupo])])
              }
            >
              {sinGrupo.length === 1 ? "Elegir la que no tiene grupo" : `Elegir las ${sinGrupo.length} sin grupo`}
            </Boton>
          )}
        </div>

        {moviendo > 0 && (
          <Alerta tipo="aviso">
            {moviendo === 1
              ? "1 colmena elegida está"
              : `${moviendo} colmenas elegidas están`}{" "}
            en otro grupo y se moverá{moviendo === 1 ? "" : "n"} a{" "}
            {grupo.nombre}.
          </Alerta>
        )}

        {disponibles.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            {busqueda
              ? "Ninguna colmena coincide con la búsqueda."
              : "Todas las colmenas activas de este apiario ya están en este grupo."}
          </p>
        ) : (
          <ul aria-labelledby={idTitulo} className="grid gap-2 sm:grid-cols-2">
            {disponibles.map((c) => {
              const marcada = seleccion.includes(c.id);
              const otro = grupoDe.get(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
                      marcada
                        ? "border-amber-400 bg-amber-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-amber-500"
                      checked={marcada}
                      onChange={() => alternar(c.id)}
                      aria-label={`Agregar ${c.codigo}`}
                    />
                    <span className="font-medium">{c.codigo}</span>
                    {otro && <Insignia tono="gris">En {otro}</Insignia>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <span id={idTitulo} className="sr-only">
          Colmenas disponibles
        </span>
      </div>
    </Modal>
  );
}
