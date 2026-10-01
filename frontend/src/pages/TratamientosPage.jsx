import { useMemo, useState } from "react";
import { CheckCircle2, Pencil, Pill, Plus, XCircle } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import { InsigniaDe } from "../components/ui/Insignia";
import { Seleccion } from "../components/ui/Campo";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, Dato, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioTratamiento from "../components/tratamientos/FormularioTratamiento";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { useNavegacion } from "../hooks/useNavegacion";
import { tratamientosService } from "../services/tratamientosService";
import { ESTADO_TRATAMIENTO, opciones } from "../utils/etiquetas";
import { formatearFecha, hoyISO, humanizar } from "../utils/formato";

export default function TratamientosPage() {
  const { usuario, esAdmin } = useAuth();
  const { datos, cargado, recargar, codigoColmena, nombreUsuario } = useDatos();
  const avisos = useAvisos();
  const { parametros } = useNavegacion();

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [formulario, setFormulario] = useState(parametros.nuevoPara ? { colmenaInicial: parametros.nuevoPara } : null);
  const [confirmacion, setConfirmacion] = useState(null);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return [...datos.tratamientos]
      .filter((t) => !filtroEstado || t.estado === filtroEstado)
      .filter(
        (t) =>
          !termino ||
          codigoColmena(t.colmena_id).toLowerCase().includes(termino) ||
          humanizar(t.tipo_tratamiento).toLowerCase().includes(termino) ||
          (t.producto ?? "").toLowerCase().includes(termino)
      )
      .sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
  }, [datos.tratamientos, busqueda, filtroEstado, codigoColmena]);

  const puedeGestionar = (t) => esAdmin || t.usuario_id === usuario.id;
  const abierto = (t) => t.estado === "PLANIFICADO" || t.estado === "EN_CURSO";

  const guardar = async (valores) => {
    if (formulario?.tratamiento) {
      await tratamientosService.actualizar(formulario.tratamiento.id, valores);
      avisos.exito("Tratamiento actualizado.");
    } else {
      // El backend reemplaza usuario_id por el usuario del token.
      await tratamientosService.crear({ ...valores, usuario_id: usuario.id });
      avisos.exito(`Tratamiento registrado para ${codigoColmena(valores.colmena_id)}.`);
    }
    await recargar();
    setFormulario(null);
  };

  const finalizar = async (t) => {
    await tratamientosService.actualizar(t.id, { estado: "FINALIZADO", fecha_fin: t.fecha_fin ?? hoyISO() });
    await recargar();
    avisos.exito("Tratamiento finalizado.");
  };

  const cancelar = async (t) => {
    await tratamientosService.cancelar(t.id);
    await recargar();
    avisos.exito("Tratamiento cancelado.");
  };

  if (!cargado) return <Cargando texto="Cargando tratamientos..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Seguimiento sanitario de las colmenas.">
        <Boton icono={Plus} onClick={() => setFormulario({})}>
          Registrar tratamiento
        </Boton>
      </EncabezadoModulo>

      <BarraFiltros>
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Colmena, tipo o producto" etiqueta="Buscar tratamiento" />
        <Seleccion
          aria-label="Filtrar por estado"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          placeholder="Todos los estados"
          opciones={opciones(ESTADO_TRATAMIENTO)}
        />
      </BarraFiltros>

      {filtrados.length === 0 ? (
        <EstadoVacio
          icono={Pill}
          titulo="No hay tratamientos para mostrar"
          texto={datos.tratamientos.length === 0 ? "Registra el primer tratamiento sanitario." : "Ajusta o limpia los filtros."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {filtrados.map((t) => (
            <article key={t.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">{humanizar(t.tipo_tratamiento)}</h3>
                  <p className="text-sm text-slate-500">
                    {codigoColmena(t.colmena_id)} · {nombreUsuario(t.usuario_id)}
                  </p>
                </div>
                <InsigniaDe mapa={ESTADO_TRATAMIENTO} valor={t.estado} />
              </div>

              <dl className="mb-4 mt-4 grid grid-cols-2 gap-4 text-sm">
                <Dato nombre="Producto">{t.producto || "Sin registrar"}</Dato>
                <Dato nombre="Dosis">{t.dosis || "Sin registrar"}</Dato>
                <Dato nombre="Inicio">{formatearFecha(t.fecha_inicio)}</Dato>
                <Dato nombre="Término">{formatearFecha(t.fecha_fin, "Sin definir")}</Dato>
              </dl>
              {t.motivo && <p className="mb-4 text-sm text-slate-600">Motivo: {t.motivo}</p>}

              {puedeGestionar(t) && (
                <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {abierto(t) && (
                    <Boton variante="secundario" tamano="sm" icono={CheckCircle2} onClick={() => setConfirmacion({ tipo: "finalizar", t })}>
                      Finalizar
                    </Boton>
                  )}
                  <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setFormulario({ tratamiento: t })}>
                    Editar
                  </Boton>
                  {abierto(t) && (
                    <Boton variante="fantasma" tamano="sm" icono={XCircle} onClick={() => setConfirmacion({ tipo: "cancelar", t })}>
                      Cancelar tratamiento
                    </Boton>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {formulario && (
        <FormularioTratamiento
          tratamiento={formulario.tratamiento}
          colmenaInicial={formulario.colmenaInicial}
          onGuardar={guardar}
          onCerrar={() => setFormulario(null)}
        />
      )}

      {confirmacion?.tipo === "finalizar" && (
        <Confirmar
          titulo="¿Finalizar este tratamiento?"
          textoConfirmar="Finalizar"
          variante="primario"
          onConfirmar={() => finalizar(confirmacion.t)}
          onCerrar={() => setConfirmacion(null)}
        >
          <p>
            {humanizar(confirmacion.t.tipo_tratamiento)} en {codigoColmena(confirmacion.t.colmena_id)} quedará como
            finalizado{confirmacion.t.fecha_fin ? "" : " con fecha de término hoy"}.
          </p>
        </Confirmar>
      )}

      {confirmacion?.tipo === "cancelar" && (
        <Confirmar
          titulo="¿Cancelar este tratamiento?"
          textoConfirmar="Cancelar tratamiento"
          onConfirmar={() => cancelar(confirmacion.t)}
          onCerrar={() => setConfirmacion(null)}
        >
          <p>El tratamiento quedará como cancelado y se mantendrá en el historial de la colmena.</p>
        </Confirmar>
      )}
    </>
  );
}
