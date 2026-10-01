// Navegación entre vistas con parámetros, por ejemplo abrir el detalle de
// una colmena desde el dashboard. Cada navegación vuelve a montar la vista.
import { useCallback, useMemo, useState } from "react";
import { NavegacionContext } from "./contextos";

export function NavegacionProvider({ vistaInicial, children }) {
  const [estado, setEstado] = useState({ vista: vistaInicial, parametros: {}, clave: 0 });

  const navegar = useCallback((vista, parametros = {}) => {
    setEstado((actual) => ({ vista, parametros, clave: actual.clave + 1 }));
    window.scrollTo(0, 0);
  }, []);

  const valor = useMemo(() => ({ ...estado, navegar }), [estado, navegar]);

  return <NavegacionContext.Provider value={valor}>{children}</NavegacionContext.Provider>;
}
