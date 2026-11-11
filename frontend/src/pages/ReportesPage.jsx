import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, FileDown, Table2 } from "lucide-react";
import Boton from "../components/ui/Boton";
import { Entrada, Seleccion, Segmentado } from "../components/ui/Campo";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { EncabezadoModulo, Panel } from "../components/ui/Estructura";
import { useDatos } from "../hooks/useDatos";
import { colmenaOperativa } from "../utils/alertas";
import { opciones } from "../utils/etiquetas";
import { hoyISO } from "../utils/formato";
import { FILTROS_REPORTE, TIPO_REPORTE, armarReporte, describirFiltros } from "../utils/reportes";

const FILAS_VISTA_PREVIA = 25;
const OPCIONES_TIPO = Object.entries(TIPO_REPORTE).map(([valor, info]) => ({ valor, texto: info.texto }));

// Descargas. Se habilitan cuando se defina con José si los archivos los genera
// el backend (S4-T07 a S4-T09) o el frontend con estas mismas filas.
const FORMATOS = [
  { id: "PDF", texto: "PDF", icono: FileText },
  { id: "XLSX", texto: "Excel (XLSX)", icono: FileSpreadsheet },
  { id: "CSV", texto: "CSV", icono: FileDown },
];

// Reportes con filtros y vista previa (S4-T10). Solo para el administrador.
export default function ReportesPage() {
  const { datos, cargado, codigoColmena, nombreApiario, nombreUsuario } = useDatos();
  const [filtros, setFiltros] = useState(FILTROS_REPORTE);
  const buscar = useMemo(() => ({ codigoColmena, nombreApiario, nombreUsuario }), [codigoColmena, nombreApiario, nombreUsuario]);

  const tipo = TIPO_REPORTE[filtros.tipo];
  const cambiar = (campo, valor) =>
    setFiltros((previos) => {
      const nuevos = { ...previos, [campo]: valor };
      // El estado depende del tipo de reporte, y la colmena, del apiario.
      if (campo === "tipo") nuevos.estado = "";
      if (campo === "apiario" && valor) {
        const elegida = datos.colmenas.find((c) => String(c.id) === previos.colmena);
        if (elegida && String(elegida.apiario_id) !== valor) nuevos.colmena = "";
      }
      return nuevos;
    });

  const apiarios = useMemo(
    () => [...datos.apiarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((a) => ({ valor: String(a.id), texto: a.nombre })),
    [datos.apiarios]
  );
  const colmenas = useMemo(
    () =>
      datos.colmenas
        .filter((c) => colmenaOperativa(c) && (!filtros.apiario || String(c.apiario_id) === filtros.apiario))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
        .map((c) => ({ valor: String(c.id), texto: c.codigo })),
    [datos.colmenas, filtros.apiario]
  );

  const reporte = useMemo(() => armarReporte(filtros, datos, buscar), [filtros, datos, buscar]);
  const hayFiltros = Object.entries(filtros).some(([campo, valor]) => campo !== "tipo" && valor);
  const fechasInvertidas = filtros.desde && filtros.hasta && filtros.desde > filtros.hasta;

  if (!cargado) return <Cargando texto="Cargando datos..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Elige el reporte y sus filtros. La vista previa muestra lo que tendrá el archivo." />

      <div className="mb-5 grid gap-2">
        <Segmentado
          etiqueta="Reporte"
          opciones={OPCIONES_TIPO}
          valor={filtros.tipo}
          onCambiar={(valor) => cambiar("tipo", valor)}
          className="lg:max-w-2xl"
        />
        <p className="text-sm text-slate-500">{tipo.descripcion}</p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        {tipo.conPeriodo && (
          <>
            <Entrada
              etiqueta="Desde"
              type="date"
              value={filtros.desde}
              max={filtros.hasta || hoyISO()}
              onChange={(e) => cambiar("desde", e.target.value)}
              error={fechasInvertidas ? "Debe ser anterior a «Hasta»." : undefined}
            />
            <Entrada
              etiqueta="Hasta"
              type="date"
              value={filtros.hasta}
              min={filtros.desde || undefined}
              max={hoyISO()}
              onChange={(e) => cambiar("hasta", e.target.value)}
            />
          </>
        )}
        <Seleccion
          etiqueta="Apiario"
          value={filtros.apiario}
          onChange={(e) => cambiar("apiario", e.target.value)}
          placeholder="Todos los apiarios"
          opciones={apiarios}
        />
        <Seleccion
          etiqueta="Colmena"
          value={filtros.colmena}
          onChange={(e) => cambiar("colmena", e.target.value)}
          placeholder="Todas las colmenas"
          opciones={colmenas}
        />
        <Seleccion
          etiqueta="Estado"
          value={filtros.estado}
          onChange={(e) => cambiar("estado", e.target.value)}
          placeholder="Todos los estados"
          opciones={opciones(tipo.estados)}
        />
        {hayFiltros && (
          <div>
            <Boton variante="fantasma" onClick={() => setFiltros({ ...FILTROS_REPORTE, tipo: filtros.tipo })}>
              Limpiar filtros
            </Boton>
          </div>
        )}
      </div>

      <Panel
        titulo={`Vista previa: ${tipo.titulo}`}
        descripcion={`${describirFiltros(filtros, buscar)} · ${reporte.filas.length} ${reporte.filas.length === 1 ? "fila" : "filas"}`}
      >
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Descargar reporte">
            {FORMATOS.map((formato) => (
              <Boton key={formato.id} variante="secundario" tamano="sm" icono={formato.icono} disabled>
                {formato.texto}
              </Boton>
            ))}
          </div>
          <p className="text-xs text-slate-500">La descarga se habilita cuando se defina con el backend cómo se generan los archivos.</p>
        </div>

        {reporte.filas.length === 0 ? (
          <EstadoVacio
            icono={Table2}
            titulo="No hay datos con estos filtros"
            texto={hayFiltros ? "Amplía el período o limpia los filtros." : "Todavía no hay registros para este reporte."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <caption className="sr-only">{`Filas del reporte de ${tipo.titulo.toLowerCase()}`}</caption>
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    {reporte.columnas.map((columna) => (
                      <th key={columna} className="whitespace-nowrap px-4 py-3 font-medium">
                        {columna}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reporte.filas.slice(0, FILAS_VISTA_PREVIA).map((fila, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {fila.map((valor, j) => (
                        <td key={j} className={`px-4 py-2.5 ${j === 0 ? "whitespace-nowrap font-medium text-slate-900" : "text-slate-700"}`}>
                          {valor}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reporte.filas.length > FILAS_VISTA_PREVIA && (
              <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                Se muestran las primeras {FILAS_VISTA_PREVIA}. El archivo incluye las {reporte.filas.length} filas.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
