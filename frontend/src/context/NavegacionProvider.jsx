// Navegación entre vistas con parámetros, por ejemplo abrir el detalle de
// una colmena desde el dashboard. Cada navegación vuelve a montar la vista.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavegacionContext } from "./contextos";
import { establecerContexto } from "../services/registroErrores";

export function NavegacionProvider({ vistaInicial, children }) {
  const [estado, setEstado] = useState({ vista: vistaInicial, parametros: {}, clave: 0 });

  const navegar = useCallback((vista, parametros = {}) => {
    setEstado((actual) => ({ vista, parametros, clave: actual.clave + 1 }));
    window.scrollTo(0, 0);
  }, []);

  // Los errores registrados indican en qué pantalla ocurrieron.
  useEffect(() => {
    establecerContexto({ vista: estado.vista });
  }, [estado.vista]);

  const valor = useMemo(() => ({ ...estado, navegar }), [estado, navegar]);

  return <NavegacionContext.Provider value={valor}>{children}</NavegacionContext.Provider>;
}
