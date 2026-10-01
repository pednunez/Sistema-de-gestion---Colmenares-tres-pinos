import { useMemo, useState } from "react";
import { Archive, ClipboardCheck, Pencil, Plus } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import Insignia, { InsigniaDe } from "../components/ui/Insignia";
import { Seleccion } from "../components/ui/Campo";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, Dato, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioInspeccion from "../components/inspecciones/FormularioInspeccion";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { useNavegacion } from "../hooks/useNavegacion";
import { inspeccionesService } from "../services/inspeccionesService";
import { ESTADO_GENERAL, NIVEL, opciones, siNo, texto } from "../utils/etiquetas";
import { formatearFechaHora } from "../utils/formato";

const POR_PAGINA = 30;

export default function InspeccionesPage() {
  const { usuario, esAdmin } = useAuth();
  const { datos, cargado, recargar, indices, codigoColmena, nombreApiario, nombreUsuario } = useDatos();
  const avisos = useAvisos();
  const { parametros } = useNavegacion();

  const [busqueda, setBusqueda] = useState("");
  const [filtroApiario, setFiltroApiario] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [formulario, setFormulario] = useState(parametros.nuevaPara ? { colmenaInicial: parametros.nuevaPara } : null);
  const [aDarDeBaja, setADarDeBaja] = useState(null);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return datos.inspecciones.filter((inspeccion) => {
      const colmena = indices.colmenas.get(inspeccion.colmena_id);
      if (termino && !codigoColmena(inspeccion.colmena_id).toLowerCase().includes(termino)) return false;
      if (filtroApiario && String(colmena?.apiario_id) !== filtroApiario) return false;
      if (filtroEstado && inspeccion.estado_general !== filtroEstado) return false;
      return true;
    });
  }, [datos.inspecciones, indices, codigoColmena, busqueda, filtroApiario, filtroEstado]);

  const puedeGestionar = (inspeccion) => esAdmin || inspeccion.usuario_id === usuario.id;

  const guardar = async (valores) => {
    const { colmena_id, ...cambios } = valores;
    if (formulario?.inspeccion) {
      await inspeccionesService.actualizar(formulario.inspeccion.id, cambios);
      avisos.exito("Inspección actualizada.");
    } else {
      // El backend reemplaza usuario_id por el usuario del token; se envía porque el esquema lo exige.
      await inspeccionesService.crear({ ...valores, colmena_id, usuario_id: usuario.id });
      avisos.exito(`Inspección de la colmena ${codigoColmena(colmena_id)} registrada.`);
    }
    await recargar();
    setFormulario(null);
  };

  const darDeBaja = async () => {
    await inspeccionesService.darDeBaja(aDarDeBaja.id);
    await recargar();
    avisos.exito("Inspección anulada.");
  };

  if (!cargado) return <Cargando texto="Cargando inspecciones..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Revisiones registradas en terreno, de la más reciente a la más antigua.">
        <Boton icono={Plus} onClick={() => setFormulario({})}>
          Registrar inspección
        </Boton>
      </EncabezadoModulo>

      <BarraFiltros>
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por código de colmena" etiqueta="Buscar por código de colmena" />
        <Seleccion
          aria-label="Filtrar por apiario"
          value={filtroApiario}
          onChange={(e) => setFiltroApiario(e.target.value)}
          placeholder="Todos los apiarios"
          opciones={datos.apiarios.map((a) => ({ valor: String(a.id), texto: a.nombre }))}
        />
        <Seleccion
          aria-label="Filtrar por estado general"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          placeholder="Todos los estados"
          opciones={opciones(ESTADO_GENERAL)}
        />
      </BarraFiltros>

      {filtradas.length === 0 ? (
        <EstadoVacio
          icono={ClipboardCheck}
          titulo="No hay inspecciones para mostrar"
          texto={datos.inspecciones.length === 0 ? "Registra la primera inspección desde aquí o escaneando el QR de una colmena." : "Ajusta o limpia los filtros."}
        />
      ) : (
        <div className="grid gap-4">
          {filtradas.slice(0, visibles).map((inspeccion) => {
            const colmena = indices.colmenas.get(inspeccion.colmena_id);
            return (
              <article key={inspeccion.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {codigoColmena(inspeccion.colmena_id)}
                      {colmena && <span className="ml-2 text-sm font-normal text-slate-500">{nombreApiario(colmena.apiario_id)}</span>}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatearFechaHora(inspeccion.fecha_inspeccion)} · {nombreUsuario(inspeccion.usuario_id)}
                    </p>
                  </div>
                  <InsigniaDe mapa={ESTADO_GENERAL} valor={inspeccion.estado_general} porDefecto="Sin estado" />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                  <Dato nombre="Reina observada">{siNo(inspeccion.reina_observada)}</Dato>
                  <Dato nombre="Presencia de cría">{siNo(inspeccion.presencia_cria)}</Dato>
                  <Dato nombre="Población">{texto(NIVEL, inspeccion.nivel_poblacion, "No revisado")}</Dato>
                  <Dato nombre="Reservas de alimento">{texto(NIVEL, inspeccion.reservas_alimento, "No revisado")}</Dato>
                </dl>

                {inspeccion.signos_enfermedad && (
                  <div className="mt-4">
                    <Insignia tono="rojo">Signos de enfermedad</Insignia>
                    {inspeccion.enfermedad_observada && (
                      <span className="ml-2 text-sm text-slate-700">{inspeccion.enfermedad_observada}</span>
                    )}
                  </div>
                )}
                {inspeccion.observaciones && <p className="mt-3 text-sm text-slate-600">{inspeccion.observaciones}</p>}

                {puedeGestionar(inspeccion) && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setFormulario({ inspeccion })}>
                      Editar
                    </Boton>
                    <Boton variante="fantasma" tamano="sm" icono={Archive} onClick={() => setADarDeBaja(inspeccion)}>
                      Anular
                    </Boton>
                  </div>
                )}
              </article>
            );
          })}

          {filtradas.length > visibles && (
            <Boton variante="secundario" className="justify-self-center" onClick={() => setVisibles((v) => v + POR_PAGINA)}>
              Mostrar más ({filtradas.length - visibles} restantes)
            </Boton>
          )}
        </div>
      )}

      {formulario && (
        <FormularioInspeccion
          inspeccion={formulario.inspeccion}
          colmenaInicial={formulario.colmenaInicial}
          onGuardar={guardar}
          onCerrar={() => setFormulario(null)}
        />
      )}

      {aDarDeBaja && (
        <Confirmar
          titulo="¿Anular esta inspección?"
          textoConfirmar="Anular inspección"
          onConfirmar={darDeBaja}
          onCerrar={() => setADarDeBaja(null)}
        >
          <p>
            La inspección de {codigoColmena(aDarDeBaja.colmena_id)} del {formatearFechaHora(aDarDeBaja.fecha_inspeccion)}{" "}
            dejará de mostrarse. Queda registrada en la auditoría.
          </p>
        </Confirmar>
      )}
    </>
  );
}
