import { AlertTriangle, Frame, Package, Warehouse } from "lucide-react";
import { Cargando, ErrorCarga, EstadoVacio } from "../components/ui/Estados";
import { EncabezadoModulo, Panel, TarjetaIndicador } from "../components/ui/Estructura";
import TarjetaMaterial from "../components/stock/TarjetaMaterial";
import { useInventario } from "../hooks/useInventario";
import { cantidadCon } from "../utils/stock";

// Inventario de la bodega: material disponible y material dañado por reparar.
// Los movimientos (ingresos, envíos, daños, reparaciones) llegan en el siguiente paso.
export default function StockPage() {
  const { inventario, noDisponible, cargando, error, recargar } = useInventario();

  if (cargando && !inventario) return <Cargando texto="Cargando inventario..." />;
  if (error) return <ErrorCarga mensaje={`No se pudo cargar el inventario. ${error}`} onReintentar={recargar} />;
  if (noDisponible) {
    return (
      <EstadoVacio
        icono={Warehouse}
        titulo="El inventario todavía no está disponible"
        texto="El servidor aún no tiene el módulo de stock. Cuando esté listo, aquí verás el material de la bodega."
      />
    );
  }

  const { items, totalDisponible, totalDanado, marcosListos, danados } = inventario;

  return (
    <>
      <EncabezadoModulo descripcion="Material de la bodega disponible para las colmenas y material dañado por reparar." />

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <TarjetaIndicador titulo="Material disponible" valor={totalDisponible} detalle="unidades en bodega" icono={Package} />
        <TarjetaIndicador titulo="Marcos listos para usar" valor={marcosListos} detalle="vacíos, con cera estirada y untada" icono={Frame} />
        <TarjetaIndicador
          titulo="Material dañado"
          valor={totalDanado}
          detalle={totalDanado > 0 ? "unidades por reparar" : "nada por reparar"}
          icono={AlertTriangle}
          alerta={totalDanado > 0}
          onClick={() => document.getElementById("danado")?.scrollIntoView({ behavior: "smooth" })}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <TarjetaMaterial key={item.material} item={item} />
        ))}
      </div>

      <Panel titulo="Material dañado" descripcion="Material roto que se puede reparar o descartar.">
        <div id="danado" className="scroll-mt-24" />
        {danados.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No hay material dañado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {danados.map((item) => (
              <li key={item.material} className="flex items-center justify-between px-5 py-3">
                <span>{item.textoDanado ?? item.texto}</span>
                <span className="font-semibold text-red-600">{cantidadCon(item.danado, item.unidad)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
