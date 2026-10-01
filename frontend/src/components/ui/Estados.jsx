import { Loader2 } from "lucide-react";
import Boton from "./Boton";
import Alerta from "./Alerta";

export function Cargando({ texto = "Cargando..." }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500" role="status">
      <Loader2 size={22} className="animate-spin text-amber-500" aria-hidden="true" />
      {texto}
    </div>
  );
}

export function EstadoVacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {Icono && <Icono size={36} className="mx-auto mb-3 text-slate-300" aria-hidden="true" />}
      <p className="font-semibold text-slate-800">{titulo}</p>
      {texto && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{texto}</p>}
      {children && <div className="mt-5 flex justify-center">{children}</div>}
    </div>
  );
}

export function ErrorCarga({ mensaje, onReintentar }) {
  return (
    <Alerta
      accion={
        onReintentar && (
          <Boton variante="secundario" tamano="sm" onClick={onReintentar}>
            Reintentar
          </Boton>
        )
      }
    >
      {mensaje}
    </Alerta>
  );
}
