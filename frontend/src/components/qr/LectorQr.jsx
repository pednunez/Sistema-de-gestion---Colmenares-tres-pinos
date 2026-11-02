import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import Boton from "../ui/Boton";
import { Entrada } from "../ui/Campo";
import { extraerCodigoQr, lectorDisponible } from "../../utils/qr";

// Lee una etiqueta QR con la cámara (si el navegador lo permite) o deja
// escribir o pegar el código. Llama a onLeido con el código (UUID) encontrado.
export default function LectorQr({ onLeido, ocupado = false }) {
  const video = useRef(null);
  const [camara, setCamara] = useState(lectorDisponible() ? "apagada" : "no_disponible");
  const [manual, setManual] = useState("");
  const [errorManual, setErrorManual] = useState("");
  const leidoRef = useRef(onLeido);

  useEffect(() => {
    leidoRef.current = onLeido;
  });

  useEffect(() => {
    if (camara !== "encendida") return undefined;
    let activo = true;
    let flujo = null;
    let temporizador = null;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    const buscar = async () => {
      if (!activo || !video.current) return;
      try {
        const [codigo] = await detector.detect(video.current);
        const uuid = extraerCodigoQr(codigo?.rawValue);
        if (uuid && activo) {
          activo = false;
          leidoRef.current(uuid);
          return;
        }
      } catch {
        // El cuadro todavía no está listo: se vuelve a intentar.
      }
      temporizador = setTimeout(buscar, 300);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        flujo = stream;
        if (!activo) return;
        video.current.srcObject = stream;
        return video.current.play().then(buscar);
      })
      .catch(() => activo && setCamara("sin_permiso"));

    return () => {
      activo = false;
      clearTimeout(temporizador);
      flujo?.getTracks().forEach((pista) => pista.stop());
    };
  }, [camara]);

  const enviarManual = (evento) => {
    evento.preventDefault();
    const uuid = extraerCodigoQr(manual);
    if (!uuid) {
      setErrorManual("No parece un código QR del sistema. Copia el texto completo de la etiqueta.");
      return;
    }
    setErrorManual("");
    onLeido(uuid);
  };

  return (
    <div className="grid gap-4">
      {camara === "encendida" && (
        <div className="overflow-hidden rounded-2xl bg-slate-900">
          <video
            ref={video}
            className="aspect-square w-full object-cover"
            muted
            playsInline
            aria-label="Vista de la cámara"
          />
        </div>
      )}
      {camara === "apagada" && (
        <Boton icono={Camera} onClick={() => setCamara("encendida")}>
          Usar la cámara
        </Boton>
      )}
      {camara === "encendida" && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Apunta la cámara a la etiqueta QR de la caja.</span>
          <Boton variante="secundario" tamano="sm" icono={CameraOff} onClick={() => setCamara("apagada")}>
            Apagar
          </Boton>
        </div>
      )}
      {camara === "sin_permiso" && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No se pudo abrir la cámara. Revisa el permiso del navegador o escribe el código.
        </p>
      )}
      {camara === "no_disponible" && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Este navegador no lee QR con la cámara. Escanea la etiqueta con la cámara del celular o escribe el código.
        </p>
      )}

      <form onSubmit={enviarManual} noValidate className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <Entrada
          etiqueta="Código de la etiqueta"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          error={errorManual}
          placeholder="Pega la dirección o el código del QR"
          autoComplete="off"
        />
        <Boton type="submit" variante="secundario" cargando={ocupado}>
          Buscar
        </Boton>
      </form>
    </div>
  );
}
