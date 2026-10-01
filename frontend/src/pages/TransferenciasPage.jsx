import { useMemo, useState } from "react";
import { ArrowRight, ArrowRightLeft, Plus } from "lucide-react";
import Boton from "../components/ui/Boton";
import Insignia from "../components/ui/Insignia";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { BarraFiltros, Buscador, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioTransferencia from "../components/transferencias/FormularioTransferencia";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { transferenciasService } from "../services/transferenciasService";
import { TIPO_MARCO, texto } from "../utils/etiquetas";
import { formatearFechaHora } from "../utils/formato";

export default function TransferenciasPage() {
  const { usuario } = useAuth();
  const { datos, cargado, recargar, codigoColmena, nombreUsuario } = useDatos();
  const avisos = useAvisos();
  const [busqueda, setBusqueda] = useState("");
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return datos.transferencias;
    return datos.transferencias.filter(
      (t) =>
        codigoColmena(t.colmena_origen_id).toLowerCase().includes(termino) ||
        codigoColmena(t.colmena_destino_id).toLowerCase().includes(termino)
    );
  }, [datos.transferencias, busqueda, codigoColmena]);

  const guardar = async (valores) => {
    // El backend reemplaza usuario_id por el usuario del token.
    await transferenciasService.crear({ ...valores, usuario_id: usuario.id });
    await recargar();
    avisos.exito(
      `Transferencia registrada: ${valores.cantidad_marcos} marco(s) de ${codigoColmena(valores.colmena_origen_id)} a ${codigoColmena(valores.colmena_destino_id)}.`
    );
    setFormularioAbierto(false);
  };

  if (!cargado) return <Cargando texto="Cargando transferencias..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Movimientos de marcos entre colmenas, decididos por el apicultor.">
        <Boton icono={Plus} onClick={() => setFormularioAbierto(true)}>
          Registrar transferencia
        </Boton>
      </EncabezadoModulo>

      <BarraFiltros>
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por código de colmena" etiqueta="Buscar por código de colmena" />
      </BarraFiltros>

      {filtradas.length === 0 ? (
        <EstadoVacio
          icono={ArrowRightLeft}
          titulo="No hay transferencias para mostrar"
          texto={datos.transferencias.length === 0 ? "Cuando muevas marcos entre colmenas, regístralo aquí." : "Prueba con otro código."}
        />
      ) : (
        <div className="grid gap-4">
          {filtradas.map((t) => (
            <article key={t.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:flex-row md:flex-wrap md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-lg font-semibold">
                <span>{codigoColmena(t.colmena_origen_id)}</span>
                <ArrowRight className="text-amber-500" aria-label="hacia" />
                <span>{codigoColmena(t.colmena_destino_id)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 md:justify-end">
                <Insignia tono="ambar">
                  {t.cantidad_marcos} {t.cantidad_marcos === 1 ? "marco" : "marcos"} de {texto(TIPO_MARCO, t.tipo_marco, "tipo sin indicar").toLowerCase()}
                </Insignia>
                <span>{formatearFechaHora(t.fecha_transferencia)}</span>
                <span>· {nombreUsuario(t.usuario_id)}</span>
              </div>
              {(t.motivo || t.observaciones) && (
                <p className="text-sm text-slate-600 md:basis-full">{[t.motivo, t.observaciones].filter(Boolean).join(" · ")}</p>
              )}
            </article>
          ))}
        </div>
      )}

      {formularioAbierto && <FormularioTransferencia onGuardar={guardar} onCerrar={() => setFormularioAbierto(false)} />}
    </>
  );
}
