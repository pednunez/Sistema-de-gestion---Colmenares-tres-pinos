import { useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Layers } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import Alerta from "../ui/Alerta";
import { Entrada, Seleccion } from "../ui/Campo";
import { useDatos } from "../../hooks/useDatos";
import { colmenasService } from "../../services/colmenasService";
import { hoyISO } from "../../utils/formato";
import {
  MARCOS_POR_DEFECTO,
  MAXIMO_POR_LOTE,
  crearEnLote,
  generarCodigos,
  limpiarPrefijo,
  prefijoSugerido,
  siguienteNumero,
  validarLote,
} from "../../utils/colmenasEnLote";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Crear varias colmenas de una vez en un apiario (carga inicial, S5-T11).
// Solo para el administrador. Los códigos son correlativos: POP-001, POP-002…
export default function FormularioColmenasLote({ apiarioInicial, onTerminar, onCerrar }) {
  const idFormulario = useId();
  const { datos, nombreApiario } = useDatos();
  const codigosExistentes = useMemo(() => datos.colmenas.map((c) => c.codigo), [datos.colmenas]);

  const inicial = () => {
    const apiario = datos.apiarios.find((a) => String(a.id) === String(apiarioInicial ?? ""));
    const prefijo = apiario ? prefijoSugerido(apiario.nombre) : "";
    return {
      apiario_id: apiario ? String(apiario.id) : "",
      prefijo,
      desde: String(siguienteNumero(prefijo, codigosExistentes)),
      cantidad: "",
      cantidad_marcos: String(MARCOS_POR_DEFECTO),
      fecha_instalacion: "",
    };
  };
  const [valores, setValores] = useState(inicial);
  const [errores, setErrores] = useState({});
  const [etapa, setEtapa] = useState("formulario"); // formulario | creando | listo
  const [avance, setAvance] = useState({ listas: 0, total: 0 });
  const [resultado, setResultado] = useState(null);
  const detener = useRef(false);

  const cambiar = (campo, valor) => {
    setErrores((previos) => ({ ...previos, [campo]: "" }));
    setValores((previos) => {
      const nuevos = { ...previos, [campo]: valor };
      // Al elegir el apiario se sugiere el prefijo y el siguiente número libre.
      if (campo === "apiario_id") {
        const apiario = datos.apiarios.find((a) => String(a.id) === valor);
        nuevos.prefijo = apiario ? prefijoSugerido(apiario.nombre) : "";
        nuevos.desde = String(siguienteNumero(nuevos.prefijo, codigosExistentes));
      }
      if (campo === "prefijo") {
        nuevos.prefijo = limpiarPrefijo(valor).slice(0, 10);
        nuevos.desde = String(siguienteNumero(nuevos.prefijo, codigosExistentes));
      }
      return nuevos;
    });
  };

  const cantidad = Number(valores.cantidad);
  const desde = Number(valores.desde);
  const listoParaVer = valores.prefijo && Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= MAXIMO_POR_LOTE && desde >= 1;
  const codigos = useMemo(
    () => (listoParaVer ? generarCodigos({ prefijo: valores.prefijo, desde, cantidad }) : []),
    [listoParaVer, valores.prefijo, desde, cantidad]
  );
  const ocupados = useMemo(() => {
    const existentes = new Set(codigosExistentes.map((c) => c.toUpperCase()));
    return codigos.filter((c) => existentes.has(c));
  }, [codigos, codigosExistentes]);

  const fechaFutura = valores.fecha_instalacion && valores.fecha_instalacion > hoyISO();

  const enviar = async (evento) => {
    evento.preventDefault();
    const encontrados = Object.fromEntries(Object.entries(validarLote(valores)).filter(([, v]) => v));
    if (fechaFutura) encontrados.fecha_instalacion = "La fecha de instalación no puede ser futura.";
    if (Object.keys(encontrados).length) {
      setErrores(encontrados);
      return;
    }
    const lista = codigos
      .filter((codigo) => !ocupados.includes(codigo))
      .map((codigo) => ({
        apiario_id: Number(valores.apiario_id),
        codigo,
        estado: "ACTIVA",
        cantidad_marcos: Number(valores.cantidad_marcos),
        fecha_instalacion: valores.fecha_instalacion || null,
      }));
    detener.current = false;
    setAvance({ listas: 0, total: lista.length });
    setEtapa("creando");
    const final = await crearEnLote(lista, colmenasService.crear, {
      onAvance: (listas, total) => setAvance({ listas, total }),
      detenido: () => detener.current,
    });
    final.omitidas = [...ocupados, ...final.omitidas];
    setResultado(final);
    setEtapa("listo");
    if (final.creadas.length) await onTerminar(final);
  };

  const apiario = nombreApiario(Number(valores.apiario_id));
  const porcentaje = avance.total ? Math.round((avance.listas * 100) / avance.total) : 0;

  // Mientras se crean, cerrar el diálogo solo detiene la carga.
  const cerrar = etapa === "creando" ? () => (detener.current = true) : onCerrar;

  return (
    <Modal
      titulo="Crear colmenas en lote"
      descripcion="Para la carga inicial de un apiario: crea varias colmenas activas con códigos correlativos."
      onCerrar={cerrar}
      pie={
        etapa === "formulario" ? (
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton type="submit" form={idFormulario} icono={Layers} disabled={listoParaVer && codigos.length === ocupados.length}>
              {listoParaVer ? `Crear ${plural(codigos.length - ocupados.length, "colmena", "colmenas")}` : "Crear colmenas"}
            </Boton>
          </>
        ) : etapa === "creando" ? (
          <Boton variante="secundario" onClick={() => (detener.current = true)}>
            Detener
          </Boton>
        ) : (
          <Boton onClick={onCerrar}>Cerrar</Boton>
        )
      }
    >
      {etapa === "formulario" && (
        <form id={idFormulario} onSubmit={enviar} noValidate className="grid gap-4">
          <Seleccion
            etiqueta="Apiario"
            requerido
            value={valores.apiario_id}
            onChange={(e) => cambiar("apiario_id", e.target.value)}
            error={errores.apiario_id}
            placeholder="Selecciona un apiario"
            opciones={[...datos.apiarios]
              .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
              .map((a) => ({ valor: String(a.id), texto: a.nombre }))}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Entrada
              etiqueta="Prefijo del código"
              requerido
              value={valores.prefijo}
              onChange={(e) => cambiar("prefijo", e.target.value)}
              error={errores.prefijo}
              autoCapitalize="characters"
              maxLength={10}
            />
            <Entrada
              etiqueta="Desde el número"
              requerido
              type="number"
              min={1}
              value={valores.desde}
              onChange={(e) => cambiar("desde", e.target.value)}
              error={errores.desde}
            />
            <Entrada
              etiqueta="Cantidad"
              requerido
              type="number"
              min={1}
              max={MAXIMO_POR_LOTE}
              value={valores.cantidad}
              onChange={(e) => cambiar("cantidad", e.target.value)}
              error={errores.cantidad}
              ayuda={`Hasta ${MAXIMO_POR_LOTE} por vez.`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              etiqueta="Marcos por colmena"
              type="number"
              min={0}
              max={20}
              value={valores.cantidad_marcos}
              onChange={(e) => cambiar("cantidad_marcos", e.target.value)}
              error={errores.cantidad_marcos}
            />
            <Entrada
              etiqueta="Fecha de instalación"
              type="date"
              max={hoyISO()}
              value={valores.fecha_instalacion}
              onChange={(e) => cambiar("fecha_instalacion", e.target.value)}
              error={errores.fecha_instalacion}
              ayuda="Opcional."
            />
          </div>

          {listoParaVer && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-slate-700" aria-live="polite">
              <p className="font-semibold text-slate-900">
                Se crearán {plural(codigos.length - ocupados.length, "colmena activa", "colmenas activas")}
                {apiario && valores.apiario_id ? ` en ${apiario}` : ""}
              </p>
              <p className="mt-1">
                Códigos {codigos[0]} a {codigos.at(-1)} · {plural(Number(valores.cantidad_marcos) || 0, "marco", "marcos")} cada una.
              </p>
              {ocupados.length > 0 && (
                <p className="mt-2 text-amber-900">
                  {plural(ocupados.length, "código ya existe", "códigos ya existen")} y se omitirá
                  {ocupados.length === 1 ? "" : "n"}: {ocupados.slice(0, 6).join(", ")}
                  {ocupados.length > 6 ? "…" : ""}
                </p>
              )}
              <p className="mt-2 text-slate-500">
                Sus marcos por posición se registran en la primera inspección de cada colmena.
              </p>
            </div>
          )}
        </form>
      )}

      {etapa === "creando" && (
        <div className="grid gap-3" aria-live="polite">
          <p className="text-sm text-slate-700">
            Creando colmenas en {apiario}: {avance.listas} de {avance.total}. No cierres esta ventana.
          </p>
          <div
            role="progressbar"
            aria-label="Avance de la creación"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentaje}
            className="h-3 overflow-hidden rounded-full bg-slate-100"
          >
            <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${porcentaje}%` }} />
          </div>
        </div>
      )}

      {etapa === "listo" && resultado && (
        <div className="grid gap-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-900">
            <CheckCircle2 size={18} className="text-emerald-600" aria-hidden="true" />
            {plural(resultado.creadas.length, "colmena creada", "colmenas creadas")} en {apiario}.
          </p>
          {resultado.detenido && <Alerta tipo="aviso">La carga se detuvo antes de terminar.</Alerta>}
          {resultado.omitidas.length > 0 && (
            <p className="text-slate-600">
              {plural(resultado.omitidas.length, "código omitido porque ya existía", "códigos omitidos porque ya existían")}:{" "}
              {resultado.omitidas.slice(0, 8).join(", ")}
              {resultado.omitidas.length > 8 ? "…" : ""}
            </p>
          )}
          {resultado.errores.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
              <p className="flex items-center gap-2 font-medium">
                <CircleAlert size={16} aria-hidden="true" />
                {plural(resultado.errores.length, "colmena no se pudo crear", "colmenas no se pudieron crear")}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {resultado.errores.slice(0, 5).map((e) => (
                  <li key={e.codigo}>
                    {e.codigo}: {e.mensaje}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Puedes volver a crear el lote: los códigos que ya existen se omiten.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
