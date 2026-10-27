import { useMemo, useState } from "react";
import { Boxes, Pencil, Plus, X } from "lucide-react";
import Modal from "../ui/Modal";
import Boton from "../ui/Boton";
import { InsigniaDe } from "../ui/Insignia";
import { Cargando, ErrorCarga, EstadoVacio } from "../ui/Estados";
import AsignarColmenas from "./AsignarColmenas";
import { useAvisos } from "../../hooks/useAvisos";
import { useConsulta } from "../../hooks/useConsulta";
import { useDatos } from "../../hooks/useDatos";
import { gruposService } from "../../services/gruposService";
import { ESTADO_COLMENA } from "../../utils/etiquetas";
import { formatearFecha } from "../../utils/formato";

// Ficha del grupo con sus colmenas. El administrador agrega o retira colmenas.
export default function DetalleGrupo({ grupoId, gruposDelApiario, puedeEditar, onEditar, onCambio, onCerrar }) {
  const { nombreApiario } = useDatos();
  const avisos = useAvisos();
  const [version, setVersion] = useState(0);
  const [asignando, setAsignando] = useState(null);
  const [retirando, setRetirando] = useState(null);
  const consulta = useConsulta(() => gruposService.obtener(grupoId), [grupoId, version]);
  const grupo = consulta.datos;

  const idsEnGrupo = useMemo(() => new Set((grupo?.colmenas ?? []).map((c) => c.colmena_id)), [grupo]);

  // Para avisar si una colmena ya está en otro grupo del apiario, se consulta el
  // detalle de los otros grupos al abrir "Agregar colmenas".
  const abrirAsignar = async () => {
    const otros = gruposDelApiario.filter((g) => g.id !== grupoId);
    const grupoDe = new Map();
    try {
      const detalles = await Promise.all(otros.map((g) => gruposService.obtener(g.id)));
      for (const detalle of detalles) for (const c of detalle.colmenas ?? []) grupoDe.set(c.colmena_id, detalle.nombre);
    } catch {
      // Si no se puede saber, se asigna igual: el backend mueve la colmena de grupo.
    }
    setAsignando(grupoDe);
  };

  const asignar = async (ids) => {
    await gruposService.asignarColmenas(grupoId, ids);
    avisos.exito(`${ids.length} ${ids.length === 1 ? "colmena agregada" : "colmenas agregadas"} a ${grupo.nombre}.`);
    setAsignando(null);
    setVersion((v) => v + 1);
    onCambio();
  };

  const retirar = async (colmena) => {
    setRetirando(colmena.colmena_id);
    try {
      await gruposService.retirarColmena(grupoId, colmena.colmena_id);
      avisos.exito(`${colmena.codigo} salió de ${grupo.nombre}.`);
      setVersion((v) => v + 1);
      onCambio();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setRetirando(null);
    }
  };

  return (
    <>
      <Modal
        titulo={grupo ? grupo.nombre : "Grupo"}
        descripcion={
          grupo
            ? `${nombreApiario(grupo.apiario_id)} · ${grupo.colmenas.length} ${grupo.colmenas.length === 1 ? "colmena" : "colmenas"}`
            : undefined
        }
        onCerrar={onCerrar}
        ancho="sm:max-w-2xl"
        pie={
          <>
            <Boton variante="secundario" onClick={onCerrar}>
              Cerrar
            </Boton>
            {puedeEditar && grupo?.activo && (
              <>
                <Boton variante="secundario" icono={Pencil} onClick={() => onEditar(grupo)}>
                  Editar
                </Boton>
                <Boton icono={Plus} onClick={abrirAsignar}>
                  Agregar colmenas
                </Boton>
              </>
            )}
          </>
        }
      >
        {consulta.cargando && !grupo && <Cargando texto="Cargando grupo..." />}
        {consulta.error && <ErrorCarga mensaje={consulta.error} onReintentar={consulta.recargar} />}
        {grupo && (
          <div className="grid gap-4">
            {grupo.descripcion && <p className="text-sm text-slate-600">{grupo.descripcion}</p>}
            {grupo.colmenas.length === 0 ? (
              <EstadoVacio
                icono={Boxes}
                titulo="Este grupo no tiene colmenas"
                texto={puedeEditar ? "Usa «Agregar colmenas» para elegirlas." : "Un administrador puede asignarlas."}
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {grupo.colmenas.map((c) => (
                  <li
                    key={c.colmena_id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{c.codigo}</p>
                      <p className="text-xs text-slate-500">Desde {formatearFecha(c.fecha_asignacion)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <InsigniaDe mapa={ESTADO_COLMENA} valor={c.estado} />
                      {puedeEditar && grupo.activo && (
                        <Boton
                          variante="fantasma"
                          tamano="icono"
                          icono={X}
                          aria-label={`Quitar ${c.codigo} del grupo`}
                          title="Quitar del grupo"
                          cargando={retirando === c.colmena_id}
                          onClick={() => retirar(c)}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {asignando && grupo && (
        <AsignarColmenas
          grupo={grupo}
          idsEnGrupo={idsEnGrupo}
          grupoDe={asignando}
          onGuardar={asignar}
          onCerrar={() => setAsignando(null)}
        />
      )}
    </>
  );
}
