import { useMemo, useState } from "react";
import { Archive, MapPinned, Pencil, Plus } from "lucide-react";
import Boton from "../components/ui/Boton";
import Confirmar from "../components/ui/Confirmar";
import Insignia from "../components/ui/Insignia";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { Buscador, EncabezadoModulo } from "../components/ui/Estructura";
import FormularioApiario from "../components/apiarios/FormularioApiario";
import { useDatos } from "../hooks/useDatos";
import { useAvisos } from "../hooks/useAvisos";
import { useNavegacion } from "../hooks/useNavegacion";
import { apiariosService } from "../services/apiariosService";
import { calcularAlertas } from "../utils/alertas";

export default function ApiariosPage() {
  const { datos, cargado, recargar } = useDatos();
  const avisos = useAvisos();
  const { navegar } = useNavegacion();

  const [busqueda, setBusqueda] = useState("");
  const [formulario, setFormulario] = useState(null);
  const [aDarDeBaja, setADarDeBaja] = useState(null);

  const tarjetas = useMemo(() => {
    const alertas = calcularAlertas(datos.colmenas, datos.inspecciones);
    const termino = busqueda.trim().toLowerCase();
    return datos.apiarios
      .filter((a) => `${a.nombre} ${a.ubicacion ?? ""}`.toLowerCase().includes(termino))
      .map((apiario) => ({
        apiario,
        colmenas: datos.colmenas.filter((c) => c.apiario_id === apiario.id).length,
        alertas: alertas.filter((a) => a.colmena.apiario_id === apiario.id).length,
      }));
  }, [datos, busqueda]);

  const guardar = async (valores) => {
    if (formulario?.id) {
      await apiariosService.actualizar(formulario.id, valores);
      avisos.exito("Apiario actualizado.");
    } else {
      await apiariosService.crear(valores);
      avisos.exito("Apiario registrado.");
    }
    await recargar();
    setFormulario(null);
  };

  const darDeBaja = async () => {
    await apiariosService.darDeBaja(aDarDeBaja.apiario.id);
    await recargar();
    avisos.exito(`Apiario ${aDarDeBaja.apiario.nombre} dado de baja. Su historial se conserva.`);
  };

  if (!cargado) return <Cargando texto="Cargando apiarios..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Sectores donde se agrupan las colmenas.">
        <Boton icono={Plus} onClick={() => setFormulario({})}>
          Nuevo apiario
        </Boton>
      </EncabezadoModulo>

      <div className="mb-5 max-w-sm">
        <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por nombre o ubicación" />
      </div>

      {tarjetas.length === 0 ? (
        <EstadoVacio
          icono={MapPinned}
          titulo={busqueda ? "Ningún apiario coincide con la búsqueda" : "Aún no hay apiarios registrados"}
          texto={busqueda ? "Prueba con otro nombre." : "Registra el primer apiario para comenzar a asociarle colmenas."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {tarjetas.map(({ apiario, colmenas, alertas }) => (
            <article key={apiario.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold">{apiario.nombre}</h3>
                  <p className="text-sm text-slate-500">{apiario.ubicacion || "Ubicación sin registrar"}</p>
                </div>
                <MapPinned className="shrink-0 text-amber-500" aria-hidden="true" />
              </div>

              {apiario.descripcion && <p className="mt-3 text-sm text-slate-600">{apiario.descripcion}</p>}

              <div className="mb-5 mt-4 flex flex-wrap gap-2">
                <Insignia tono="gris">
                  {colmenas} {colmenas === 1 ? "colmena" : "colmenas"}
                </Insignia>
                {alertas > 0 && <Insignia tono="ambar">{alertas} requieren atención</Insignia>}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Boton variante="secundario" tamano="sm" onClick={() => navegar("colmenas", { apiario: apiario.id })}>
                  Ver colmenas
                </Boton>
                <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setFormulario(apiario)}>
                  Editar
                </Boton>
                <Boton variante="fantasma" tamano="sm" icono={Archive} onClick={() => setADarDeBaja({ apiario, colmenas })}>
                  Dar de baja
                </Boton>
              </div>
            </article>
          ))}
        </div>
      )}

      {formulario && (
        <FormularioApiario apiario={formulario} onGuardar={guardar} onCerrar={() => setFormulario(null)} />
      )}

      {aDarDeBaja && aDarDeBaja.colmenas > 0 && (
        <Confirmar
          titulo="No se puede dar de baja todavía"
          textoConfirmar="Ver sus colmenas"
          variante="primario"
          onConfirmar={async () => navegar("colmenas", { apiario: aDarDeBaja.apiario.id })}
          onCerrar={() => setADarDeBaja(null)}
        >
          <p>
            {aDarDeBaja.apiario.nombre} tiene {aDarDeBaja.colmenas} colmenas activas. Muévelas a otro apiario o dalas de
            baja antes de dar de baja el apiario.
          </p>
        </Confirmar>
      )}

      {aDarDeBaja && aDarDeBaja.colmenas === 0 && (
        <Confirmar
          titulo={`¿Dar de baja ${aDarDeBaja.apiario.nombre}?`}
          textoConfirmar="Dar de baja"
          onConfirmar={darDeBaja}
          onCerrar={() => setADarDeBaja(null)}
        >
          <p>El apiario dejará de aparecer en las listas, pero su historial se conserva para consultas futuras.</p>
        </Confirmar>
      )}
    </>
  );
}
