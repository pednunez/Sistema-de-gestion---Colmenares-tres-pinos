// Mensajes breves de éxito o error tras cada operación (RF-61, RF-62).
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { AvisosContext } from "./contextos";

export function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState([]);
  const contador = useRef(0);

  const cerrar = useCallback((id) => {
    setAvisos((lista) => lista.filter((aviso) => aviso.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo, texto) => {
      contador.current += 1;
      const id = contador.current;
      setAvisos((lista) => [...lista, { id, tipo, texto }]);
      setTimeout(() => cerrar(id), tipo === "error" ? 7000 : 4000);
    },
    [cerrar]
  );

  const valor = useMemo(
    () => ({
      exito: (texto) => mostrar("exito", texto),
      error: (texto) => mostrar("error", texto),
    }),
    [mostrar]
  );

  return (
    <AvisosContext.Provider value={valor}>
      {children}

      <div className="fixed bottom-4 left-4 right-4 z-[60] flex flex-col gap-2 sm:left-auto sm:w-96 print:hidden">
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={`flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ${
              aviso.tipo === "error" ? "border-red-200" : "border-emerald-200"
            }`}
          >
            {aviso.tipo === "error" ? (
              <AlertCircle size={20} className="shrink-0 text-red-600" aria-hidden="true" />
            ) : (
              <CheckCircle2 size={20} className="shrink-0 text-emerald-600" aria-hidden="true" />
            )}
            <p className="flex-1 text-sm text-slate-800">{aviso.texto}</p>
            <button
              type="button"
              onClick={() => cerrar(aviso.id)}
              aria-label="Cerrar aviso"
              className="text-slate-400 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </AvisosContext.Provider>
  );
}
