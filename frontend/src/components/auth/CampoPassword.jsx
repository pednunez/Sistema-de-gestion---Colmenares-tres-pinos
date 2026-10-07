import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

export default function CampoPassword({ id, etiqueta, valor, onCambiar, autoComplete, placeholder, accion, ayuda }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <div className="label-row">
        <label className="label" htmlFor={id}>
          {etiqueta}
        </label>
        {accion}
      </div>
      <div className="input-wrap">
        <span className="input-icon">
          <Lock size={18} />
        </span>
        <input
          id={id}
          className="input has-toggle"
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={valor}
          onChange={(evento) => onCambiar(evento.target.value)}
          autoComplete={autoComplete}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
        />
        <button
          type="button"
          className="toggle-pass"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {ayuda && (
        <p id={`${id}-ayuda`} className="field-hint">
          {ayuda}
        </p>
      )}
    </div>
  );
}
