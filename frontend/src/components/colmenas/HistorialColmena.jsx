import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, ClipboardCheck, History, Pill } from "lucide-react";
import Boton from "../ui/Boton";
import { InsigniaDe } from "../ui/Insignia";
import { Entrada } from "../ui/Campo";
import { Cargando, ErrorCarga } from "../ui/Estados";
import { useDatos } from "../../hooks/useDatos";
import {
  CONTENIDO_MARCO,
  ESTADO_GENERAL_TODOS,
  ESTADO_TRATAMIENTO,
  UBICACION_MARCO,
  texto,
} from "../../utils/etiquetas";
import { formatearFecha, formatearFechaHora, humanizar } from "../../utils/formato";
import { TIPO_EVENTO, armarHistorial, contarPorTipo, filtrarHistorial } from "../../utils/historial";

const ICONO = { INSPECCION: ClipboardCheck, TRATAMIENTO: Pill, TRANSFERENCIA: ArrowRightLeft, OTRO: History };
const FILTROS = ["TODOS", "INSPECCION", "TRATAMIENTO", "TRANSFERENCIA"];

// Historial de la colmena con filtros por tipo y fecha (PB-12). Cada evento
// muestra su detalle y, si corresponde, abre la inspección completa.
export default function HistorialColmena({ colmenaId, consulta, onVerInspeccion }) {
  const { datos } = useDatos();
  const [tipo, setTipo] = useState("TODOS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const eventos = useMemo(() => armarHistorial(consulta.datos, datos, colmenaId), [consulta.datos, datos, colmenaId]);
  const conteo = contarPorTipo(eventos);
  const visibles = filtrarHistorial(eventos, { tipo, desde, hasta });
  const hayFiltros = tipo !== "TODOS" || desde || hasta;

  const inspecciones = useMemo(() => new Map(datos.inspecciones.map((i) => [i.id, i])), [datos.inspecciones]);
  const abrirInspeccion = (id) => {
    const inspeccion = inspecciones.get(id);
    if (inspeccion) onVerInspeccion(inspeccion);
  };

  return (
    <section aria-labelledby="titulo-historial" className="mt-8">
      <h3 id="titulo-historial" className="mb-3 font-semibold text-slate-900">
        Historial
      </h3>

      <div className="mb-4 grid gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Tipo de evento">
          {FILTROS.map((valor) => {
            const activo = tipo === valor;
            const nombre = valor === "TODOS" ? "Todos" : TIPO_EVENTO[valor].texto;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setTipo(valor)}
                className={`min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  activo
                    ? "border-amber-400 bg-amber-400 text-slate-950"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {nombre} ({conteo[valor] ?? 0})
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Entrada
            etiqueta="Desde"
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
          />
          <Entrada
            etiqueta="Hasta"
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        {hayFiltros && (
          <div>
            <Boton
              variante="fantasma"
              tamano="sm"
              onClick={() => {
                setTipo("TODOS");
                setDesde("");
                setHasta("");
              }}
            >
              Limpiar filtros
            </Boton>
          </div>
        )}
      </div>

      {consulta.cargando && eventos.length === 0 && <Cargando texto="Cargando historial..." />}
      {consulta.error && eventos.length === 0 && (
        <ErrorCarga mensaje={consulta.error} onReintentar={consulta.recargar} />
      )}
      {!consulta.cargando && eventos.length === 0 && !consulta.error && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Esta colmena todavía no tiene actividad registrada.
        </p>
      )}
      {eventos.length > 0 && visibles.length === 0 && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No hay eventos con estos filtros.</p>
      )}

      {visibles.length > 0 && (
        <ol className="relative ml-3 border-l border-slate-200">
          {visibles.map((evento) => (
            <Evento
              key={evento.clave}
              evento={evento}
              existeInspeccion={(id) => inspecciones.has(id)}
              onVerInspeccion={abrirInspeccion}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function Evento({ evento, existeInspeccion, onVerInspeccion }) {
  const { codigoColmena } = useDatos();
  const { registro } = evento;
  let Icono = ICONO[evento.tipo];
  let titulo = TIPO_EVENTO[evento.tipo].singular;
  let insignia = null;
  let lineas = [];
  let inspeccionId = null;

  if (registro && evento.tipo === "INSPECCION") {
    insignia = <InsigniaDe mapa={ESTADO_GENERAL_TODOS} valor={registro.estado_general} porDefecto="Sin estado" />;
    const marcos = registro.cantidad_marcos ?? null;
    const transferidos = (registro.marcos ?? []).filter((m) => m.transferido_a_colmena_id).length;
    lineas = [
      marcos !== null && `${marcos} ${marcos === 1 ? "marco" : "marcos"}${registro.tiene_alza ? " · con alza" : ""}`,
      transferidos > 0 && `${transferidos} ${transferidos === 1 ? "marco transferido" : "marcos transferidos"}`,
      registro.observaciones,
    ];
    inspeccionId = registro.id;
  } else if (registro && evento.tipo === "TRATAMIENTO") {
    titulo = `Tratamiento: ${humanizar(registro.tipo_tratamiento)}`;
    insignia = <InsigniaDe mapa={ESTADO_TRATAMIENTO} valor={registro.estado} />;
    lineas = [
      [registro.producto, registro.dosis].filter(Boolean).join(" · "),
      `Desde ${formatearFecha(registro.fecha_inicio)}${registro.fecha_fin ? ` hasta ${formatearFecha(registro.fecha_fin)}` : ""}`,
    ];
    inspeccionId = registro.inspeccion_id ?? null;
  } else if (registro && evento.tipo === "TRANSFERENCIA") {
    const sale = evento.direccion === "SALIDA";
    Icono = sale ? ArrowUpRight : ArrowDownLeft;
    titulo = sale
      ? `Salida de ${registro.cantidad_marcos === 1 ? "marco" : `${registro.cantidad_marcos} marcos`} hacia ${codigoColmena(evento.otraColmenaId)}`
      : `Llegada de ${registro.cantidad_marcos === 1 ? "marco" : `${registro.cantidad_marcos} marcos`} desde ${codigoColmena(evento.otraColmenaId)}`;
    lineas = [
      [
        registro.contenido && texto(CONTENIDO_MARCO, registro.contenido),
        registro.ubicacion &&
          `${texto(UBICACION_MARCO, registro.ubicacion)}${registro.numero_marco ? `, marco ${registro.numero_marco}` : ""}`,
      ]
        .filter(Boolean)
        .join(" · "),
      registro.motivo,
    ];
    inspeccionId = registro.inspeccion_id ?? null;
  } else if (evento.detalleServidor) {
    lineas = [humanizar(evento.detalleServidor)];
  }

  return (
    <li className="mb-5 ml-6">
      <span className="absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-4 ring-white">
        <Icono size={14} aria-hidden="true" />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-slate-900">{titulo}</p>
        {insignia}
      </div>
      <p className="text-xs text-slate-500">{formatearFechaHora(evento.fecha)}</p>
      {lineas.filter(Boolean).map((linea, i) => (
        <p key={i} className="mt-1 text-sm text-slate-600">
          {linea}
        </p>
      ))}
      {inspeccionId && existeInspeccion(inspeccionId) && (
        <Boton
          variante="fantasma"
          tamano="sm"
          className="mt-1 -ml-3"
          aria-label={`Ver la inspección del ${formatearFecha(evento.fecha)}`}
          onClick={() => onVerInspeccion(inspeccionId)}
        >
          {evento.tipo === "INSPECCION" ? "Ver detalle" : "Ver inspección"}
        </Boton>
      )}
    </li>
  );
}
