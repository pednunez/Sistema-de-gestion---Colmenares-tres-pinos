import { useState } from "react";
import { AlertTriangle, Frame, Package, Plus, Warehouse } from "lucide-react";
import Boton from "../components/ui/Boton";
import { Cargando, ErrorCarga, EstadoVacio } from "../components/ui/Estados";
import { EncabezadoModulo, Panel, TarjetaIndicador } from "../components/ui/Estructura";
import TarjetaMaterial from "../components/stock/TarjetaMaterial";
import FormularioMovimiento from "../components/stock/FormularioMovimiento";
import FormularioMinimo from "../components/stock/FormularioMinimo";
import AvisoStockBajo from "../components/stock/AvisoStockBajo";
import HistorialMovimientos from "../components/stock/HistorialMovimientos";
import { useAuth } from "../hooks/useAuth";
import { useAvisos } from "../hooks/useAvisos";
import { stockService } from "../services/stockService";
import { MATERIAL_STOCK, TIPO_MOVIMIENTO_STOCK } from "../utils/etiquetas";
import { useInventario } from "../hooks/useInventario";
import { cantidadCon } from "../utils/stock";

// Inventario de la bodega y sus movimientos. Solo el administrador registra
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
    avisos.exito(`${nombreTipo} registrado: ${movimiento.cantidad} · ${MATERIAL_STOCK[movimiento.material].texto.toLowerCase()}.`);
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

  const { items, totalDisponible, totalDanado, marcosListos, danados, bajos } = inventario;

  return (
    <>
      <EncabezadoModulo descripcion="Material de la bodega disponible para las colmenas y material dañado por reparar.">
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
          <TarjetaMaterial key={item.material} item={item} onCambiarMinimo={esAdmin ? setEditandoMinimo : undefined} />
        ))}
      </div>

      <Panel titulo="Material dañado" descripcion="Material roto que se puede reparar o descartar.">
        <div id="danado" className="scroll-mt-24" />
        {danados.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No hay material dañado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {danados.map((item) => (
              <li key={item.material} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span>{item.textoDanado ?? item.texto}</span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-red-600">{cantidadCon(item.danado, item.unidad)}</span>
                  {esAdmin && (
                    <>
                      <Boton
                        variante="secundario"
                        tamano="sm"
                        aria-label={`Reparar ${(item.textoDanado ?? item.texto).toLowerCase()}`}
                        onClick={() => setFormulario({ tipo: "REPARACION", material: item.material })}
                      >
                        Reparar
                      </Boton>
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        aria-label={`Descartar ${(item.textoDanado ?? item.texto).toLowerCase()}`}
                        onClick={() => setFormulario({ tipo: "DESCARTE", material: item.material })}
                      >
                        Descartar
                      </Boton>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
