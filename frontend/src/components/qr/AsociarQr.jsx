import { useState } from "react";
import { RefreshCw, ScanLine } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { Segmentado } from "../ui/Campo";
import LectorQr from "./LectorQr";
import { useDatos } from "../../hooks/useDatos";
import { useAvisos } from "../../hooks/useAvisos";
import { colmenasService } from "../../services/colmenasService";

const MODOS = [
  { valor: "IMPRESA", texto: "Etiqueta ya impresa" },
  { valor: "NUEVA", texto: "Código nuevo" },
];

// Cambiar la etiqueta QR de una colmena (solo administrador, S2-T04): asociar
// una etiqueta ya impresa o generar un código nuevo si la anterior se perdió.
export default function AsociarQr({ colmena, onCerrar }) {
  const { recargar } = useDatos();
  const avisos = useAvisos();
  const [modo, setModo] = useState("IMPRESA");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (codigo) => {
    setGuardando(true);
    setError("");
    try {
      await colmenasService.asociarQr(colmena.id, codigo);
      avisos.exito(
        codigo
          ? `La etiqueta quedó asociada a ${colmena.codigo}.`
          : `${colmena.codigo} tiene un código QR nuevo: imprime su etiqueta.`
      );
      await recargar();
      onCerrar();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  return (
    <Modal titulo={`Etiqueta QR de ${colmena.codigo}`} onCerrar={onCerrar}>
      <div className="grid gap-4">
        {error && <Alerta>{error}</Alerta>}
        <Segmentado etiqueta="¿Qué quieres hacer?" opciones={MODOS} valor={modo} onCambiar={setModo} />
        {modo === "IMPRESA" ? (
          <>
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <ScanLine size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              Lee la etiqueta que ya está pegada en la caja. La etiqueta anterior de {colmena.codigo} deja de funcionar.
            </p>
            <LectorQr onLeido={guardar} ocupado={guardando} />
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Úsalo si la etiqueta se perdió o se dañó. La etiqueta anterior deja de funcionar y hay que imprimir una
              nueva.
            </p>
            <Boton icono={RefreshCw} cargando={guardando} onClick={() => guardar(null)}>
              Generar código nuevo
            </Boton>
          </>
        )}
      </div>
    </Modal>
  );
}
