import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, MapPinned, Pill } from "lucide-react";
import Boton from "../components/ui/Boton";
import Insignia from "../components/ui/Insignia";
import { Cargando } from "../components/ui/Estados";
import { Panel, TarjetaIndicador } from "../components/ui/Estructura";
import AvisoStockBajo from "../components/stock/AvisoStockBajo";
import FiltroApiario from "../components/ui/FiltroApiario";
import { useDatos } from "../hooks/useDatos";
import { ESTADO_GENERAL } from "../utils/etiquetas";
import { useInventario } from "../hooks/useInventario";
import { useNavegacion } from "../hooks/useNavegacion";
import { calcularAlertas, colmenaOperativa, ultimaInspeccionPorColmena, DIAS_SIN_INSPECCION } from "../utils/alertas";

// Estado según la última inspección (PB-08). Las inspecciones con la escala
// anterior (Bueno, Regular, Crítico) se agrupan aparte.
const DISTRIBUCION = [
  { clave: "COMPLETA", texto: "Completa", barra: "bg-emerald-500" },
  { clave: "EN_DESARROLLO", texto: "En desarrollo", barra: "bg-sky-500" },
  { clave: "DONANTE", texto: "Donante", barra: "bg-teal-500" },
  { clave: "DEBIL", texto: "Débil", barra: "bg-amber-400" },
  { clave: "REQUIERE_REVISION", texto: "Requiere revisión", barra: "bg-red-500" },
  { clave: "ANTERIOR", texto: "Escala anterior", barra: "bg-slate-400", soloSiHay: true },
  { clave: "SIN", texto: "Sin inspección", barra: "bg-slate-300" },
];

export default function DashboardPage() {
  const { datos, cargado, nombreApiario } = useDatos();
  // "" = todos los apiarios; si no, el id del apiario elegido.
  const [apiarioId, setApiarioId] = useState("");
  const { navegar } = useNavegacion();
  // Si el backend aún no tiene stock, el inventario queda en null y no se muestra nada.
  const { inventario } = useInventario();

  const apiariosOrdenados = useMemo(
    () => [...datos.apiarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [datos.apiarios]
  );
  const apiarioElegido = datos.apiarios.find((a) => String(a.id) === apiarioId) ?? null;

  const resumen = useMemo(() => {
    const todasOperativas = datos.colmenas.filter(colmenaOperativa);
    const todasAlertas = calcularAlertas(datos.colmenas, datos.inspecciones);
    const delApiario = (colmena) => !apiarioId || String(colmena.apiario_id) === apiarioId;
    const operativas = todasOperativas.filter(delApiario);
    const alertas = todasAlertas.filter((a) => delApiario(a.colmena));
    const idsColmenas = new Set(datos.colmenas.filter(delApiario).map((c) => c.id));
    const ultimas = ultimaInspeccionPorColmena(datos.inspecciones);

    const conteo = Object.fromEntries(DISTRIBUCION.map((fila) => [fila.clave, 0]));
    for (const colmena of operativas) {
      const estado = ultimas.get(colmena.id)?.estado_general;
      if (!estado) conteo.SIN += 1;
      else if (estado in ESTADO_GENERAL) conteo[estado] += 1;
      else conteo.ANTERIOR += 1;
    }

    // La tabla por apiario siempre muestra todos, para comparar.
    const porApiario = apiariosOrdenados.map((apiario) => ({
      apiario,
      colmenas: todasOperativas.filter((c) => c.apiario_id === apiario.id).length,
      alertas: todasAlertas.filter((a) => a.colmena.apiario_id === apiario.id).length,
    }));

    return {
      operativas,
      alertas,
      conteo,
      porApiario,
      tratamientosEnCurso: datos.tratamientos.filter((t) => t.estado === "EN_CURSO" && idsColmenas.has(t.colmena_id)).length,
    };
  }, [datos, apiarioId, apiariosOrdenados]);

  if (!cargado) return <Cargando texto="Cargando resumen..." />;

  const total = resumen.operativas.length;
  const prioridadAlta = resumen.alertas.filter((a) => a.prioridad === "alta").length;

  return (
    <>
      {inventario?.bajos.length > 0 && (
        <div className="mb-6">
          <AvisoStockBajo bajos={inventario.bajos} onVer={() => navegar("stock")} />
        </div>
      )}

      <FiltroApiario apiarios={apiariosOrdenados} valor={apiarioId} onCambiar={setApiarioId} />

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {apiarioElegido ? (
          <TarjetaIndicador
            titulo="Apiario"
            valor={apiarioElegido.nombre}
            detalle={apiarioElegido.ubicacion || undefined}
            icono={MapPinned}
            onClick={() => navegar("apiarios")}
          />
        ) : (
          <TarjetaIndicador titulo="Apiarios" valor={datos.apiarios.length} icono={MapPinned} onClick={() => navegar("apiarios")} />
        )}
        <TarjetaIndicador
          titulo="Colmenas en operación"
          valor={total}
          icono={Boxes}
          onClick={() => navegar("colmenas", apiarioElegido ? { apiario: apiarioElegido.id } : {})}
        />
        <TarjetaIndicador
          titulo="Requieren atención"
          valor={resumen.alertas.length}
          detalle={prioridadAlta > 0 ? `${prioridadAlta} con prioridad alta` : undefined}
          icono={AlertTriangle}
          alerta={prioridadAlta > 0}
          onClick={() => document.getElementById("alertas")?.scrollIntoView({ behavior: "smooth" })}
        />
        <TarjetaIndicador
          titulo="Tratamientos en curso"
          valor={resumen.tratamientosEnCurso}
          icono={Pill}
          onClick={() => navegar("tratamientos")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          titulo="Colmenas que requieren atención"
          descripcion={`${apiarioElegido ? `${apiarioElegido.nombre}. ` : ""}Según su última inspección, su estado o más de ${DIAS_SIN_INSPECCION} días sin revisar.`}
          className="xl:col-span-2"
        >
          <div id="alertas" className="scroll-mt-24" />
          {resumen.alertas.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-10 text-slate-600">
              <CheckCircle2 className="text-emerald-500" aria-hidden="true" />
              Todas las colmenas están al día.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {resumen.alertas.slice(0, 10).map(({ colmena, prioridad, motivos }) => (
                <li key={colmena.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{colmena.codigo}</p>
                      <span className="text-sm text-slate-500">{nombreApiario(colmena.apiario_id)}</span>
                      <Insignia tono={prioridad === "alta" ? "rojo" : "ambar"}>
                        {prioridad === "alta" ? "Prioridad alta" : "Revisar"}
                      </Insignia>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{motivos.join(" · ")}</p>
                  </div>
                  <Boton variante="secundario" tamano="sm" onClick={() => navegar("colmenas", { detalle: colmena.id })}>
                    Ver colmena
                  </Boton>
                </li>
              ))}
            </ul>
          )}
          {resumen.alertas.length > 10 && (
            <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              Y {resumen.alertas.length - 10} colmenas más. Revísalas en el módulo Colmenas.
            </p>
          )}
        </Panel>

        <Panel
          titulo="Estado según última inspección"
          descripcion={`${apiarioElegido ? `${apiarioElegido.nombre} · ` : ""}${total} colmenas en operación`}
        >
          <div className="grid gap-5 p-5">
            {DISTRIBUCION.filter((fila) => !fila.soloSiHay || resumen.conteo[fila.clave] > 0).map((fila) => {
              const cantidad = resumen.conteo[fila.clave];
              const porcentaje = total ? Math.round((cantidad * 100) / total) : 0;
              return (
                <div key={fila.clave}>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">{fila.texto}</span>
                    <span className="font-semibold">
                      {cantidad} <span className="font-normal text-slate-400">({porcentaje}%)</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${fila.barra}`} style={{ width: `${porcentaje}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel titulo="Resumen por apiario" className="xl:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Apiario</th>
                  <th className="px-5 py-3 font-medium">Ubicación</th>
                  <th className="px-5 py-3 font-medium">Colmenas en operación</th>
                  <th className="px-5 py-3 font-medium">Requieren atención</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {resumen.porApiario.map(({ apiario, colmenas, alertas }) => (
                  <tr
                    key={apiario.id}
                    className={`border-t border-slate-100 ${String(apiario.id) === apiarioId ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-5 py-3 font-semibold">{apiario.nombre}</td>
                    <td className="px-5 py-3 text-slate-600">{apiario.ubicacion || "Sin registrar"}</td>
                    <td className="px-5 py-3">{colmenas}</td>
                    <td className="px-5 py-3">
                      {alertas > 0 ? <Insignia tono="ambar">{alertas}</Insignia> : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Boton
                          variante="fantasma"
                          tamano="sm"
                          onClick={() => {
                            setApiarioId(String(apiario.id));
                            window.scrollTo?.({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Ver en el panel
                        </Boton>
                        <Boton variante="fantasma" tamano="sm" onClick={() => navegar("colmenas", { apiario: apiario.id })}>
                          Ver colmenas
                        </Boton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
