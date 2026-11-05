import { useState } from "react";
import { AlertTriangle, Frame, Package, Plus, Warehouse, Wrench } from "lucide-react";
import Boton from "../components/ui/Boton";
import { Cargando, ErrorCarga, EstadoVacio } from "../components/ui/Estados";
import { EncabezadoModulo, TarjetaIndicador } from "../components/ui/Estructura";
import TarjetaMaterial from "../components/stock/TarjetaMaterial";
import FormularioMovimiento from "../components/stock/FormularioMovimiento";
import FormularioMinimo from "../components/stock/FormularioMinimo";
import AvisoStockBajo from "../components/stock/AvisoStockBajo";
import PanelReparaciones from "../components/stock/PanelReparaciones";
import HistorialMovimientos from "../components/stock/HistorialMovimientos";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { stockService } from "../services/stockService";
import { MATERIAL_STOCK, TIPO_MOVIMIENTO_STOCK } from "../utils/etiquetas";
import { useInventario } from "../hooks/useInventario";

// Inventario de la bodega central y sus movimientos. Solo el administrador registra
// movimientos; el apicultor consulta.
export default function StockPage() {
  const { esAdmin } = useAuth();
  const avisos = useAvisos();
  const { inventario, noDisponible, cargando, error, recargar } = useInventario();
  const [formulario, setFormulario] = useState(null);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const [editandoMinimo, setEditandoMinimo] = useState(null);

  const guardarMinimo = async (material, minimo) => {
    await stockService.actualizarMinimo(material, minimo);
    avisos.exito(
      minimo === null
        ? `Se quitó el mínimo de ${MATERIAL_STOCK[material].texto.toLowerCase()}.`
        : `Mínimo de ${MATERIAL_STOCK[material].texto.toLowerCase()}: ${minimo}.`
    );
    setEditandoMinimo(null);
    recargar();
  };

  const registrar = async (movimiento) => {
    await stockService.registrarMovimiento(movimiento);
    const { texto: nombreTipo } = TIPO_MOVIMIENTO_STOCK[movimiento.tipo];
    avisos.exito(
      movimiento.tipo === "EXTRACCION"
        ? `Extracción registrada: ${movimiento.cantidad} ${movimiento.cantidad === 1 ? "marco con miel pasa" : "marcos con miel pasan"} a cera untada.`
        : `${nombreTipo} registrado: ${movimiento.cantidad} · ${MATERIAL_STOCK[movimiento.material].texto.toLowerCase()}.`
    );
    setFormulario(null);
    recargar();
    setVersionHistorial((v) => v + 1);
  };

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

  const { items, totalDisponible, totalDanado, totalEnReparacion, totalMerma, marcosListos, conPendientes, bajos } = inventario;

  return (
    <>
      <EncabezadoModulo descripcion="Material de la bodega central: lo disponible para las colmenas, lo dañado y lo que está en reparación.">
        {esAdmin && (
          <Boton icono={Plus} onClick={() => setFormulario({})}>
            Registrar movimiento
          </Boton>
        )}
      </EncabezadoModulo>

      {bajos.length > 0 && (
        <div className="mb-6">
          <AvisoStockBajo bajos={bajos} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaIndicador titulo="Material disponible" valor={totalDisponible} detalle="unidades listas para usar" icono={Package} />
        <TarjetaIndicador titulo="Marcos listos para usar" valor={marcosListos} detalle="vacíos y con cera (sin contar los de miel)" icono={Frame} />
        <TarjetaIndicador
          titulo="Dañado"
          valor={totalDanado}
          detalle={totalDanado > 0 ? "unidades por llevar a reparar" : "nada dañado"}
          icono={AlertTriangle}
          alerta={totalDanado > 0}
          onClick={() => document.getElementById("reparaciones")?.scrollIntoView({ behavior: "smooth" })}
        />
        <TarjetaIndicador
          titulo="En reparación"
          valor={totalEnReparacion}
          detalle={`Merma acumulada: ${totalMerma}`}
          icono={Wrench}
          onClick={() => document.getElementById("reparaciones")?.scrollIntoView({ behavior: "smooth" })}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <TarjetaMaterial key={item.material} item={item} onCambiarMinimo={esAdmin ? setEditandoMinimo : undefined} />
        ))}
      </div>

      <PanelReparaciones items={conPendientes} puedeEditar={esAdmin} onAccion={setFormulario} />

      <div className="mt-6">
        <HistorialMovimientos version={versionHistorial} />
      </div>

      {editandoMinimo && (
        <FormularioMinimo item={editandoMinimo} onGuardar={guardarMinimo} onCerrar={() => setEditandoMinimo(null)} />
      )}

      {formulario && (
        <FormularioMovimiento
          inventario={inventario}
          inicial={formulario}
          onGuardar={registrar}
          onCerrar={() => setFormulario(null)}
        />
      )}
    </>
  );
}
