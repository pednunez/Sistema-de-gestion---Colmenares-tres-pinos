// Indicador del estado del servidor para la cabecera. Al hacer clic vuelve a verificar.
import { useEstadoServidor } from "../../hooks/useEstadoServidor";
import { ESTADO_SERVIDOR } from "../../services/estadoService";

const PRESENTACION = {
  [ESTADO_SERVIDOR.VERIFICANDO]: { texto: "Verificando servidor", punto: "bg-slate-400 animate-pulse", caja: "border-slate-200 text-slate-600" },
  [ESTADO_SERVIDOR.EN_LINEA]: { texto: "Servidor en línea", punto: "bg-emerald-500", caja: "border-emerald-200 text-emerald-700" },
  [ESTADO_SERVIDOR.CON_PROBLEMAS]: { texto: "Servidor con problemas", punto: "bg-amber-500", caja: "border-amber-300 bg-amber-50 text-amber-800" },
  [ESTADO_SERVIDOR.SIN_CONEXION]: { texto: "Sin conexión con el servidor", punto: "bg-red-500", caja: "border-red-300 bg-red-50 text-red-700" },
};

const hora = (fecha) => fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

export default function EstadoServidor() {
  const { estado, verificadoEn, verificar } = useEstadoServidor();
  const { texto, punto, caja } = PRESENTACION[estado];
  const detalle = verificadoEn ? `${texto}. Última verificación: ${hora(verificadoEn)}. Clic para verificar ahora.` : texto;
  const conFalla = estado === ESTADO_SERVIDOR.CON_PROBLEMAS || estado === ESTADO_SERVIDOR.SIN_CONEXION;

  return (
    <button
      type="button"
      onClick={verificar}
      title={detalle}
      aria-label={detalle}
      className={`flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm transition hover:bg-slate-50 ${caja}`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${punto}`} aria-hidden="true" />
      {/* En pantallas chicas solo se ve el punto, salvo que haya una falla. */}
      <span className={conFalla ? "inline" : "hidden xl:inline"} role="status">
        {texto}
      </span>
    </button>
  );
}
