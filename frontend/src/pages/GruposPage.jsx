import { useMemo, useState } from "react";
import { Archive, ClipboardList, Layers, Pencil, Plus } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import { Cargando, ErrorCarga, EstadoVacio } from "../components/ui/Estados";
import { EncabezadoModulo } from "../components/ui/Estructura";
import FiltroApiario from "../components/ui/FiltroApiario";
import FormularioGrupo from "../components/grupos/FormularioGrupo";
import DetalleGrupo from "../components/grupos/DetalleGrupo";
import RevisionGrupo from "../components/revisiones/RevisionGrupo";
import Insignia from "../components/ui/Insignia";
import { useConsulta } from "../hooks/useConsulta";
import { revisionesService } from "../services/revisionesService";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { useDatos } from "../hooks/useDatos";
import { useGrupos } from "../hooks/useGrupos";
import { gruposService } from "../services/gruposService";

// Grupos de colmenas por apiario (PB-06). Sirven para revisar las colmenas por grupo.
export default function GruposPage() {
  const { esAdmin } = useAuth();
  const { datos, cargado, nombreApiario } = useDatos();
  const avisos = useAvisos();
  const [apiarioId, setApiarioId] = useState("");
  const [version, setVersion] = useState(0);
  const [formulario, setFormulario] = useState(null);
  const [detalleId, setDetalleId] = useState(null);
  const [aDesactivar, setADesactivar] = useState(null);
  const { grupos, cargando, error, recargar } = useGrupos({ version });
  // Revisiones en curso, para mostrar su avance y continuarlas (PB-18).
  const enCurso = useConsulta(() => revisionesService.listar({ estado: "EN_CURSO" }), [version]);
  const revisionDe = useMemo(() => new Map((enCurso.datos ?? []).map((r) => [r.grupo_id, r])), [enCurso.datos]);
  const [revisionId, setRevisionId] = useState(null);
  const [iniciando, setIniciando] = useState(null);

  const apiariosOrdenados = useMemo(
    () => [...datos.apiarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [datos.apiarios]
  );
  // Se piden todos los grupos una vez y se filtran aquí, para comparar nombres al crear.
  const visibles = useMemo(
    () =>
      grupos
        .filter((g) => !apiarioId || String(g.apiario_id) === apiarioId)
        .sort(
          (a, b) =>
            nombreApiario(a.apiario_id).localeCompare(nombreApiario(b.apiario_id), "es") ||
            a.nombre.localeCompare(b.nombre, "es", { numeric: true })
        ),
    [grupos, apiarioId, nombreApiario]
  );
  const actualizar = () => setVersion((v) => v + 1);

  const guardar = async (valores) => {
    if (formulario?.grupo) {
      await gruposService.actualizar(formulario.grupo.id, valores);
      avisos.exito(`Grupo ${valores.nombre} actualizado.`);
    } else {
      const creado = await gruposService.crear(valores);
      avisos.exito(`Grupo ${creado?.nombre ?? valores.nombre} creado. Ahora agrégale colmenas.`);
      if (creado?.id) setDetalleId(creado.id);
    }
    setFormulario(null);
    actualizar();
  };

  const iniciarRevision = async (g) => {
    setIniciando(g.id);
    try {
      const sesion = await revisionesService.iniciar(g.id);
      setRevisionId(sesion.id);
      actualizar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setIniciando(null);
    }
  };

  const desactivar = async () => {
    await gruposService.desactivar(aDesactivar.id);
    avisos.exito(`Grupo ${aDesactivar.nombre} eliminado. Sus colmenas quedaron sin grupo.`);
    actualizar();
  };

  if (!cargado || (cargando && grupos.length === 0 && !error)) return <Cargando texto="Cargando grupos..." />;

  const grupoAbierto = grupos.find((g) => g.id === detalleId);

  return (
    <>
      <EncabezadoModulo descripcion="Colmenas agrupadas dentro de cada apiario. Inicia una revisión para inspeccionar las colmenas del grupo una tras otra.">
        {esAdmin && (
          <Boton icono={Plus} onClick={() => setFormulario({ apiarioInicial: apiarioId })}>
            Nuevo grupo
          </Boton>
        )}
      </EncabezadoModulo>

      <FiltroApiario apiarios={apiariosOrdenados} valor={apiarioId} onCambiar={setApiarioId} />

      {error ? (
        <ErrorCarga mensaje={`No se pudieron cargar los grupos. ${error}`} onReintentar={recargar} />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          icono={Layers}
          titulo={grupos.length === 0 ? "Todavía no hay grupos" : "Este apiario no tiene grupos"}
          texto={
            esAdmin
              ? "Crea un grupo y asígnale colmenas del mismo apiario."
              : "Un administrador puede crear los grupos."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {visibles.map((g) => (
            <article
              key={g.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5"
              aria-label={`Grupo ${g.nombre}`}
            >
              <button type="button" onClick={() => setDetalleId(g.id)} className="text-left">
                <h3 className="text-lg font-bold hover:underline">{g.nombre}</h3>
                <p className="text-sm text-slate-500">{nombreApiario(g.apiario_id)}</p>
              </button>
              {revisionDe.has(g.id) && (
                <div className="mt-3">
                  <Insignia tono="ambar">
                    Revisión en curso · {revisionDe.get(g.id).progreso.revisadas + revisionDe.get(g.id).progreso.omitidas}{" "}
                    de {revisionDe.get(g.id).progreso.total}
                  </Insignia>
                </div>
              )}
              <p className="mt-4 text-3xl font-bold text-slate-900">{g.cantidad_colmenas}</p>
              <p className="text-xs text-slate-500">{g.cantidad_colmenas === 1 ? "colmena" : "colmenas"}</p>
              {g.descripcion && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{g.descripcion}</p>}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <div className="flex w-full flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {revisionDe.has(g.id) ? (
                    <Boton tamano="sm" icono={ClipboardList} onClick={() => setRevisionId(revisionDe.get(g.id).id)}>
                      Continuar revisión
                    </Boton>
                  ) : (
                    <Boton
                      tamano="sm"
                      icono={ClipboardList}
                      disabled={g.cantidad_colmenas === 0}
                      title={g.cantidad_colmenas === 0 ? "El grupo no tiene colmenas" : undefined}
                      cargando={iniciando === g.id}
                      onClick={() => iniciarRevision(g)}
                    >
                      Iniciar revisión
                    </Boton>
                  )}
                  <Boton variante="secundario" tamano="sm" onClick={() => setDetalleId(g.id)}>
                    Ver colmenas
                  </Boton>
                  {esAdmin && (
                    <>
                      <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setFormulario({ grupo: g })}>
                        Editar
                      </Boton>
                      <Boton variante="fantasma" tamano="sm" icono={Archive} onClick={() => setADesactivar(g)}>
                        Eliminar
                      </Boton>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {detalleId && (
        <DetalleGrupo
          grupoId={detalleId}
          gruposDelApiario={grupos.filter((g) => g.apiario_id === grupoAbierto?.apiario_id)}
          puedeEditar={esAdmin}
          onEditar={(grupo) => {
            setDetalleId(null);
            setFormulario({ grupo });
          }}
          onCambio={actualizar}
          onCerrar={() => setDetalleId(null)}
        />
      )}

      {revisionId && <RevisionGrupo sesionId={revisionId} onCambio={actualizar} onCerrar={() => setRevisionId(null)} />}

      {formulario && (
        <FormularioGrupo
          grupo={formulario.grupo}
          apiarioInicial={formulario.apiarioInicial}
          gruposExistentes={grupos}
          onGuardar={guardar}
          onCerrar={() => setFormulario(null)}
        />
      )}

      {aDesactivar && (
        <Confirmar
          titulo={`¿Eliminar el grupo ${aDesactivar.nombre}?`}
          textoConfirmar="Eliminar grupo"
          onConfirmar={desactivar}
          onCerrar={() => setADesactivar(null)}
        >
          <p>
            Sus {aDesactivar.cantidad_colmenas} colmenas quedarán sin grupo. Las colmenas, sus inspecciones y el
            historial del grupo se conservan.
          </p>
        </Confirmar>
      )}
    </>
  );
}
