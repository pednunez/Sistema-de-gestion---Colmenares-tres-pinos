import { ChevronLeft, ChevronRight } from "lucide-react";
import Boton from "./Boton";

// Controles para avanzar y retroceder entre páginas de un listado.
// totalPaginas es opcional: el backend no siempre informa el total.
export default function Paginador({ pagina, totalPaginas, hayAnterior, haySiguiente, onCambiar, cargando = false }) {
  if (!hayAnterior && !haySiguiente) return null;

  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-3">
      <Boton
        variante="secundario"
        tamano="sm"
        icono={ChevronLeft}
        disabled={!hayAnterior || cargando}
        onClick={() => onCambiar(pagina - 1)}
      >
        Anterior
      </Boton>
      <span className="text-sm text-slate-600" aria-live="polite">
        Página {pagina}
        {totalPaginas ? ` de ${totalPaginas}` : ""}
      </span>
      <Boton
        variante="secundario"
        tamano="sm"
        disabled={!haySiguiente || cargando}
        onClick={() => onCambiar(pagina + 1)}
      >
        Siguiente
        <ChevronRight size={17} aria-hidden="true" />
      </Boton>
    </nav>
  );
}
