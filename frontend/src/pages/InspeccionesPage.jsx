import { useMemo, useState } from "react";
import { Archive, ClipboardCheck, Pencil, Plus } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import Insignia, { InsigniaDe } from "../components/ui/Insignia";
import { Seleccion } from "../components/ui/Campo";
import Alerta from "../components/ui/Alerta";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, Dato, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioInspeccion from "../components/inspecciones/FormularioInspeccion";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { useNavegacion } from "../hooks/useNavegacion";
import { inspeccionesService } from "../services/inspeccionesService";
import { transferenciasService } from "../services/transferenciasService";
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
  const [transferenciasFallidas, setTransferenciasFallidas] = useState(null);

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

  // Las transferencias marcadas en la revisión de marcos se guardan después de la
  // inspección, que es la que deja en la colmena la cantidad de marcos de la que se descuentan.
  const guardar = async (valores, transferencias = []) => {
    if (formulario?.inspeccion) {
      // Al editar, el backend no permite cambiar la colmena.
      const cambios = { ...valores };
      delete cambios.colmena_id;
      await inspeccionesService.actualizar(formulario.inspeccion.id, cambios);
      avisos.exito("Inspección actualizada.");
      await recargar();
      setFormulario(null);
      return;
    }

    // El backend reemplaza usuario_id por el usuario de la sesión; se envía porque el esquema lo exige.
    const inspeccion = await inspeccionesService.crear({ ...valores, usuario_id: usuario.id });

    // Desde aquí la inspección ya existe: un fallo en una transferencia no debe
    // hacer que el formulario se reenvíe y la duplique.
    const fallidas = [];
    for (const transferencia of transferencias) {
      try {
        await transferenciasService.crear({ ...transferencia, usuario_id: usuario.id, inspeccion_id: inspeccion.id });
      } catch (error) {
        fallidas.push({ ...transferencia, mensaje: error.message });
      }
    }

    await recargar().catch(() => {});
    setFormulario(null);

    const guardadas = transferencias.length - fallidas.length;
    const codigo = codigoColmena(valores.colmena_id);
    avisos.exito(
      guardadas > 0
        ? `Inspección de ${codigo} registrada con ${guardadas} ${guardadas === 1 ? "transferencia" : "transferencias"}.`
        : `Inspección de ${codigo} registrada.`
    );
    setTransferenciasFallidas(fallidas.length > 0 ? { codigo, fallidas } : null);
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

      {transferenciasFallidas && (
        <div className="mb-5">
          <Alerta
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => setTransferenciasFallidas(null)}>
                Entendido
              </Boton>
            }
          >
            <p className="font-semibold">
              La inspección de {transferenciasFallidas.codigo} quedó registrada, pero no se pudieron guardar estas
              transferencias:
            </p>
            <ul className="mt-2 list-disc pl-5">
              {transferenciasFallidas.fallidas.map((fallida) => (
                <li key={`${fallida.ubicacion}-${fallida.numero_marco}`}>
                  {fallida.observaciones.replace(/\.$/, "")}, hacia {codigoColmena(fallida.colmena_destino_id)}.{" "}
                  {fallida.mensaje}
                </li>
              ))}
            </ul>
          </Alerta>
        </div>
      )}

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
                      {inspeccion.cantidad_marcos != null && ` · ${inspeccion.cantidad_marcos} marcos`}
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
