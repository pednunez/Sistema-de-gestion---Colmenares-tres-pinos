import { useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import Insignia from "../components/ui/Insignia";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, EncabezadoModulo } from "../components/ui/Estructura";
import { useDatos } from "../hooks/useDatos";
import { TIPO_MARCO, texto } from "../utils/etiquetas";
import { formatearFechaHora } from "../utils/formato";

// Historial de solo lectura (RF-42). Las transferencias se registran durante la
// inspección de la colmena de la que sale el marco.
export default function TransferenciasPage() {
  const { datos, cargado, codigoColmena, nombreUsuario } = useDatos();
  const [busqueda, setBusqueda] = useState("");

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return datos.transferencias;
    return datos.transferencias.filter(
      (t) =>
        codigoColmena(t.colmena_origen_id).toLowerCase().includes(termino) ||
        codigoColmena(t.colmena_destino_id).toLowerCase().includes(termino)
    );
  }, [datos.transferencias, busqueda, codigoColmena]);

  if (!cargado) return <Cargando texto="Cargando transferencias..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Historial de marcos movidos entre colmenas. Las transferencias se registran durante la inspección." />

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
                </span>
                <ArrowRight className="text-amber-500" aria-hidden="true" />
                <span>
                  <span className="block text-xs font-normal text-slate-500">Llegó a</span>
                  {codigoColmena(t.colmena_destino_id)}
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
