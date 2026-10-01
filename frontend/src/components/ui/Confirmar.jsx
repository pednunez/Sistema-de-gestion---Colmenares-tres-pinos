import { useState } from "react";
import Modal from "./Modal";
import Boton from "./Boton";
import Alerta from "./Alerta";

export default function Confirmar({ titulo, children, textoConfirmar, variante = "peligro", onConfirmar, onCerrar }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const confirmar = async () => {
    setEnviando(true);
    setError("");
    try {
      await onConfirmar();
      onCerrar();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={titulo}
      onCerrar={enviando ? undefined : onCerrar}
      ancho="sm:max-w-md"
      pie={
        <>
          <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
            Volver
          </Boton>
          <Boton variante={variante} onClick={confirmar} cargando={enviando}>
            {textoConfirmar}
          </Boton>
        </>
      }
    >
      <div className="grid gap-4 text-slate-600">
        {children}
        {error && <Alerta>{error}</Alerta>}
      </div>
    </Modal>
  );
}
