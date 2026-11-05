import { useEffect, useRef, useState } from "react";
import { colmenasService } from "../services/colmenasService";
import { CARGANDO, CON_DATOS, SIN_DATOS, leerMarcosActuales } from "../utils/capacidad";

// Marcos actuales de las colmenas que reciben transferencias en la inspección.
// Devuelve un Map id → { estado, marcos }. Cada colmena se consulta una sola vez.
export function useMarcosDestinos(ids) {
  const [consultas, setConsultas] = useState(() => new Map());
  const pedidas = useRef(new Set());
  const clave = [...new Set(ids.map(String))].sort().join(",");

  useEffect(() => {
    if (!clave) return;
    for (const id of clave.split(",")) {
      if (pedidas.current.has(id)) continue;
      pedidas.current.add(id);
      colmenasService
        .obtenerMarcos(id)
        .then(leerMarcosActuales)
        .catch(() => null)
        .then((marcos) =>
          setConsultas((previas) =>
            new Map(previas).set(id, marcos ? { estado: CON_DATOS, marcos } : { estado: SIN_DATOS })
          )
        );
    }
  }, [clave]);

  // Las que todavía no responden se muestran como «cargando».
  const resultado = new Map(consultas);
  for (const id of clave ? clave.split(",") : []) if (!resultado.has(id)) resultado.set(id, { estado: CARGANDO });
  return resultado;
}
