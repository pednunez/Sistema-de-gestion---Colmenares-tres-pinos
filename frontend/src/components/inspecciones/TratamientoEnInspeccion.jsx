import { useId, useMemo } from "react";
import { Pill } from "lucide-react";
import { AreaTexto, Entrada, Segmentado } from "../ui/Campo";
import { useDatos } from "../../hooks/useDatos";
import { ESTADO_TRATAMIENTO } from "../../utils/etiquetas";
import { hoyISO, humanizar } from "../../utils/formato";

const OPCIONES_REGISTRAR = [
  { valor: true, texto: "Sí, registrar" },
  { valor: false, texto: "No" },
];
const OPCIONES_ESTADO = ["EN_CURSO", "FINALIZADO"].map((valor) => ({ valor, texto: ESTADO_TRATAMIENTO[valor].texto }));

// Registrar un tratamiento desde la inspección cuando hay signos de enfermedad.
// Queda en Tratamientos asociado a esta inspección.
export default function TratamientoEnInspeccion({ registrar, tratamiento, tiras, error, onRegistrar, onCambiar }) {
  const idSugerencias = useId();
  const { datos } = useDatos();
  const tiposUsados = useMemo(
    () => [...new Set(datos.tratamientos.map((t) => humanizar(t.tipo_tratamiento)))].sort(),
    [datos.tratamientos]
  );
  const cambiar = (campo, valor) => onCambiar({ ...tratamiento, [campo]: valor });

  return (
    <div
      data-invalido={error ? "true" : undefined}
      className={`grid gap-4 rounded-2xl border p-4 ${error ? "border-red-400 bg-red-50/40" : "border-slate-200"}`}
    >
      <Segmentado
        etiqueta="¿Se aplicó un tratamiento?"
        opciones={OPCIONES_REGISTRAR}
        valor={registrar}
        onCambiar={onRegistrar}
        className="sm:max-w-sm"
      />

      {registrar && (
        <>
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <Pill size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
            Se registra en Tratamientos con fecha de hoy y asociado a esta inspección.
          </p>
          <Entrada
            etiqueta="Tipo de tratamiento"
            requerido
            value={tratamiento.tipo_tratamiento}
            onChange={(e) => cambiar("tipo_tratamiento", e.target.value)}
            error={error}
            list={idSugerencias}
            placeholder="Por ejemplo: Control de varroa"
            maxLength={100}
          />
          <datalist id={idSugerencias}>
            {tiposUsados.map((tipo) => (
              <option key={tipo} value={tipo} />
            ))}
          </datalist>
          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              etiqueta="Producto"
              value={tratamiento.producto}
              onChange={(e) => cambiar("producto", e.target.value)}
              maxLength={150}
            />
            <Entrada
              etiqueta="Dosis"
              value={tratamiento.dosis}
              onChange={(e) => cambiar("dosis", e.target.value)}
              placeholder={tiras ? `${tiras} ${tiras === 1 ? "tira" : "tiras"}` : undefined}
              ayuda={tiras ? "Si la dejas vacía, se usan las tiras indicadas arriba." : undefined}
              maxLength={100}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmentado
              etiqueta="Estado"
              opciones={OPCIONES_ESTADO}
              valor={tratamiento.estado}
              onCambiar={(valor) => cambiar("estado", valor)}
            />
            <Entrada
              etiqueta="Fecha de término"
              type="date"
              min={hoyISO()}
              value={tratamiento.fecha_fin}
              onChange={(e) => cambiar("fecha_fin", e.target.value)}
              ayuda={tratamiento.estado === "FINALIZADO" ? "Si la dejas vacía, se usa la fecha de hoy." : "Opcional."}
            />
          </div>
          <AreaTexto
            etiqueta="Observaciones del tratamiento"
            value={tratamiento.observaciones}
            onChange={(e) => cambiar("observaciones", e.target.value)}
            maxLength={500}
          />
        </>
      )}
    </div>
  );
}
