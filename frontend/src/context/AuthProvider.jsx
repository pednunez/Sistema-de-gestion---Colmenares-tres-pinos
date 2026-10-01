import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./contextos";
import { authService } from "../services/authService";
import { alExpirarSesion } from "../services/api";
import { borrarToken, guardarToken, obtenerToken } from "../services/tokenStorage";

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(() => Boolean(obtenerToken()));
  const [motivoSalida, setMotivoSalida] = useState("");

  const cerrarSesion = useCallback((motivo = "") => {
    borrarToken();
    setUsuario(null);
    setMotivoSalida(motivo);
  }, []);

  // Si cualquier petición recibe 401, se cierra la sesión y se informa el motivo.
  useEffect(() => {
    alExpirarSesion(() => cerrarSesion("Tu sesión expiró. Vuelve a iniciar sesión."));
    return () => alExpirarSesion(null);
  }, [cerrarSesion]);

  // Al abrir o recargar la página, se valida el token guardado.
  useEffect(() => {
    if (!obtenerToken()) return;
    authService
      .usuarioActual()
      .then(setUsuario)
      .catch(() => borrarToken())
      .finally(() => setVerificando(false));
  }, []);

  const iniciarSesion = useCallback(async (email, password, recordar) => {
    const { access_token } = await authService.login(email, password);
    guardarToken(access_token, recordar);
    try {
      const datosUsuario = await authService.usuarioActual();
      setMotivoSalida("");
      setUsuario(datosUsuario);
    } catch (error) {
      borrarToken();
      throw error;
    }
  }, []);

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
