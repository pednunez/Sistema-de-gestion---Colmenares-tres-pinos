import { Lock } from "lucide-react";
import { EstadoVacio } from "../components/ui/Estados";

export default function SinAccesoPage() {
  return (
    <EstadoVacio
      icono={Lock}
      titulo="No tienes acceso a esta sección"
      texto="Si necesitas usarla, pide al administrador que revise tu rol."
    />
  );
}
