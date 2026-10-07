import { useState } from "react";
import BarraLateral from "./BarraLateral";
import Cabecera from "./Cabecera";
import { ErrorCarga } from "../ui/Estados";
import { useAuth } from "../../hooks/useAuth";
import { useDatos } from "../../hooks/useDatos";
import { useNavegacion } from "../../hooks/useNavegacion";
import { useAvisos } from "../../hooks/useAvisos";
import { menuParaRol } from "../../config/menu";

export default function AppLayout({ paginas, sinAcceso: SinAcceso }) {
  const { usuario, cerrarSesion } = useAuth();
  const { cargando, cargado, error, recargar } = useDatos();
  const { vista, clave, navegar } = useNavegacion();
  const avisos = useAvisos();
  const [menuMovil, setMenuMovil] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const salir = async () => {
    if (cerrando) return;
    setCerrando(true);
    try {
      await cerrarSesion();
    } catch (err) {
      setCerrando(false);
      avisos.error(`No se pudo cerrar la sesión. ${err.message}`);
    }
  };

  const items = menuParaRol(usuario.rol);
  const itemActual = items.find((item) => item.id === vista);
  const Pagina = itemActual ? paginas[vista] : SinAcceso;

  const irA = (id) => {
    setMenuMovil(false);
    navegar(id);
  };

  const propsBarra = {
    items,
    vistaActiva: vista,
    onNavegar: irA,
    usuario,
    onCerrarSesion: salir,
    cerrando,
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900 print:block print:bg-white">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 lg:block print:hidden">
        <BarraLateral {...propsBarra} />
      </aside>

      {menuMovil && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 lg:hidden print:hidden" onClick={() => setMenuMovil(false)}>
          <div className="h-full w-72 max-w-[85vw]" onClick={(evento) => evento.stopPropagation()}>
            <BarraLateral {...propsBarra} onCerrar={() => setMenuMovil(false)} />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <Cabecera
          titulo={itemActual?.nombre ?? "Sin acceso"}
          usuario={usuario}
          actualizando={cargando && cargado}
          onActualizar={recargar}
          onAbrirMenu={() => setMenuMovil(true)}
        />

        <main className="mx-auto max-w-[1600px] p-5 lg:p-8 print:max-w-none print:p-0">
          {error && (
            <div className="mb-6">
              <ErrorCarga mensaje={`No fue posible cargar los datos. ${error}`} onReintentar={recargar} />
            </div>
          )}
          <Pagina key={clave} />
        </main>
      </div>
    </div>
  );
}
