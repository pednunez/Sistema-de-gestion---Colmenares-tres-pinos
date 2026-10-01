import { useMemo, useState } from "react";
import { Archive, Boxes, Eye, Pencil, Plus } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import { InsigniaDe } from "../components/ui/Insignia";
import { Seleccion } from "../components/ui/Campo";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioColmena from "../components/colmenas/FormularioColmena";
import DetalleColmena from "../components/colmenas/DetalleColmena";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { useNavegacion } from "../hooks/useNavegacion";
import { colmenasService } from "../services/colmenasService";
import { ESTADO_COLMENA, ESTADO_GENERAL, opciones } from "../utils/etiquetas";
import { formatearFecha } from "../utils/formato";
import { calcularAlertas, ultimaInspeccionPorColmena } from "../utils/alertas";

export default function ColmenasPage() {
  const { esAdmin } = useAuth();
  const { datos, cargado, recargar, nombreApiario } = useDatos();
  const avisos = useAvisos();
  const { parametros } = useNavegacion();

  const [busqueda, setBusqueda] = useState("");
  const [filtroApiario, setFiltroApiario] = useState(String(parametros.apiario ?? ""));
  const [filtroEstado, setFiltroEstado] = useState("");
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [detalleId, setDetalleId] = useState(parametros.detalle ?? null);
  const [formulario, setFormulario] = useState(null);
  const [aDarDeBaja, setADarDeBaja] = useState(null);

  const { ultimas, conAlerta } = useMemo(
    () => ({
      ultimas: ultimaInspeccionPorColmena(datos.inspecciones),
      conAlerta: new Set(calcularAlertas(datos.colmenas, datos.inspecciones).map((a) => a.colmena.id)),
    }),
    [datos.colmenas, datos.inspecciones]
  );

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return datos.colmenas
      .filter((c) => c.codigo.toLowerCase().includes(termino))
      .filter((c) => !filtroApiario || String(c.apiario_id) === filtroApiario)
      .filter((c) => !filtroEstado || c.estado === filtroEstado)
      .filter((c) => !soloAtencion || conAlerta.has(c.id))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  }, [datos.colmenas, busqueda, filtroApiario, filtroEstado, soloAtencion, conAlerta]);

  const guardar = async (valores) => {
    if (formulario?.id) {
      await colmenasService.actualizar(formulario.id, valores);
      avisos.exito(`Colmena ${valores.codigo} actualizada.`);
    } else {
      await colmenasService.crear(valores);
      avisos.exito(`Colmena ${valores.codigo} registrada.`);
    }
    await recargar();
    setFormulario(null);
  };

  const darDeBaja = async () => {
    await colmenasService.darDeBaja(aDarDeBaja.id);
    await recargar();
    avisos.exito(`Colmena ${aDarDeBaja.codigo} dada de baja. Su historial se conserva.`);
  };

  if (!cargado) return <Cargando texto="Cargando colmenas..." />;

  return (
    <>
      <EncabezadoModulo descripcion={`${filtradas.length} de ${datos.colmenas.length} colmenas registradas.`}>
        {esAdmin && (
          <Boton icono={Plus} onClick={() => setFormulario({ apiario_id: filtroApiario || undefined })}>
            Nueva colmena
          </Boton>
        )}
      </EncabezadoModulo>

      <BarraFiltros>
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por código" etiqueta="Buscar colmena por código" />
        <Seleccion
          aria-label="Filtrar por apiario"
          value={filtroApiario}
          onChange={(e) => setFiltroApiario(e.target.value)}
          placeholder="Todos los apiarios"
          opciones={datos.apiarios.map((a) => ({ valor: String(a.id), texto: a.nombre }))}
        />
        <Seleccion
          aria-label="Filtrar por estado"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          placeholder="Todos los estados"
          opciones={opciones(ESTADO_COLMENA, ["BAJA"])}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 text-sm">
          <input
            type="checkbox"
            checked={soloAtencion}
            onChange={(e) => setSoloAtencion(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          Solo las que requieren atención
        </label>
      </BarraFiltros>

      {filtradas.length === 0 ? (
        <EstadoVacio
          icono={Boxes}
          titulo="No hay colmenas con estos filtros"
          texto={datos.colmenas.length === 0 ? "Registra la primera colmena para comenzar." : "Ajusta o limpia los filtros."}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-4 font-medium">Código</th>
                <th className="p-4 font-medium">Apiario</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium">Última inspección</th>
                <th className="p-4 font-medium">Instalación</th>
                <th className="p-4 font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((colmena) => {
                const ultima = ultimas.get(colmena.id);
                return (
                  <tr key={colmena.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="p-4">
                      <button
                        type="button"
                        onClick={() => setDetalleId(colmena.id)}
                        className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                      >
                        {colmena.codigo}
                      </button>
                      {conAlerta.has(colmena.id) && (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-500" title="Requiere atención" />
                      )}
                    </td>
                    <td className="p-4">{nombreApiario(colmena.apiario_id)}</td>
                    <td className="p-4">
                      <InsigniaDe mapa={ESTADO_COLMENA} valor={colmena.estado} />
                    </td>
                    <td className="p-4">
                      {ultima ? (
                        <span className="flex items-center gap-2">
                          <InsigniaDe mapa={ESTADO_GENERAL} valor={ultima.estado_general} />
                          <span className="text-slate-500">{formatearFecha(ultima.fecha_inspeccion)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Sin inspecciones</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">{formatearFecha(colmena.fecha_instalacion)}</td>
                    <td className="p-4">
                      <div className="flex justify-end gap-1">
                        <Boton variante="fantasma" tamano="icono" icono={Eye} aria-label={`Ver ${colmena.codigo}`} title="Ver detalle" onClick={() => setDetalleId(colmena.id)} />
                        {esAdmin && (
                          <>
                            <Boton variante="fantasma" tamano="icono" icono={Pencil} aria-label={`Editar ${colmena.codigo}`} title="Editar" onClick={() => setFormulario(colmena)} />
                            <Boton variante="fantasma" tamano="icono" icono={Archive} aria-label={`Dar de baja ${colmena.codigo}`} title="Dar de baja" onClick={() => setADarDeBaja(colmena)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detalleId && <DetalleColmena colmenaId={detalleId} onCerrar={() => setDetalleId(null)} />}

      {formulario && (
        <FormularioColmena
          colmena={formulario.id ? formulario : null}
          apiarioInicial={formulario.apiario_id}
          onGuardar={guardar}
          onCerrar={() => setFormulario(null)}
        />
      )}

      {aDarDeBaja && (
        <Confirmar
          titulo={`¿Dar de baja la colmena ${aDarDeBaja.codigo}?`}
          textoConfirmar="Dar de baja"
          onConfirmar={darDeBaja}
          onCerrar={() => setADarDeBaja(null)}
        >
          <p>
            Dejará de aparecer en las listas y no se podrán registrar nuevas inspecciones en ella. Sus inspecciones,
            tratamientos y transferencias se conservan.
          </p>
        </Confirmar>
      )}
    </>
  );
}
