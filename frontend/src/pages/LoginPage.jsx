import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Info,
  ShieldCheck,
  ChartNoAxesCombined,
  Hexagon,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { esCorreoValido } from "../utils/validacion";
import "../styles/auth.css";

export default function LoginPage() {
  const { iniciarSesion, motivoSalida } = useAuth();
  const [pantalla, setPantalla] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [recordar, setRecordar] = useState(false);
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
      await iniciarSesion(email.trim(), password, recordar);
    } catch (err) {
      // 422 aparece cuando la contraseña tiene menos de 8 caracteres: para el usuario es lo mismo.
      setError(
        err.estado === 401 || err.estado === 422 ? "Correo o contraseña incorrectos." : err.message
      );
      setCargando(false);
    }
  }

  if (pantalla !== "login") {
    const recuperar = pantalla === "recover";
    return (
      <AuthLayout>
        <div className="auth-screen">
          <div className="screen-icon">{recuperar ? <Mail size={22} /> : <ShieldCheck size={22} />}</div>
          <h1 className="screen-title">{recuperar ? "Recuperar contraseña" : "Información de acceso"}</h1>
          <p className="screen-desc">
            {recuperar
              ? "Por ahora, la contraseña se restablece a través del administrador del sistema. Contáctalo para recuperar tu acceso."
              : "Las cuentas las crea el administrador desde el módulo Usuarios. Si trabajas en Colmenares Tres Pinos y no tienes cuenta, pídesela."}
          </p>
          <button type="button" className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setPantalla("login")}>
            Volver a iniciar sesión
          </button>
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
          {motivoSalida && !error && (
            <div className="alert show" role="status" style={{ border: "1px solid #bae6fd", background: "#f0f9ff", color: "#075985" }}>
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

          <div className="field">
            <div className="label-row">
              <label className="label" htmlFor="login-password">
                Contraseña
              </label>
              <button type="button" className="link-button" onClick={() => setPantalla("recover")}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <div className="input-wrap">
              <span className="input-icon">
                <Lock size={18} />
              </span>
              <input
                id="login-password"
                className="input has-toggle"
                type={mostrarPassword ? "text" : "password"}
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-pass"
                onClick={() => setMostrarPassword(!mostrarPassword)}
                aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <label className="check">
            <input type="checkbox" checked={recordar} onChange={(evento) => setRecordar(evento.target.checked)} />
            <span>Mantener sesión iniciada en este dispositivo</span>
          </label>

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
          <button type="button" className="link-button" onClick={() => setPantalla("register")}>
            Información de acceso
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}

function AuthLayout({ children }) {
  return (
    <main className="auth">
      <aside className="brand-panel">
        <div className="brand">
          <div className="logo-auth">
            <Hexagon size={25} />
          </div>
          <div>
            <div className="brand-name">Colmenares Tres Pinos</div>
            <div className="brand-sub">Sistema de Control de Colmenas</div>
          </div>
        </div>

        <div className="brand-hero">
          <h2>
            Gestiona tus colmenas con <span>precisión</span> y datos confiables.
          </h2>
          <p>
            Una plataforma centralizada para registrar, monitorear y consultar la información operacional de los
            apiarios.
          </p>
          <div className="features">
            <Caracteristica
              icono={Hexagon}
              titulo="Control por colmena"
              texto="Inspecciones, tratamientos y trazabilidad en un solo lugar."
            />
            <Caracteristica
              icono={ChartNoAxesCombined}
              titulo="Información centralizada"
              texto="Indicadores claros para apoyar la toma de decisiones."
            />
            <Caracteristica
              icono={ShieldCheck}
              titulo="Acceso seguro"
              texto="Cada persona entra con su propia cuenta y ve solo lo que corresponde a su rol."
            />
          </div>
        </div>

        <div className="brand-footer">© 2026 Colmenares Tres Pinos.</div>
      </aside>

      <section className="form-area">
        <div className="card">{children}</div>
      </section>
    </main>
  );
}

function Caracteristica({ icono: Icono, titulo, texto }) {
  return (
    <div className="feature">
      <div className="feature-icon">
        <Icono size={18} />
      </div>
      <div>
        <strong>{titulo}</strong>
        {texto}
      </div>
    </div>
  );
}
