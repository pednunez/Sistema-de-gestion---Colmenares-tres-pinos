import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  MapPinned,
  Boxes,
  ClipboardCheck,
  Pill,
  ArrowRightLeft,
  QrCode,
  ShieldCheck,
  Users,
  LogOut,
  Activity,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

function App() {
  const [apiarios, setApiarios] = useState([]);
  const [colmenas, setColmenas] = useState([]);
  const [inspecciones, setInspecciones] = useState([]);
  const [tratamientos, setTratamientos] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:8000/apiarios/").then((r) => r.json()),
      fetch("http://127.0.0.1:8000/colmenas/").then((r) => r.json()),
      fetch("http://127.0.0.1:8000/inspecciones/").then((r) => r.json()),
      fetch("http://127.0.0.1:8000/tratamientos/").then((r) => r.json()),
    ])
      .then(([apiariosData, colmenasData, inspeccionesData, tratamientosData]) => {
        setApiarios(apiariosData);
        setColmenas(colmenasData);
        setInspecciones(inspeccionesData);
        setTratamientos(tratamientosData);
      })
      .catch(() => {
        setError("No fue posible cargar los datos del sistema");
      });
  }, []);

  const menu = [
    { nombre: "Dashboard", icono: LayoutDashboard },
    { nombre: "Apiarios", icono: MapPinned },
    { nombre: "Colmenas", icono: Boxes },
    { nombre: "Inspecciones", icono: ClipboardCheck },
    { nombre: "Tratamientos", icono: Pill },
    { nombre: "Transferencias", icono: ArrowRightLeft },
    { nombre: "QR", icono: QrCode },
    { nombre: "Auditoría", icono: ShieldCheck },
    { nombre: "Usuarios", icono: Users },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">
      <aside className="w-64 bg-slate-950 text-white min-h-screen p-5 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold">Colmenares</h1>
          <p className="text-sm text-slate-400">Tres Pinos</p>
        </div>

        <nav className="space-y-2 flex-1">
          {menu.map((item, index) => {
            const Icon = item.icono;

            return (
              <button
                key={item.nombre}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                  index === 0
                    ? "bg-amber-500 text-slate-950 font-semibold"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Icon size={19} />
                {item.nombre}
              </button>
            );
          })}
        </nav>

        <button className="flex items-center gap-3 text-slate-400 hover:text-white">
          <LogOut size={19} />
          Cerrar sesión
        </button>
      </aside>

      <main className="flex-1 p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">Dashboard</h2>
            <p className="text-slate-500">
              Resumen operativo de Colmenares Tres Pinos
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-500">Usuario</p>
            <p className="font-semibold">Administrador</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          <Tarjeta
            titulo="Apiarios"
            valor={apiarios.length}
            icono={MapPinned}
          />
          <Tarjeta
            titulo="Colmenas activas"
            valor={colmenas.length}
            icono={Boxes}
          />
          <Tarjeta
            titulo="Inspecciones"
            valor={inspecciones.length}
            icono={ClipboardCheck}
          />
          <Tarjeta
            titulo="Tratamientos"
            valor={tratamientos.length}
            icono={Pill}
          />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold">Apiarios registrados</h3>
                <p className="text-sm text-slate-500">
                  Estado actual de los apiarios
                </p>
              </div>

              <Activity className="text-amber-500" />
            </div>

            <div className="space-y-3">
              {apiarios.map((apiario) => (
                <div
                  key={apiario.id}
                  className="flex items-center justify-between border border-slate-200 rounded-xl p-4"
                >
                  <div>
                    <p className="font-semibold">{apiario.nombre}</p>
                    <p className="text-sm text-slate-500">
                      {apiario.ubicacion || "Ubicación no registrada"}
                    </p>
                  </div>

                  <span className="flex items-center gap-2 text-sm text-emerald-600 font-medium">
                    <CheckCircle2 size={17} />
                    Activo
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-5">
              Estado del sistema
            </h3>

            <div className="space-y-4">
              <Estado
                icono={CheckCircle2}
                titulo="Backend"
                detalle="FastAPI conectado"
              />

              <Estado
                icono={CheckCircle2}
                titulo="Base de datos"
                detalle="PostgreSQL operativo"
              />

              <Estado
                icono={QrCode}
                titulo="QR"
                detalle="Generación habilitada"
              />

              <Estado
                icono={ShieldCheck}
                titulo="Auditoría"
                detalle="Trazabilidad activa"
              />

              <Estado
                icono={AlertTriangle}
                titulo="Frontend"
                detalle="En desarrollo"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Tarjeta({ titulo, valor, icono: Icon }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{titulo}</p>
          <p className="text-3xl font-bold mt-1">{valor}</p>
        </div>

        <div className="bg-amber-100 text-amber-700 p-3 rounded-xl">
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

function Estado({ icono: Icon, titulo, detalle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="bg-slate-100 p-2 rounded-lg">
        <Icon size={18} />
      </div>

      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-sm text-slate-500">{detalle}</p>
      </div>
    </div>
  );
}

export default App;