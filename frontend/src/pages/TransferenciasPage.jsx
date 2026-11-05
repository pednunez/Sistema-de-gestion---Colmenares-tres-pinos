import { useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import Insignia from "../components/ui/Insignia";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, EncabezadoModulo } from "../components/ui/Estructura";
import FiltroApiario from "../components/ui/FiltroApiario";
import { useDatos } from "../hooks/useDatos";
import { TIPO_MARCO, texto } from "../utils/etiquetas";
import { formatearFechaHora } from "../utils/formato";

// Historial de solo lectura (RF-42). Las transferencias se registran durante la
// inspección de la colmena de la que sale el marco.
export default function TransferenciasPage() {
  const { datos, cargado, indices, codigoColmena, nombreApiario, nombreUsuario } = useDatos();
  const [busqueda, setBusqueda] = useState("");
  // "" = todos los apiarios. Con un apiario elegido se ven las transferencias que
  // salieron o llegaron a alguna de sus colmenas.
  const [apiarioId, setApiarioId] = useState("");

  const apiarioDe = (colmenaId) => indices.colmenas.get(colmenaId)?.apiario_id;
  const apiariosOrdenados = useMemo(
    () => [...datos.apiarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [datos.apiarios]
  );

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return datos.transferencias.filter((t) => {
      if (
        apiarioId &&
        String(indices.colmenas.get(t.colmena_origen_id)?.apiario_id) !== apiarioId &&
        String(indices.colmenas.get(t.colmena_destino_id)?.apiario_id) !== apiarioId
      )
        return false;
      if (!termino) return true;
      return (
        codigoColmena(t.colmena_origen_id).toLowerCase().includes(termino) ||
        codigoColmena(t.colmena_destino_id).toLowerCase().includes(termino)
      );
    });
  }, [datos.transferencias, busqueda, apiarioId, indices, codigoColmena]);

  const apiarioElegido = datos.apiarios.find((a) => String(a.id) === apiarioId);
  const salidas = filtradas.filter((t) => String(apiarioDe(t.colmena_origen_id)) === apiarioId).length;
  const llegadas = filtradas.filter((t) => String(apiarioDe(t.colmena_destino_id)) === apiarioId).length;

  if (!cargado) return <Cargando texto="Cargando transferencias..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Historial de marcos movidos entre colmenas. Las transferencias se registran durante la inspección." />

      <FiltroApiario apiarios={apiariosOrdenados} valor={apiarioId} onCambiar={setApiarioId} />

      {apiarioElegido && (
        <p className="mb-4 text-sm text-slate-600" role="status">
          {apiarioElegido.nombre}: {filtradas.length} {filtradas.length === 1 ? "transferencia" : "transferencias"} · {salidas}{" "}
          {salidas === 1 ? "salida" : "salidas"} de sus colmenas · {llegadas} {llegadas === 1 ? "llegada" : "llegadas"} a sus colmenas
        </p>
      )}

      <BarraFiltros>
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por código de colmena" etiqueta="Buscar por código de colmena" />
      </BarraFiltros>

      {filtradas.length === 0 ? (
        <EstadoVacio
          icono={ArrowRightLeft}
          titulo="No hay transferencias para mostrar"
          texto={
            datos.transferencias.length === 0
              ? "Aparecerán aquí cuando marques un marco con «Transferir» al registrar una inspección."
              : apiarioElegido
                ? "Este apiario no tiene transferencias con estos filtros."
                : "Prueba con otro código."
          }
        />
      ) : (
        <div className="grid gap-4">
          {filtradas.map((t) => (
            <article
              key={t.id}
              className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:flex-row md:flex-wrap md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3 text-lg font-semibold">
                <span>
                  <span className="block text-xs font-normal text-slate-500">Salió de</span>
                  {codigoColmena(t.colmena_origen_id)}
                  <span className="block text-xs font-normal text-slate-500">{nombreApiario(apiarioDe(t.colmena_origen_id))}</span>
                </span>
                <ArrowRight className="text-amber-500" aria-hidden="true" />
                <span>
                  <span className="block text-xs font-normal text-slate-500">Llegó a</span>
                  {codigoColmena(t.colmena_destino_id)}
                  <span className="block text-xs font-normal text-slate-500">{nombreApiario(apiarioDe(t.colmena_destino_id))}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 md:justify-end">
                <Insignia tono="ambar">
                  {t.cantidad_marcos} {t.cantidad_marcos === 1 ? "marco" : "marcos"} de{" "}
                  {texto(TIPO_MARCO, t.tipo_marco, "tipo sin indicar").toLowerCase()}
                </Insignia>
                <span>{formatearFechaHora(t.fecha_transferencia)}</span>
                <span>· {nombreUsuario(t.usuario_id)}</span>
              </div>
              {t.observaciones && <p className="text-sm text-slate-600 md:basis-full">{t.observaciones}</p>}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
