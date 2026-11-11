import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import Boton from "../components/ui/Boton";
import { InsigniaDe } from "../components/ui/Insignia";
import { Entrada, Seleccion } from "../components/ui/Campo";
import { Cargando, ErrorCarga, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, EncabezadoModulo } from "../components/ui/Estructura";
import DetalleAuditoria from "../components/auditoria/DetalleAuditoria";
import { useConsulta } from "../hooks/useConsulta";
import { useDatos } from "../hooks/useDatos";
import { auditoriaService } from "../services/auditoriaService";
import { ACCION_AUDITORIA, ENTIDAD, opciones, texto } from "../utils/etiquetas";
import { formatearFechaHora, hoyISO, nombreCompleto } from "../utils/formato";
import { FILTROS_VACIOS, filtrarAuditoria, hayFiltros } from "../utils/auditoria";

const POR_PAGINA = 50;

// Registro de acciones críticas, solo para el administrador (RF-63, RF-64).
export default function AuditoriaPage() {
  const { datos, codigoColmena, nombreApiario, nombreUsuario } = useDatos();
  const auditoria = useConsulta(() => auditoriaService.listar(), []);

  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [detalle, setDetalle] = useState(null);

  // Cada cambio de filtro vuelve a mostrar desde el registro más reciente.
  const cambiar = (campo) => (evento) => {
    setFiltros((previos) => ({ ...previos, [campo]: evento.target.value }));
    setVisibles(POR_PAGINA);
  };
  const limpiar = () => {
    setFiltros(FILTROS_VACIOS);
    setVisibles(POR_PAGINA);
  };

  const total = auditoria.datos?.length ?? 0;
  const filtrados = useMemo(() => filtrarAuditoria(auditoria.datos, filtros), [auditoria.datos, filtros]);
  const conFiltros = hayFiltros(filtros);
  const fechasInvertidas = filtros.desde && filtros.hasta && filtros.desde > filtros.hasta;

  const describirRegistro = (registro) => {
    const d = registro.datos_nuevos ?? registro.datos_anteriores ?? {};
    if (d.colmena_origen_id) return `${codigoColmena(d.colmena_origen_id)} → ${codigoColmena(d.colmena_destino_id)}`;
    if (d.codigo) return d.codigo;
    if (d.nombre && registro.entidad === "APIARIO") return d.nombre;
    if (d.colmena_id) return codigoColmena(d.colmena_id);
    if (d.apiario_id) return nombreApiario(d.apiario_id);
    return registro.entidad_id ? `Registro #${registro.entidad_id}` : "—";
  };

  if (auditoria.cargando) return <Cargando texto="Cargando auditoría..." />;
  if (auditoria.error) return <ErrorCarga mensaje={auditoria.error} onReintentar={auditoria.recargar} />;

  return (
    <>
      <EncabezadoModulo
        descripcion={
          conFiltros
            ? `${filtrados.length} de ${total} registros coinciden con los filtros. Selecciona uno para ver el detalle.`
            : `${total} registros: quién hizo qué cambio y cuándo. Selecciona uno para ver el detalle.`
        }
      >
        <Boton variante="secundario" onClick={auditoria.recargar}>
          Actualizar registros
        </Boton>
      </EncabezadoModulo>

      <BarraFiltros>
        <Seleccion aria-label="Filtrar por módulo" value={filtros.entidad} onChange={cambiar("entidad")} placeholder="Todos los módulos" opciones={opciones(ENTIDAD)} />
        <Seleccion aria-label="Filtrar por acción" value={filtros.accion} onChange={cambiar("accion")} placeholder="Todas las acciones" opciones={opciones(ACCION_AUDITORIA)} />
        <Seleccion
          aria-label="Filtrar por usuario"
          value={filtros.usuario}
          onChange={cambiar("usuario")}
          placeholder="Todos los usuarios"
          opciones={datos.usuarios.map((u) => ({ valor: String(u.id), texto: nombreCompleto(u) }))}
        />
      </BarraFiltros>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end print:hidden">
        <Entrada
          etiqueta="Desde"
          type="date"
          value={filtros.desde}
          max={filtros.hasta || hoyISO()}
          onChange={cambiar("desde")}
          error={fechasInvertidas ? "Debe ser anterior a «Hasta»." : undefined}
        />
        <Entrada etiqueta="Hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} max={hoyISO()} onChange={cambiar("hasta")} />
        {conFiltros && (
          <div>
            <Boton variante="fantasma" onClick={limpiar}>
              Limpiar filtros
            </Boton>
          </div>
        )}
      </div>

      {filtrados.length === 0 ? (
        <EstadoVacio
          icono={ShieldCheck}
          titulo={conFiltros ? "No hay registros con estos filtros" : "Todavía no hay registros de auditoría"}
          texto={conFiltros ? "Amplía el rango de fechas o limpia los filtros." : undefined}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="p-4 font-medium">Fecha y hora</th>
                  <th className="p-4 font-medium">Usuario</th>
                  <th className="p-4 font-medium">Acción</th>
                  <th className="p-4 font-medium">Módulo</th>
                  <th className="p-4 font-medium">Registro</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, visibles).map((registro) => (
                  <tr key={registro.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap p-4 text-slate-600">{formatearFechaHora(registro.fecha)}</td>
                    <td className="p-4">{nombreUsuario(registro.usuario_id)}</td>
                    <td className="p-4">
                      <InsigniaDe mapa={ACCION_AUDITORIA} valor={registro.accion} />
                    </td>
                    <td className="p-4">{texto(ENTIDAD, registro.entidad)}</td>
                    <td className="p-4 font-medium">{describirRegistro(registro)}</td>
                    <td className="p-4 text-right">
                      <Boton variante="fantasma" tamano="sm" onClick={() => setDetalle(registro)}>
                        Ver detalle
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length > visibles && (
            <div className="mt-4 flex justify-center">
              <Boton variante="secundario" onClick={() => setVisibles((v) => v + POR_PAGINA)}>
                Mostrar más ({filtrados.length - visibles} restantes)
              </Boton>
            </div>
          )}
        </>
      )}

      {detalle && <DetalleAuditoria registro={detalle} onCerrar={() => setDetalle(null)} />}
    </>
  );
}
