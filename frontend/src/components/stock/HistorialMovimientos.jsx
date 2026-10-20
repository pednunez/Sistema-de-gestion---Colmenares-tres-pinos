import { useState } from "react";
import { History } from "lucide-react";
import Insignia from "../ui/Insignia";
import Paginador from "../ui/Paginador";
import { Entrada, Seleccion } from "../ui/Campo";
import { Cargando, ErrorCarga, EstadoVacio } from "../ui/Estados";
import { Panel } from "../ui/Estructura";
import { useDatos } from "../../hooks/useDatos";
import { useMovimientosStock } from "../../hooks/useMovimientosStock";
import { MATERIAL_STOCK, TIPO_MOVIMIENTO_STOCK, opciones, texto, tono } from "../../utils/etiquetas";
import { formatearFechaHora } from "../../utils/formato";

const POR_PAGINA = 20;
const SIN_FILTROS = { material: "", tipo: "", desde: "", hasta: "" };

// Historial de movimientos de stock, el más reciente primero.
// "version" cambia después de registrar un movimiento para volver a consultar.
export default function HistorialMovimientos({ version }) {
  const { nombreApiario, codigoColmena, nombreUsuario } = useDatos();
  const [filtros, setFiltros] = useState(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  const { movimientos, haySiguiente, noDisponible, cargando, error, recargar } = useMovimientosStock({
    filtros,
    pagina,
    tamano: POR_PAGINA,
    version,
  });

  const filtrar = (campo, valor) => {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
    setPagina(1);
  };
  const hayFiltros = Object.values(filtros).some(Boolean);

  const destino = (m) => {
    if (m.tipo !== "ENVIO") return "—";
    const apiario = m.apiario_id ? nombreApiario(m.apiario_id) : "Sin apiario";
    return m.colmena_id ? `${apiario} · ${codigoColmena(m.colmena_id)}` : apiario;
  };

  let contenido;
  if (noDisponible) {
    contenido = <p className="px-5 py-6 text-sm text-slate-500">El historial todavía no está disponible en el servidor.</p>;
  } else if (error) {
    contenido = (
      <div className="p-5">
        <ErrorCarga mensaje={`No se pudo cargar el historial. ${error}`} onReintentar={recargar} />
      </div>
    );
  } else if (cargando && movimientos.length === 0) {
    contenido = <Cargando texto="Cargando movimientos..." />;
  } else if (movimientos.length === 0) {
    contenido = (
      <div className="p-5">
        <EstadoVacio
          icono={History}
          titulo={hayFiltros ? "No hay movimientos con estos filtros" : "Todavía no hay movimientos"}
          texto={hayFiltros ? "Ajusta o limpia los filtros." : "Aparecerán aquí los ingresos, envíos, daños, reparaciones y descartes."}
        />
      </div>
    );
  } else {
    contenido = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="p-4 font-medium">Fecha</th>
              <th className="p-4 font-medium">Movimiento</th>
              <th className="p-4 font-medium">Material</th>
              <th className="p-4 text-right font-medium">Cantidad</th>
              <th className="p-4 font-medium">Destino</th>
              <th className="p-4 font-medium">Responsable</th>
              <th className="p-4 font-medium">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => {
              const signo = TIPO_MOVIMIENTO_STOCK[m.tipo]?.signo ?? "";
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="whitespace-nowrap p-4 text-slate-600">{formatearFechaHora(m.fecha)}</td>
                  <td className="p-4">
                    <Insignia tono={tono(TIPO_MOVIMIENTO_STOCK, m.tipo)}>{texto(TIPO_MOVIMIENTO_STOCK, m.tipo)}</Insignia>
                  </td>
                  <td className="p-4">{texto(MATERIAL_STOCK, m.material)}</td>
                  <td className={`p-4 text-right font-semibold ${signo === "+" ? "text-emerald-700" : "text-slate-900"}`}>
                    {signo}
                    {m.cantidad}
                  </td>
                  <td className="p-4">{destino(m)}</td>
                  <td className="p-4 text-slate-600">{nombreUsuario(m.usuario_id)}</td>
                  <td className="max-w-xs p-4 text-slate-600">{m.observaciones || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Panel titulo="Historial de movimientos" descripcion="Ingresos, envíos, daños, reparaciones y descartes.">
      {!noDisponible && (
        <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Seleccion
            aria-label="Filtrar por material"
            value={filtros.material}
            onChange={(e) => filtrar("material", e.target.value)}
            placeholder="Todos los materiales"
            opciones={opciones(MATERIAL_STOCK)}
          />
          <Seleccion
            aria-label="Filtrar por tipo de movimiento"
            value={filtros.tipo}
            onChange={(e) => filtrar("tipo", e.target.value)}
            placeholder="Todos los movimientos"
            opciones={opciones(TIPO_MOVIMIENTO_STOCK)}
          />
          <Entrada aria-label="Desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => filtrar("desde", e.target.value)} />
          <Entrada aria-label="Hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => filtrar("hasta", e.target.value)} />
        </div>
      )}
      {contenido}
      <div className="px-5 pb-4">
        <Paginador
          pagina={pagina}
          hayAnterior={pagina > 1}
          haySiguiente={haySiguiente}
          cargando={cargando}
          onCambiar={setPagina}
        />
      </div>
    </Panel>
  );
}
