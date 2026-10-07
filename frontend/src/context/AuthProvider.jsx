import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./contextos";
import { authService } from "../services/authService";
import { alExpirarSesion, establecerSesion, ApiError } from "../services/api";

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const [motivoSalida, setMotivoSalida] = useState("");

  const limpiarSesion = useCallback((motivo = "") => {
    establecerSesion(false);
    setUsuario(null);
    setMotivoSalida(motivo);
  }, []);

  // Si cualquier petición recibe 401, se vuelve al login y se informa el motivo.
  useEffect(() => {
    alExpirarSesion(() => limpiarSesion("Tu sesión expiró. Vuelve a iniciar sesión."));
    return () => alExpirarSesion(null);
  }, [limpiarSesion]);

  // Al abrir o recargar la página, se comprueba si la cookie de sesión sigue vigente.
  useEffect(() => {
    // Limpieza del token que guardaba la versión anterior del frontend.
    try {
      localStorage.removeItem("access_token");
      sessionStorage.removeItem("access_token");
    } catch {
      // El almacenamiento puede estar bloqueado; no afecta a la sesión por cookie.
    }

    let vigente = true;
    (async () => {
      try {
        const datosUsuario = await authService.usuarioActual();
        const { csrf_token } = await authService.csrf();
        if (!vigente) return;
        establecerSesion(true, csrf_token);
        setUsuario(datosUsuario);
      } catch {
        // Sin sesión vigente: se muestra el login.
      } finally {
        if (vigente) setVerificando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const iniciarSesion = useCallback(async (email, password) => {
    const respuesta = await authService.login(email, password);
    // Confirmar que el navegador guardo/envio la cookie antes de abrir el panel.
    let datosUsuario;
    try {
      datosUsuario = await authService.usuarioActual();
    } catch (error) {
      establecerSesion(false);
      if (error.estado === 401) {
        throw new ApiError("El acceso fue aceptado, pero no se pudo mantener la sesión. Revisa la configuración del navegador y vuelve a intentarlo.");
      }
      throw error;
    }
    establecerSesion(true, respuesta.csrf_token);
    setMotivoSalida("");
    setUsuario(datosUsuario);
  }, []);

  // Si el backend no confirma el cierre, la sesión sigue abierta y se propaga el error.
  const cerrarSesion = useCallback(async () => {
    try {
      await authService.logout();
    } catch (error) {
      if (error.estado !== 401) throw error;
    }
    limpiarSesion();
  }, [limpiarSesion]);

  const valor = useMemo(
    () => ({
      usuario,
      esAdmin: usuario?.rol === "ADMIN",
      verificando,
      motivoSalida,
      iniciarSesion,
      cerrarSesion,
    }),
    [usuario, verificando, motivoSalida, iniciarSesion, cerrarSesion]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
