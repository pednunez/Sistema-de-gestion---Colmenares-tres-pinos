import { useEffect, useRef, useState } from "react";
import { colmenasService } from "../services/colmenasService";
import { CARGANDO, SIN_DATOS, estadoDeMarcos } from "../utils/capacidad";

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
        .then(estadoDeMarcos)
        .catch(() => ({ estado: SIN_DATOS }))
        .then((consulta) => setConsultas((previas) => new Map(previas).set(id, consulta)));
    }
  }, [clave]);

  // Las que todavía no responden se muestran como «cargando».
  const resultado = new Map(consultas);
  for (const id of clave ? clave.split(",") : []) if (!resultado.has(id)) resultado.set(id, { estado: CARGANDO });
  return resultado;
}
