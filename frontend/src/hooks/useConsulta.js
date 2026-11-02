// Ejecuta una consulta al montar el componente y cuando cambian las dependencias.
import { useCallback, useEffect, useState } from "react";

export function useConsulta(consulta, dependencias = []) {
  const [version, setVersion] = useState(0);
  // "para" indica a qué dependencias corresponde la respuesta guardada: mientras
  // no coincidan con las actuales, la consulta está cargando. Así no hace falta
  // cambiar el estado dentro del efecto antes de consultar.
  const [estado, setEstado] = useState({ datos: null, error: "", para: null });
  const clave = [...dependencias, version].map(String).join("|");

  useEffect(() => {
    let vigente = true;
    consulta()
      .then((datos) => vigente && setEstado({ datos, error: "", para: clave }))
      .catch((err) => vigente && setEstado({ datos: null, error: err.message, para: clave }));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const cargando = estado.para !== clave;

  // Mientras recarga se conservan los datos anteriores y se oculta el error.
  return { datos: estado.datos, error: cargando ? "" : estado.error, cargando, recargar };
}
