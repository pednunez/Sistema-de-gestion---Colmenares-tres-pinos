import { useState } from "react";
import { AlertCircle, Mail, MailCheck } from "lucide-react";
import { authService } from "../../services/authService";
import { esCorreoValido } from "../../utils/validacion";

// RF-03: el usuario ingresa su correo y el backend le envía un enlace para
// crear una contraseña nueva.
export default function FormularioRecuperar({ emailInicial = "", onVolver }) {
  const [email, setEmail] = useState(emailInicial);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviadoA, setEnviadoA] = useState("");

  async function enviar(evento) {
    evento.preventDefault();
    setError("");

    const correo = email.trim().toLowerCase();
    if (!esCorreoValido(correo)) {
      setError("Ingresa un correo electrónico válido, por ejemplo nombre@empresa.cl.");
      return;
    }

    setEnviando(true);
    try {
      await authService.solicitarRecuperacion(correo);
      setEnviadoA(correo);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  // El backend no revela si el correo existe, así que el mensaje es siempre el mismo.
  if (enviadoA) {
    return (
      <div className="auth-screen">
        <div className="screen-icon">
          <MailCheck size={22} />
        </div>
        <h1 className="screen-title">Revisa tu correo</h1>
        <p className="screen-desc">
          Si <strong>{enviadoA}</strong> está registrado, en unos minutos recibirás un enlace para crear una contraseña
          nueva. El enlace sirve una sola vez y vence en 15 minutos.
        </p>
        <p className="screen-desc">
          Si no llega, revisa la carpeta de correo no deseado. Para pedir otro enlace, espera al menos un minuto.
        </p>
        <div className="screen-actions">
          <button type="button" className="btn btn-primary" onClick={onVolver}>
            Volver a iniciar sesión
          </button>
          <button type="button" className="link-button" onClick={() => setEnviadoA("")}>
            Usar otro correo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <header className="screen-header">
        <h1 className="screen-title">Recuperar contraseña</h1>
        <p className="screen-desc">
          Ingresa el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
        </p>
      </header>

      <form className="form" onSubmit={enviar} noValidate>
        {error && (
          <div className="alert alert-error show" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="recuperar-email">
            Correo electrónico
          </label>
          <div className="input-wrap">
            <span className="input-icon">
              <Mail size={18} />
            </span>
            <input
              id="recuperar-email"
              className="input"
              type="email"
              inputMode="email"
              placeholder="nombre@empresa.cl"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={enviando}>
          {enviando ? (
            <>
              <span className="spinner visible" />
              Enviando...
            </>
          ) : (
            "Enviar enlace"
          )}
        </button>
      </form>

      <p className="switch-text">
        <button type="button" className="link-button" onClick={onVolver}>
          Volver a iniciar sesión
        </button>
      </p>
    </div>
  );
}
