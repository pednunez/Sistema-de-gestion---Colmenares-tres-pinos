import { Loader2 } from "lucide-react";

import { AuthProvider } from "./context/AuthProvider";
import { AvisosProvider } from "./context/AvisosProvider";
import { DatosProvider } from "./context/DatosProvider";
import { NavegacionProvider } from "./context/NavegacionProvider";
import { useAuth } from "./hooks/useAuth";
import { vistaInicial } from "./config/menu";

import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ApiariosPage from "./pages/ApiariosPage";
import ColmenasPage from "./pages/ColmenasPage";
import InspeccionesPage from "./pages/InspeccionesPage";
import TratamientosPage from "./pages/TratamientosPage";
import TransferenciasPage from "./pages/TransferenciasPage";
import QrPage from "./pages/QrPage";
import AuditoriaPage from "./pages/AuditoriaPage";
import UsuariosPage from "./pages/UsuariosPage";
import SinAccesoPage from "./pages/SinAccesoPage";

const PAGINAS = {
  dashboard: DashboardPage,
  apiarios: ApiariosPage,
  colmenas: ColmenasPage,
  inspecciones: InspeccionesPage,
  tratamientos: TratamientosPage,
  transferencias: TransferenciasPage,
  qr: QrPage,
  auditoria: AuditoriaPage,
  usuarios: UsuariosPage,
};

function Contenido() {
  const { usuario, verificando } = useAuth();

  if (verificando) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-100 text-slate-500" role="status">
        <Loader2 size={24} className="animate-spin text-amber-500" aria-hidden="true" />
        Verificando sesión...
      </div>
    );
  }

  if (!usuario) return <LoginPage />;

  return (
    <DatosProvider key={usuario.id}>
      <NavegacionProvider vistaInicial={vistaInicial(usuario.rol)}>
        <AppLayout paginas={PAGINAS} sinAcceso={SinAccesoPage} />
      </NavegacionProvider>
    </DatosProvider>
  );
}

export default function App() {
  return (
    <AvisosProvider>
      <AuthProvider>
        <Contenido />
      </AuthProvider>
    </AvisosProvider>
  );
}
