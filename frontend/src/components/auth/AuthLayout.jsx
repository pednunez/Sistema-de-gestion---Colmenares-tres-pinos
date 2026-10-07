import { ShieldCheck, ChartNoAxesCombined, Hexagon } from "lucide-react";
import "../../styles/auth.css";

// Marco común de las pantallas sin sesión: login, recuperar y restablecer contraseña.
export default function AuthLayout({ children }) {
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
