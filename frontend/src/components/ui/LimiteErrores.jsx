import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { codigoCorto, nuevoCorrelationId, registrarError } from "../../services/registroErrores";

// Atrapa los errores de la interfaz para que una falla en una pantalla no deje
// la aplicación en blanco. Registra el error con un código que el usuario
// puede reportar.
export default class LimiteErrores extends Component {
  constructor(props) {
    super(props);
    this.state = { codigo: null };
  }

  static getDerivedStateFromError() {
    return { codigo: nuevoCorrelationId() };
  }

  componentDidCatch(error, info) {
    registrarError({
      tipo: "UI",
      mensaje: error?.message ?? String(error),
      correlationId: this.state.codigo,
      componente: info?.componentStack?.trim().split("\n")[0],
    });
  }

  render() {
    if (!this.state.codigo) return this.props.children;

    const pantallaCompleta = this.props.pantallaCompleta;
    return (
      <div
        role="alert"
        className={`flex items-center justify-center p-6 ${pantallaCompleta ? "min-h-screen bg-slate-100" : "py-16"}`}
      >
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <AlertTriangle size={36} className="mx-auto mb-3 text-amber-500" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-900">Esta pantalla tuvo un problema</h2>
          <p className="mt-2 text-sm text-slate-600">
            Vuelve a cargarla. Si el problema sigue, informa este código de seguimiento:{" "}
            <strong className="font-mono">{codigoCorto(this.state.codigo)}</strong>
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-slate-950 hover:bg-amber-500"
          >
            <RotateCcw size={17} aria-hidden="true" />
            Volver a cargar
          </button>
        </div>
      </div>
    );
  }
}
