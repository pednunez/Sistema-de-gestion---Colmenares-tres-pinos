import { Loader2 } from "lucide-react";

const VARIANTES = {
  primario: "border-transparent bg-miel-400 text-bosque-950 hover:bg-miel-500",
  secundario: "border-bosque-300 bg-white text-bosque-800 hover:bg-bosque-50",
  peligro: "border-transparent bg-red-600 text-white hover:bg-red-700",
  fantasma: "border-transparent bg-transparent text-bosque-600 hover:bg-bosque-100 hover:text-bosque-900",
};

const TAMANOS = {
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-sm",
  icono: "h-9 w-9",
};

export default function Boton({
  variante = "primario",
  tamano = "md",
  icono: Icono,
  cargando = false,
  type = "button",
  disabled,
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-miel-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      {...props}
    >
      {cargando ? (
        <Loader2 size={17} className="animate-spin" aria-hidden="true" />
      ) : (
        Icono && <Icono size={17} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
