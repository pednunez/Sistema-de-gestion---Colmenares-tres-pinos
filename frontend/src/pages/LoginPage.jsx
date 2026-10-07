import { useState } from "react";
import { AlertCircle, CheckCircle2, Info, Mail, ShieldCheck } from "lucide-react";

import AuthLayout from "../components/auth/AuthLayout";
import CampoPassword from "../components/auth/CampoPassword";
import FormularioRecuperar from "../components/auth/FormularioRecuperar";
import { useAuth } from "../hooks/useAuth";
import { esCorreoValido } from "../utils/validacion";

export default function LoginPage({ pantallaInicial = "login", mensajeExito = "" }) {
  const { iniciarSesion, motivoSalida } = useAuth();
  const [pantalla, setPantalla] = useState(pantallaInicial);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Ingresa tu correo electrónico y tu contraseña.");
      return;
    }
    if (!esCorreoValido(email)) {
      setError("Ingresa un correo electrónico válido, por ejemplo nombre@empresa.cl.");
      return;
    }

    setCargando(true);
    try {
      await iniciarSesion(email.trim(), password);
    } catch (err) {
      // 422 aparece cuando la contraseña tiene menos de 8 caracteres: para el usuario es lo mismo.
      setError(
        err.estado === 401 || err.estado === 422 ? "Correo o contraseña incorrectos." : err.message
      );
      setCargando(false);
    }
  }

  if (pantalla === "recuperar") {
    return (
      <AuthLayout>
        <FormularioRecuperar emailInicial={email} onVolver={() => setPantalla("login")} />
      </AuthLayout>
    );
  }

  if (pantalla === "acceso") {
    return (
      <AuthLayout>
        <div className="auth-screen">
          <div className="screen-icon">
            <ShieldCheck size={22} />
          </div>
          <h1 className="screen-title">Información de acceso</h1>
          <p className="screen-desc">
            Las cuentas las crea el administrador desde el módulo Usuarios. Si trabajas en Colmenares Tres Pinos y no
            tienes cuenta, pídesela.
          </p>
          <div className="screen-actions">
            <button type="button" className="btn btn-primary" onClick={() => setPantalla("login")}>
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
          <h1 className="screen-title">Iniciar sesión</h1>
          <p className="screen-desc">Ingresa tus credenciales para acceder al sistema.</p>
        </header>

        <form className="form" onSubmit={enviar} noValidate>
          {mensajeExito && !error && !motivoSalida && (
            <div className="alert alert-success show" role="status">
              <CheckCircle2 size={18} />
              <span>{mensajeExito}</span>
            </div>
          )}

          {motivoSalida && !error && (
            <div className="alert alert-info show" role="status">
              <Info size={18} />
              <span>{motivoSalida}</span>
            </div>
          )}

          {error && (
            <div className="alert alert-error show" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="login-email">
              Correo electrónico
            </label>
            <div className="input-wrap">
              <span className="input-icon">
                <Mail size={18} />
              </span>
              <input
                id="login-email"
                className="input"
                type="email"
                inputMode="email"
                placeholder="nombre@empresa.cl"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <CampoPassword
            id="login-password"
            etiqueta="Contraseña"
            valor={password}
            onCambiar={setPassword}
            autoComplete="current-password"
            placeholder="Ingresa tu contraseña"
            accion={
              <button type="button" className="link-button" onClick={() => setPantalla("recuperar")}>
                ¿Olvidaste tu contraseña?
              </button>
            }
          />

          <button type="submit" className="btn btn-primary" disabled={cargando}>
            {cargando ? (
              <>
                <span className="spinner visible" />
                Ingresando...
              </>
            ) : (
              "Iniciar sesión"
            )}
          </button>
        </form>

        <p className="switch-text">
          ¿Necesitas una cuenta?{" "}
          <button type="button" className="link-button" onClick={() => setPantalla("acceso")}>
            Información de acceso
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
