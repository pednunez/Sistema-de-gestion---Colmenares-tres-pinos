import { useState } from "react";
import { Link2 } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import LectorQr from "./LectorQr";
import SelectorColmena from "../colmenas/SelectorColmena";
import { useAuth } from "../../hooks/useAuth";
import { useDatos } from "../../hooks/useDatos";
import { useAvisos } from "../../hooks/useAvisos";
import { colmenasService } from "../../services/colmenasService";

// Escanear la etiqueta de una caja y llegar a su colmena (PB-07, RF-20).
// Si la etiqueta no está asociada, el administrador puede asociarla ahí mismo.
export default function EscanearColmena({ onEncontrada, onCerrar }) {
  const { esAdmin } = useAuth();
  const { recargar, codigoColmena } = useDatos();
  const avisos = useAvisos();
  const [buscando, setBuscando] = useState(false);
  const [sinColmena, setSinColmena] = useState(null);
  const [error, setError] = useState("");
  const [colmenaElegida, setColmenaElegida] = useState("");
  const [asociando, setAsociando] = useState(false);

  const buscar = async (codigo) => {
    setBuscando(true);
    setError("");
    setSinColmena(null);
    try {
      const colmena = await colmenasService.obtenerPorQr(codigo);
      onEncontrada(colmena);
    } catch (err) {
      if (err.estado === 404 || err.estado === 422) setSinColmena(codigo);
      else setError(err.message);
    } finally {
      setBuscando(false);
    }
  };

  const asociar = async () => {
    if (!colmenaElegida) return;
    setAsociando(true);
    setError("");
    try {
      const colmena = await colmenasService.asociarQr(Number(colmenaElegida), sinColmena);
      avisos.exito(`La etiqueta quedó asociada a ${codigoColmena(Number(colmenaElegida))}.`);
      await recargar();
      onEncontrada(colmena ?? { id: Number(colmenaElegida) });
    } catch (err) {
      setError(err.message);
    } finally {
      setAsociando(false);
    }
  };

  return (
    <Modal
      titulo="Escanear QR de una colmena"
      descripcion="Lee la etiqueta de la caja para abrir su ficha."
      onCerrar={onCerrar}
    >
      <div className="grid gap-4">
        {error && <Alerta>{error}</Alerta>}
        {!sinColmena && <LectorQr onLeido={buscar} ocupado={buscando} />}

        {sinColmena && (
          <div className="grid gap-3">
            <Alerta tipo="aviso">Esta etiqueta no está asociada a ninguna colmena activa.</Alerta>
            {esAdmin ? (
              <>
                <p className="text-sm text-slate-600">
                  Si es una etiqueta ya impresa, elige la colmena a la que pertenece y asóciala.
                </p>
                <SelectorColmena
                  aria-label="Colmena para esta etiqueta"
                  valor={colmenaElegida}
                  onCambiar={setColmenaElegida}
                />
                <div className="flex flex-wrap gap-2">
                  <Boton icono={Link2} disabled={!colmenaElegida} cargando={asociando} onClick={asociar}>
                    Asociar etiqueta
                  </Boton>
                  <Boton variante="secundario" onClick={() => setSinColmena(null)}>
                    Escanear otra
                  </Boton>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">Pídele al administrador que asocie esta etiqueta a su colmena.</p>
                <Boton variante="secundario" onClick={() => setSinColmena(null)}>
                  Escanear otra
                </Boton>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
