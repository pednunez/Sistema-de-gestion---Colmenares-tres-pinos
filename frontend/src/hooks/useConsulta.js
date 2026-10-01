// Ejecuta una consulta al montar el componente y cuando cambian las dependencias.
import { useCallback, useEffect, useState } from "react";

export function useConsulta(consulta, dependencias = []) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: "" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado((actual) => ({ ...actual, cargando: true, error: "" }));
    consulta()
      .then((datos) => vigente && setEstado({ datos, cargando: false, error: "" }))
      .catch((err) => vigente && setEstado({ datos: null, cargando: false, error: err.message }));
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  return { ...estado, recargar };
}
