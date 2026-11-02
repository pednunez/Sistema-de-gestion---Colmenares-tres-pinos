import { useEffect, useMemo } from "react";
import { Loader2, QrCode } from "lucide-react";
import { useConsulta } from "../../hooks/useConsulta";
import { colmenasService } from "../../services/colmenasService";

// Descarga la imagen del QR con el token y la muestra como URL local.
export default function ImagenQr({ colmena, className = "w-48", conDescarga = false }) {
  const { datos: blob, cargando, error } = useConsulta(
    () => colmenasService.obtenerImagenQr(colmena.id),
    // Si cambia la etiqueta, se vuelve a pedir la imagen.
    [colmena.id, colmena.codigo_qr]
  );
  // La URL local se deriva de la imagen y se libera cuando cambia o al cerrar.
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);

  if (cargando || (!url && !error)) {
    return (
      <div className={`flex aspect-square items-center justify-center rounded-xl bg-slate-50 ${className}`}>
        <Loader2 className="animate-spin text-slate-400" aria-label="Cargando código QR" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500 ${className}`}>
        <QrCode className="text-slate-300" aria-hidden="true" />
        No se pudo cargar el QR
      </div>
    );
  }

  return (
    <div className="grid justify-items-center gap-2">
      <img src={url} alt={`Código QR de la colmena ${colmena.codigo}`} className={`aspect-square ${className}`} />
      {conDescarga && (
        <a
          href={url}
          download={`QR_${colmena.codigo}.png`}
          className="text-sm font-medium text-amber-700 underline-offset-2 hover:underline print:hidden"
        >
          Descargar imagen
        </a>
      )}
    </div>
  );
}
