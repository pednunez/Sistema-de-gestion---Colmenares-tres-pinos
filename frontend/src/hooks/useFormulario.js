// Estado de formulario con validación del lado del cliente (RF-59).
// La validación definitiva siempre la hace el backend.
import { useCallback, useState } from "react";

export function useFormulario(valoresIniciales) {
  const [valores, setValores] = useState(valoresIniciales);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cambiar = useCallback((campo, valor) => {
    setValores((actuales) => ({ ...actuales, [campo]: valor }));
    setErrores((actuales) => (actuales[campo] ? { ...actuales, [campo]: undefined } : actuales));
  }, []);

  const enviar = async (validar, accion) => {
    setErrorGeneral("");
    const encontrados = Object.fromEntries(
      Object.entries(validar ? validar(valores) : {}).filter(([, mensaje]) => mensaje)
    );
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return false;

    setEnviando(true);
    try {
      await accion(valores);
      return true;
    } catch (err) {
      setErrorGeneral(err.message || "No se pudo guardar. Intenta nuevamente.");
      return false;
    } finally {
      setEnviando(false);
    }
  };

  return { valores, cambiar, errores, errorGeneral, enviando, enviar };
}
