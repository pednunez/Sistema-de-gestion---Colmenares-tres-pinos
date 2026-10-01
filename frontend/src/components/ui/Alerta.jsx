import { AlertCircle, Info } from "lucide-react";

const ESTILOS = {
  error: { clase: "border-red-200 bg-red-50 text-red-800", Icono: AlertCircle },
  info: { clase: "border-sky-200 bg-sky-50 text-sky-900", Icono: Info },
};

export default function Alerta({ tipo = "error", children, accion }) {
  const { clase, Icono } = ESTILOS[tipo];
  return (
    <div role={tipo === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${clase}`}>
      <Icono size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1">{children}</div>
      {accion}
    </div>
  );
}
