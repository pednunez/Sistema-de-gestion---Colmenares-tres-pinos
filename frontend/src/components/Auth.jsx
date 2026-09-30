import { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Check,
  ShieldCheck,
  ChartNoAxesCombined,
  Hexagon,
} from "lucide-react";

import "../styles/auth.css";

const API_URL = "http://127.0.0.1:8000";

function Auth({ onLogin }) {
  const [pantalla, setPantalla] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [recordar, setRecordar] = useState(false);

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(event) {
    event.preventDefault();

    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Debes ingresar correo electrónico y contraseña.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    setCargando(true);

    try {
      const respuesta = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!respuesta.ok) {
        throw new Error("Correo o contraseña incorrectos.");
      }

      const datos = await respuesta.json();

      const token = datos.access_token;

      const usuarioResponse = await fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!usuarioResponse.ok) {
        throw new Error("No fue posible obtener la información del usuario.");
      }

      const usuario = await usuarioResponse.json();

      if (recordar) {
        localStorage.setItem("access_token", token);
      } else {
        sessionStorage.setItem("access_token", token);
      }

      onLogin({
        token,
        usuario,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  if (pantalla === "recover") {
    return (
      <AuthLayout>
        <div className="auth-screen">
          <div className="screen-icon">
            <Mail size={22} />
          </div>

          <h1 className="screen-title">
            Recuperar contraseña
          </h1>

          <p className="screen-desc">
            Esta función se habilitará cuando el backend de recuperación
            de contraseña esté implementado.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPantalla("login")}
          >
            Volver a iniciar sesión
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (pantalla === "register") {
    return (
      <AuthLayout>
        <div className="auth-screen">
          <div className="screen-icon">
            <ShieldCheck size={22} />
          </div>

          <h1 className="screen-title">
            Creación de usuarios
          </h1>

          <p className="screen-desc">
            La creación de cuentas está reservada para usuarios con rol
            ADMIN. Se realizará desde el módulo Usuarios después de iniciar
            sesión.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPantalla("login")}
          >
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
          <h1 className="screen-title">
            Iniciar sesión
          </h1>

          <p className="screen-desc">
            Ingresa tus credenciales para acceder al sistema.
          </p>
        </header>

        <form
          className="form"
          onSubmit={iniciarSesion}
          noValidate
        >
          {error && (
            <div className="alert alert-error show">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="field">
            <label className="label">
              Correo electrónico
            </label>

            <div className="input-wrap">
              <span className="input-icon">
                <Mail size={18} />
              </span>

              <input
                className="input"
                type="email"
                placeholder="nombre@empresa.cl"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="email"
              />
            </div>
          </div>

          <div className="field">
            <div className="label-row">
              <label className="label">
                Contraseña
              </label>

              <button
                type="button"
                className="link-button"
                onClick={() =>
                  setPantalla("recover")
                }
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <div className="input-wrap">
              <span className="input-icon">
                <Lock size={18} />
              </span>

              <input
                className="input has-toggle"
                type={
                  mostrarPassword
                    ? "text"
                    : "password"
                }
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
              />

              <button
                type="button"
                className="toggle-pass"
                onClick={() =>
                  setMostrarPassword(
                    !mostrarPassword
                  )
                }
                aria-label={
                  mostrarPassword
                    ? "Ocultar contraseña"
                    : "Mostrar contraseña"
                }
              >
                {mostrarPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(event) =>
                setRecordar(
                  event.target.checked
                )
              }
            />

            <span>
              Mantener sesión iniciada
            </span>
          </label>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={cargando}
          >
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
          <button
            type="button"
            className="link-button"
            onClick={() =>
              setPantalla("register")
            }
          >
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
            <div className="brand-name">
              Colmenares Tres Pinos
            </div>

            <div className="brand-sub">
              Sistema de Control de Colmenas
            </div>
          </div>
        </div>

        <div className="brand-hero">
          <h2>
            Gestiona tus colmenas con{" "}
            <span>precisión</span> y datos confiables.
          </h2>

          <p>
            Una plataforma centralizada para registrar,
            monitorear y consultar la información operacional
            de los apiarios.
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
              texto="Autenticación mediante JWT y usuarios con roles definidos."
            />
          </div>
        </div>

        <div className="brand-footer">
          © 2026 Colmenares Tres Pinos.
        </div>
      </aside>

      <section className="form-area">
        <div className="card">
          {children}
        </div>
      </section>
    </main>
  );
}

function Caracteristica({
  icono: Icon,
  titulo,
  texto,
}) {
  return (
    <div className="feature">
      <div className="feature-icon">
        <Icon size={18} />
      </div>

      <div>
        <strong>{titulo}</strong>
        {texto}
      </div>
    </div>
  );
}

export default Auth;