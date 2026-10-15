// Consulta /health al montar, cada minuto, al volver a la pestaña y cuando el
// equipo recupera o pierde la red.
import { useCallback, useEffect, useRef, useState } from "react";
import { ESTADO_SERVIDOR, estadoService } from "../services/estadoService";

export const INTERVALO_ESTADO_MS = 60_000;

export function useEstadoServidor(intervalo = INTERVALO_ESTADO_MS) {
  const [estado, setEstado] = useState(ESTADO_SERVIDOR.VERIFICANDO);
  const [verificadoEn, setVerificadoEn] = useState(null);
  const montado = useRef(true);

  const verificar = useCallback(async () => {
    const nuevo = await estadoService.consultar();
    if (!montado.current) return;
    setEstado(nuevo);
    setVerificadoEn(new Date());
  }, []);

  useEffect(() => {
    montado.current = true;
    verificar();
    const temporizador = setInterval(verificar, intervalo);
    const alVolver = () => document.visibilityState === "visible" && verificar();
    const sinRed = () => setEstado(ESTADO_SERVIDOR.SIN_CONEXION);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", verificar);
    window.addEventListener("offline", sinRed);
    return () => {
      montado.current = false;
      clearInterval(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", verificar);
      window.removeEventListener("offline", sinRed);
    };
  }, [verificar, intervalo]);

  return { estado, verificadoEn, verificar };
}
