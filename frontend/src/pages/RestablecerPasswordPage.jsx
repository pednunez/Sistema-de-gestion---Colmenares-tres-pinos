import { useState } from "react";
import { AlertCircle, Link2Off } from "lucide-react";

import AuthLayout from "../components/auth/AuthLayout";
import CampoPassword from "../components/auth/CampoPassword";
import { authService } from "../services/authService";

const LARGO_MINIMO = 8;
const LARGO_MAXIMO = 128;

// RF-03: pantalla a la que llega el usuario desde el enlace del correo
// (/restablecer-password?token=...).
export default function RestablecerPasswordPage({ token, onListo, onPedirOtroEnlace, onIrAlLogin }) {
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enlaceInvalido, setEnlaceInvalido] = useState(!token);

  async function enviar(evento) {
    evento.preventDefault();
    setError("");

    if (nueva.length < LARGO_MINIMO) {
      setError(`La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`);
      return;
    }
    if (nueva.length > LARGO_MAXIMO) {
      setError(`La contraseña no puede superar los ${LARGO_MAXIMO} caracteres.`);
      return;
    }
    if (nueva !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setEnviando(true);
    try {
      await authService.restablecerPassword(token, nueva, confirmacion);
      onListo();
    } catch (err) {
      // 400: el enlace venció o ya se usó. 422 con detalle en lista: el token no tiene el formato esperado.
      if (err.estado === 400 || (err.estado === 422 && Array.isArray(err.detalle) && err.detalle[0]?.type !== "value_error")) {
        setEnlaceInvalido(true);
      } else {
        setError(err.message);
      }
      setEnviando(false);
    }
  }

  if (enlaceInvalido) {
    return (
      <AuthLayout>
        <div className="auth-screen">
          <div className="screen-icon">
            <Link2Off size={22} />
          </div>
          <h1 className="screen-title">Este enlace ya no sirve</h1>
          <p className="screen-desc">
            El enlace venció o ya fue utilizado. Cada enlace dura 15 minutos y sirve una sola vez. Solicita uno nuevo
            para cambiar tu contraseña.
          </p>
          <div className="screen-actions">
            <button type="button" className="btn btn-primary" onClick={onPedirOtroEnlace}>
              Solicitar un enlace nuevo
            </button>
            <button type="button" className="link-button" onClick={onIrAlLogin}>
              Volver a iniciar sesión
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="auth-screen">
        <header className="screen-header">
          <h1 className="screen-title">Crear contraseña nueva</h1>
          <p className="screen-desc">
            Al guardarla se cerrarán las sesiones abiertas de tu cuenta y tendrás que ingresar con la contraseña nueva.
          </p>
        </header>

        <form className="form" onSubmit={enviar} noValidate>
          {error && (
            <div className="alert alert-error show" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <CampoPassword
            id="nueva-password"
            etiqueta="Contraseña nueva"
            valor={nueva}
            onCambiar={setNueva}
            autoComplete="new-password"
            ayuda={`Mínimo ${LARGO_MINIMO} caracteres.`}
          />

          <CampoPassword
            id="confirmar-password"
            etiqueta="Repetir contraseña"
            valor={confirmacion}
            onCambiar={setConfirmacion}
            autoComplete="new-password"
          />

          <button type="submit" className="btn btn-primary" disabled={enviando}>
            {enviando ? (
              <>
                <span className="spinner visible" />
                Guardando...
              </>
            ) : (
              "Guardar contraseña"
            )}
          </button>
        </form>

        <p className="switch-text">
          <button type="button" className="link-button" onClick={onIrAlLogin}>
            Volver a iniciar sesión
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
