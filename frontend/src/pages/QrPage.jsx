import { useMemo, useState } from "react";
import { Printer, QrCode } from "lucide-react";
import Boton from "../components/ui/Boton";
import { Seleccion } from "../components/ui/Campo";
import { Cargando, EstadoVacio } from "../components/ui/Estados";
import { Buscador, EncabezadoModulo, Panel } from "../components/ui/Estructura";
import ImagenQr from "../components/colmenas/ImagenQr";
import { useDatos } from "../hooks/useDatos";

// Selección e impresión de etiquetas QR para pegar en las cajas (RF-19).
export default function QrPage() {
  const { datos, cargado, nombreApiario } = useDatos();
  const [filtroApiario, setFiltroApiario] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState(() => new Set());

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return datos.colmenas
      .filter((c) => !filtroApiario || String(c.apiario_id) === filtroApiario)
      .filter((c) => c.codigo.toLowerCase().includes(termino))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  }, [datos.colmenas, filtroApiario, busqueda]);

  const seleccionadas = datos.colmenas.filter((c) => seleccion.has(c.id));
  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((c) => seleccion.has(c.id));

  const alternar = (id) => {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(id)) nueva.delete(id);
      else nueva.add(id);
      return nueva;
    });
  };

  const alternarVisibles = () => {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      visibles.forEach((c) => (todasVisiblesMarcadas ? nueva.delete(c.id) : nueva.add(c.id)));
      return nueva;
    });
  };

  if (!cargado) return <Cargando texto="Cargando colmenas..." />;

  return (
    <>
      <EncabezadoModulo descripcion="Elige las colmenas y genera sus etiquetas para imprimir y pegar en cada caja.">
        <Boton icono={Printer} disabled={seleccionadas.length === 0} onClick={() => window.print()}>
          Imprimir {seleccionadas.length > 0 ? `${seleccionadas.length} etiquetas` : "etiquetas"}
        </Boton>
      </EncabezadoModulo>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] print:block">
        <Panel className="print:hidden">
          <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2">
            <Seleccion
              aria-label="Filtrar por apiario"
              value={filtroApiario}
              onChange={(e) => setFiltroApiario(e.target.value)}
              placeholder="Todos los apiarios"
              opciones={datos.apiarios.map((a) => ({ valor: String(a.id), texto: a.nombre }))}
            />
            <Buscador valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar código" etiqueta="Buscar colmena por código" />
          </div>

          <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium">
            <input type="checkbox" checked={todasVisiblesMarcadas} onChange={alternarVisibles} className="h-4 w-4 accent-amber-500" />
            Seleccionar las {visibles.length} colmenas de la lista
          </label>

          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {visibles.map((colmena) => (
              <li key={colmena.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={seleccion.has(colmena.id)}
                    onChange={() => alternar(colmena.id)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span className="font-semibold">{colmena.codigo}</span>
                  <span className="text-sm text-slate-500">{nombreApiario(colmena.apiario_id)}</span>
                </label>
              </li>
            ))}
          </ul>
        </Panel>

        <section aria-label="Etiquetas seleccionadas">
          {seleccionadas.length === 0 ? (
            <div className="print:hidden">
              <EstadoVacio
                icono={QrCode}
                titulo="Selecciona colmenas para ver sus etiquetas"
                texto="Puedes marcar todas las colmenas de un apiario a la vez."
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-0">
              {seleccionadas.map((colmena) => (
                <div
                  key={colmena.id}
                  className="flex break-inside-avoid flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 text-center print:rounded-none print:border-dashed print:border-slate-400"
                >
                  <ImagenQr colmena={colmena} className="w-36" />
                  <p className="mt-2 text-xl font-bold">{colmena.codigo}</p>
                  <p className="text-sm text-slate-600">{nombreApiario(colmena.apiario_id)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
