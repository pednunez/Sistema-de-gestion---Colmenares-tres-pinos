import { useCallback, useEffect, useState } from "react";

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
  CheckCircle2,
  RefreshCw,
  Search,
  Menu,
  X,
  Database,
  Server,
} from "lucide-react";

import Auth from "./components/Auth";

const API_URL = "http://127.0.0.1:8000";


function App() {

  // ==========================================================
  // SESIÓN / JWT
  // ==========================================================

  const [sesion, setSesion] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);

  // ==========================================================
  // INTERFAZ
  // ==========================================================

  const [vistaActiva, setVistaActiva] = useState("Dashboard");
  const [menuMovil, setMenuMovil] = useState(false);

  // ==========================================================
  // DATOS DEL SISTEMA
  // ==========================================================

  const [apiarios, setApiarios] = useState([]);
  const [colmenas, setColmenas] = useState([]);
  const [inspecciones, setInspecciones] = useState([]);
  const [tratamientos, setTratamientos] = useState([]);
  const [transferencias, setTransferencias] = useState([]);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [colmenaQr, setColmenaQr] = useState(null);


  // ==========================================================
  // VERIFICAR JWT AL ABRIR / RECARGAR LA PÁGINA
  // ==========================================================

  useEffect(() => {

    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token");

    if (!token) {
      setVerificandoSesion(false);
      return;
    }

    const verificarToken = async () => {

      try {

        const respuesta = await fetch(
          `${API_URL}/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!respuesta.ok) {
          throw new Error("Sesión inválida o expirada");
        }

        const usuario = await respuesta.json();

        setSesion({
          token,
          usuario,
        });

      } catch (error) {

        console.error(error);

        localStorage.removeItem("access_token");
        sessionStorage.removeItem("access_token");

        setSesion(null);

      } finally {

        setVerificandoSesion(false);

      }

    };

    verificarToken();

  }, []);


  // ==========================================================
  // CARGAR DATOS DEL BACKEND
  // ==========================================================

  const cargarDatos = useCallback(async () => {

    if (!sesion?.token) {
      return;
    }

    setCargando(true);
    setError("");

    try {

      const endpoints = [
        "/apiarios/",
        "/colmenas/",
        "/inspecciones/",
        "/tratamientos/",
        "/transferencias-marcos/",
      ];

      const respuestas = await Promise.all(
        endpoints.map((endpoint) =>
          fetch(`${API_URL}${endpoint}`, {
            headers: {
              Authorization: `Bearer ${sesion.token}`,
            },
          })
        )
      );

      for (const respuesta of respuestas) {

        if (!respuesta.ok) {
          throw new Error(
            `Error HTTP ${respuesta.status}`
          );
        }

      }

      const [
        apiariosData,
        colmenasData,
        inspeccionesData,
        tratamientosData,
        transferenciasData,
      ] = await Promise.all(
        respuestas.map((respuesta) =>
          respuesta.json()
        )
      );

      setApiarios(apiariosData);
      setColmenas(colmenasData);
      setInspecciones(inspeccionesData);
      setTratamientos(tratamientosData);
      setTransferencias(transferenciasData);

    } catch (error) {

      console.error(error);

      setError(
        "No fue posible cargar los datos del sistema."
      );

    } finally {

      setCargando(false);

    }

  }, [sesion?.token]);


  useEffect(() => {

    if (sesion?.token) {
      cargarDatos();
    }

  }, [sesion?.token, cargarDatos]);


  // ==========================================================
  // CERRAR SESIÓN
  // ==========================================================

  const cerrarSesion = () => {

    localStorage.removeItem("access_token");
    sessionStorage.removeItem("access_token");

    setSesion(null);

    setVistaActiva("Dashboard");
    setMenuMovil(false);

    setApiarios([]);
    setColmenas([]);
    setInspecciones([]);
    setTratamientos([]);
    setTransferencias([]);

    setBusqueda("");
    setColmenaQr(null);

  };


  // ==========================================================
  // MENÚ
  // ==========================================================

  const menu = [
    {
      nombre: "Dashboard",
      icono: LayoutDashboard,
    },
    {
      nombre: "Apiarios",
      icono: MapPinned,
    },
    {
      nombre: "Colmenas",
      icono: Boxes,
    },
    {
      nombre: "Inspecciones",
      icono: ClipboardCheck,
    },
    {
      nombre: "Tratamientos",
      icono: Pill,
    },
    {
      nombre: "Transferencias",
      icono: ArrowRightLeft,
    },
    {
      nombre: "QR",
      icono: QrCode,
    },
    {
      nombre: "Auditoría",
      icono: ShieldCheck,
      soloAdmin: true,
    },
    {
      nombre: "Usuarios",
      icono: Users,
      soloAdmin: true,
    },
  ];


  const menuVisible = menu.filter(
    (item) =>
      !item.soloAdmin ||
      sesion?.usuario?.rol === "ADMIN"
  );


  const cambiarVista = (nombre) => {

    setVistaActiva(nombre);
    setBusqueda("");
    setMenuMovil(false);

  };


  // ==========================================================
  // PANTALLA DE VERIFICACIÓN
  // ==========================================================

  if (verificandoSesion) {

    return (
      <div
        className="
          min-h-screen
          flex
          items-center
          justify-center
          bg-slate-100
        "
      >
        <div className="text-center">

          <RefreshCw
            size={30}
            className="
              animate-spin
              mx-auto
              mb-3
              text-amber-500
            "
          />

          <p className="text-slate-500">
            Verificando sesión...
          </p>

        </div>
      </div>
    );

  }


  // ==========================================================
  // LOGIN
  // ==========================================================

  if (!sesion) {

    return (
      <Auth
        onLogin={(datos) => {
          setSesion(datos);
          setVistaActiva("Dashboard");
        }}
      />
    );

  }


  // ==========================================================
  // APLICACIÓN
  // ==========================================================

  return (

    <div
      className="
        min-h-screen
        bg-slate-100
        text-slate-900
        flex
      "
    >

      {/* ======================================================
          SIDEBAR PC
      ====================================================== */}

      <aside
        className="
          hidden
          lg:flex
          w-72
          min-h-screen
          bg-slate-950
          text-white
          flex-col
          border-r
          border-slate-800
        "
      >

        <div
          className="
            h-24
            px-6
            flex
            items-center
            border-b
            border-slate-800
          "
        >

          <div
            className="
              w-11
              h-11
              bg-amber-400
              text-slate-950
              rounded-xl
              flex
              items-center
              justify-center
              font-bold
              text-xl
              mr-3
            "
          >
            CP
          </div>

          <div>

            <p className="font-bold text-lg">
              Colmenares
            </p>

            <p className="text-sm text-slate-400">
              Tres Pinos
            </p>

          </div>

        </div>


        <nav
          className="
            p-4
            space-y-1
            flex-1
          "
        >

          {menuVisible.map((item) => {

            const Icon = item.icono;

            const activo =
              vistaActiva === item.nombre;

            return (

              <button
                key={item.nombre}
                type="button"
                onClick={() =>
                  cambiarVista(item.nombre)
                }
                className={`
                  w-full
                  min-h-11
                  flex
                  items-center
                  gap-3
                  px-4
                  py-3
                  rounded-xl
                  text-left
                  transition
                  ${
                    activo
                      ? "bg-amber-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white"
                  }
                `}
              >

                <Icon size={19} />

                <span>
                  {item.nombre}
                </span>

              </button>

            );

          })}

        </nav>


        <div
          className="
            border-t
            border-slate-800
            p-4
          "
        >

          <div
            className="
              px-4
              pb-4
            "
          >

            <p className="text-sm font-semibold">
              {sesion.usuario?.nombre || "Usuario"}
            </p>

            <p className="text-xs text-slate-400">
              {sesion.usuario?.rol}
            </p>

          </div>


          <button
            type="button"
            onClick={cerrarSesion}
            className="
              w-full
              flex
              items-center
              gap-3
              px-4
              py-3
              rounded-xl
              text-slate-400
              hover:bg-slate-900
              hover:text-white
              transition
            "
          >

            <LogOut size={19} />

            Cerrar sesión

          </button>

        </div>

      </aside>


      {/* ======================================================
          CONTENIDO PRINCIPAL
      ====================================================== */}

      <div
        className="
          flex-1
          min-w-0
        "
      >

        <header
          className="
            h-20
            bg-white
            border-b
            border-slate-200
            px-5
            lg:px-8
            flex
            items-center
            justify-between
            sticky
            top-0
            z-30
          "
        >

          <div
            className="
              flex
              items-center
              gap-4
            "
          >

            <button
              type="button"
              onClick={() =>
                setMenuMovil(true)
              }
              className="
                lg:hidden
                p-2
                border
                border-slate-200
                rounded-lg
              "
            >

              <Menu size={22} />

            </button>


            <div>

              <h1
                className="
                  text-xl
                  lg:text-2xl
                  font-bold
                "
              >
                {vistaActiva}
              </h1>

              <p
                className="
                  hidden
                  sm:block
                  text-sm
                  text-slate-500
                "
              >
                Sistema de Gestión —
                Colmenares Tres Pinos
              </p>

            </div>

          </div>


          <div
            className="
              flex
              items-center
              gap-3
            "
          >

            <button
              type="button"
              onClick={cargarDatos}
              className="
                flex
                items-center
                gap-2
                border
                border-slate-200
                bg-white
                px-3
                py-2
                rounded-xl
                hover:bg-slate-50
                transition
              "
            >

              <RefreshCw
                size={17}
                className={
                  cargando
                    ? "animate-spin"
                    : ""
                }
              />

              <span className="hidden sm:inline">
                Actualizar
              </span>

            </button>


            <div
              className="
                hidden
                md:block
                border
                border-slate-200
                rounded-xl
                px-4
                py-2
                bg-slate-50
              "
            >

              <p
                className="
                  text-xs
                  text-slate-500
                "
              >
                Sesión
              </p>

              <p
                className="
                  text-sm
                  font-semibold
                "
              >
                {sesion.usuario?.nombre || "Usuario"}
              </p>

              <p className="text-xs text-slate-500">
                {sesion.usuario?.rol}
              </p>

            </div>

          </div>

        </header>


        {error && (

          <div
            className="
              mx-5
              lg:mx-8
              mt-6
              bg-red-50
              border
              border-red-200
              text-red-700
              p-4
              rounded-xl
            "
          >
            {error}
          </div>

        )}


        <main
          className="
            p-5
            lg:p-8
            max-w-[1700px]
            mx-auto
          "
        >

          {vistaActiva === "Dashboard" && (

            <Dashboard
              apiarios={apiarios}
              colmenas={colmenas}
              inspecciones={inspecciones}
              tratamientos={tratamientos}
              transferencias={transferencias}
              cargando={cargando}
              cambiarVista={cambiarVista}
            />

          )}


          {vistaActiva === "Apiarios" && (

            <VistaApiarios
              apiarios={apiarios}
              busqueda={busqueda}
              setBusqueda={setBusqueda}
            />

          )}


          {vistaActiva === "Colmenas" && (

            <VistaColmenas
              colmenas={colmenas}
              apiarios={apiarios}
              busqueda={busqueda}
              setBusqueda={setBusqueda}
            />

          )}


          {vistaActiva === "Inspecciones" && (

            <VistaInspecciones
              inspecciones={inspecciones}
            />

          )}


          {vistaActiva === "Tratamientos" && (

            <VistaTratamientos
              tratamientos={tratamientos}
            />

          )}


          {vistaActiva === "Transferencias" && (

            <VistaTransferencias
              transferencias={transferencias}
            />

          )}


          {vistaActiva === "QR" && (

            <VistaQR
              colmenas={colmenas}
              colmenaQr={colmenaQr}
              setColmenaQr={setColmenaQr}
            />

          )}


          {vistaActiva === "Auditoría" && (

            <VistaProtegida
              titulo="Auditoría"
              descripcion="Módulo administrativo de trazabilidad de acciones realizadas en el sistema."
              icono={ShieldCheck}
            />

          )}


          {vistaActiva === "Usuarios" && (

            <VistaProtegida
              titulo="Gestión de usuarios"
              descripcion="Administración de usuarios y roles del sistema."
              icono={Users}
            />

          )}

        </main>

      </div>


      {/* ======================================================
          MENÚ MÓVIL
      ====================================================== */}

      {menuMovil && (

        <div
          className="
            fixed
            inset-0
            z-50
            bg-black/40
            lg:hidden
          "
        >

          <div
            className="
              w-72
              h-full
              bg-slate-950
              text-white
              p-4
            "
          >

            <div
              className="
                flex
                justify-between
                items-center
                mb-6
              "
            >

              <div>

                <p className="font-bold">
                  Colmenares
                </p>

                <p
                  className="
                    text-sm
                    text-slate-400
                  "
                >
                  Tres Pinos
                </p>

              </div>


              <button
                type="button"
                onClick={() =>
                  setMenuMovil(false)
                }
              >
                <X />
              </button>

            </div>


            <div className="space-y-1">

              {menuVisible.map((item) => {

                const Icon = item.icono;

                return (

                  <button
                    key={item.nombre}
                    type="button"
                    onClick={() =>
                      cambiarVista(item.nombre)
                    }
                    className="
                      w-full
                      flex
                      items-center
                      gap-3
                      px-4
                      py-3
                      rounded-xl
                      text-slate-300
                      hover:bg-slate-900
                    "
                  >

                    <Icon size={18} />

                    {item.nombre}

                  </button>

                );

              })}

            </div>


            <button
              type="button"
              onClick={cerrarSesion}
              className="
                mt-8
                w-full
                flex
                items-center
                gap-3
                px-4
                py-3
                rounded-xl
                text-slate-400
                hover:bg-slate-900
                hover:text-white
              "
            >

              <LogOut size={18} />

              Cerrar sesión

            </button>

          </div>

        </div>

      )}

    </div>

  );

}


// ==========================================================
// DASHBOARD
// ==========================================================

function Dashboard({
  apiarios,
  colmenas,
  inspecciones,
  tratamientos,
  transferencias,
  cargando,
  cambiarVista,
}) {

  return (

    <>

      <div className="mb-7">

        <h2
          className="
            text-2xl
            lg:text-3xl
            font-bold
          "
        >
          Resumen operativo
        </h2>

        <p className="text-slate-500 mt-1">
          Información general del sistema.
        </p>

      </div>


      <div
        className="
          grid
          grid-cols-1
          sm:grid-cols-2
          xl:grid-cols-4
          gap-5
          mb-7
        "
      >

        <Tarjeta
          titulo="Apiarios"
          valor={apiarios.length}
          icono={MapPinned}
          cargando={cargando}
          onClick={() =>
            cambiarVista("Apiarios")
          }
        />

        <Tarjeta
          titulo="Colmenas activas"
          valor={colmenas.length}
          icono={Boxes}
          cargando={cargando}
          onClick={() =>
            cambiarVista("Colmenas")
          }
        />

        <Tarjeta
          titulo="Inspecciones"
          valor={inspecciones.length}
          icono={ClipboardCheck}
          cargando={cargando}
          onClick={() =>
            cambiarVista("Inspecciones")
          }
        />

        <Tarjeta
          titulo="Tratamientos"
          valor={tratamientos.length}
          icono={Pill}
          cargando={cargando}
          onClick={() =>
            cambiarVista("Tratamientos")
          }
        />

      </div>


      <div
        className="
          grid
          grid-cols-1
          xl:grid-cols-3
          gap-6
        "
      >

        <section
          className="
            xl:col-span-2
            bg-white
            border
            border-slate-200
            rounded-2xl
            overflow-hidden
          "
        >

          <div
            className="
              p-6
              border-b
              border-slate-200
              flex
              justify-between
              items-center
            "
          >

            <div>

              <h3
                className="
                  text-lg
                  font-semibold
                "
              >
                Apiarios registrados
              </h3>

              <p
                className="
                  text-sm
                  text-slate-500
                "
              >
                Resumen de apiarios activos
              </p>

            </div>

            <Activity
              className="text-amber-500"
            />

          </div>


          <div className="divide-y divide-slate-100">

            {apiarios.slice(0, 6).map(
              (apiario) => (

                <div
                  key={apiario.id}
                  className="
                    px-6
                    py-4
                    flex
                    justify-between
                    items-center
                    gap-4
                  "
                >

                  <div>

                    <p className="font-semibold">
                      {apiario.nombre}
                    </p>

                    <p
                      className="
                        text-sm
                        text-slate-500
                      "
                    >
                      {apiario.ubicacion ||
                        "Ubicación no registrada"}
                    </p>

                  </div>


                  <span
                    className="
                      inline-flex
                      items-center
                      gap-1
                      px-3
                      py-1
                      bg-emerald-50
                      text-emerald-700
                      rounded-full
                      text-sm
                    "
                  >

                    <CheckCircle2 size={15} />

                    Activo

                  </span>

                </div>

              )
            )}

          </div>

        </section>


        <section
          className="
            bg-white
            border
            border-slate-200
            rounded-2xl
            p-6
          "
        >

          <h3
            className="
              text-lg
              font-semibold
              mb-6
            "
          >
            Estado del sistema
          </h3>


          <div className="space-y-5">

            <EstadoSistema
              icono={Server}
              titulo="Backend"
              detalle="FastAPI operativo"
            />

            <EstadoSistema
              icono={Database}
              titulo="PostgreSQL"
              detalle="Base de datos conectada"
            />

            <EstadoSistema
              icono={QrCode}
              titulo="Código QR"
              detalle="Generación disponible"
            />

            <EstadoSistema
              icono={ShieldCheck}
              titulo="Auditoría"
              detalle="Trazabilidad activa"
            />

            <EstadoSistema
              icono={ArrowRightLeft}
              titulo="Transferencias"
              detalle={`${transferencias.length} registradas`}
            />

          </div>

        </section>

      </div>

    </>

  );

}


// ==========================================================
// APIARIOS
// ==========================================================

function VistaApiarios({
  apiarios,
  busqueda,
  setBusqueda,
}) {

  const filtrados = apiarios.filter(
    (apiario) =>
      apiario.nombre
        .toLowerCase()
        .includes(
          busqueda.toLowerCase()
        )
  );


  return (

    <Modulo
      titulo="Apiarios"
      descripcion="Administración de los apiarios registrados."
      busqueda={busqueda}
      setBusqueda={setBusqueda}
    >

      <div
        className="
          grid
          grid-cols-1
          md:grid-cols-2
          xl:grid-cols-3
          gap-5
        "
      >

        {filtrados.map((apiario) => (

          <div
            key={apiario.id}
            className="
              bg-white
              border
              border-slate-200
              rounded-2xl
              p-6
            "
          >

            <div
              className="
                flex
                justify-between
                gap-4
                mb-4
              "
            >

              <div>

                <p
                  className="
                    text-lg
                    font-bold
                  "
                >
                  {apiario.nombre}
                </p>

                <p
                  className="
                    text-sm
                    text-slate-500
                  "
                >
                  ID #{apiario.id}
                </p>

              </div>


              <MapPinned
                className="text-amber-500"
              />

            </div>


            <p
              className="
                text-sm
                text-slate-600
                mb-2
              "
            >
              <strong>Ubicación:</strong>{" "}
              {apiario.ubicacion ||
                "No registrada"}
            </p>


            <p
              className="
                text-sm
                text-slate-600
              "
            >
              <strong>Estado:</strong>{" "}
              {apiario.activo
                ? "Activo"
                : "Inactivo"}
            </p>

          </div>

        ))}

      </div>

    </Modulo>

  );

}


// ==========================================================
// COLMENAS
// ==========================================================

function VistaColmenas({
  colmenas,
  apiarios,
  busqueda,
  setBusqueda,
}) {

  const filtradas = colmenas.filter(
    (colmena) =>
      colmena.codigo
        .toLowerCase()
        .includes(
          busqueda.toLowerCase()
        )
  );


  const nombreApiario = (id) => {

    return (
      apiarios.find(
        (apiario) =>
          apiario.id === id
      )?.nombre || `Apiario #${id}`
    );

  };


  return (

    <Modulo
      titulo="Colmenas"
      descripcion="Colmenas activas registradas en el sistema."
      busqueda={busqueda}
      setBusqueda={setBusqueda}
    >

      <div
        className="
          bg-white
          border
          border-slate-200
          rounded-2xl
          overflow-x-auto
        "
      >

        <table
          className="
            w-full
            text-sm
          "
        >

          <thead
            className="
              bg-slate-50
              text-slate-500
              border-b
              border-slate-200
            "
          >

            <tr>

              <th className="text-left p-4">
                Código
              </th>

              <th className="text-left p-4">
                Apiario
              </th>

              <th className="text-left p-4">
                Estado
              </th>

              <th className="text-left p-4">
                Instalación
              </th>

              <th className="text-left p-4">
                QR
              </th>

            </tr>

          </thead>


          <tbody>

            {filtradas.map((colmena) => (

              <tr
                key={colmena.id}
                className="
                  border-b
                  border-slate-100
                  last:border-0
                  hover:bg-slate-50
                "
              >

                <td
                  className="
                    p-4
                    font-semibold
                  "
                >
                  {colmena.codigo}
                </td>

                <td className="p-4">
                  {nombreApiario(
                    colmena.apiario_id
                  )}
                </td>

                <td className="p-4">

                  <span
                    className="
                      bg-emerald-50
                      text-emerald-700
                      px-3
                      py-1
                      rounded-full
                    "
                  >
                    {colmena.estado}
                  </span>

                </td>

                <td className="p-4">
                  {colmena.fecha_instalacion ||
                    "Sin fecha"}
                </td>

                <td className="p-4">

                  <QrCode
                    size={18}
                    className="text-slate-500"
                  />

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </Modulo>

  );

}


// ==========================================================
// INSPECCIONES
// ==========================================================

function VistaInspecciones({
  inspecciones,
}) {

  return (

    <Modulo
      titulo="Inspecciones"
      descripcion="Historial de inspecciones registradas."
    >

      <div className="grid gap-4">

        {inspecciones.map(
          (inspeccion) => (

            <div
              key={inspeccion.id}
              className="
                bg-white
                border
                border-slate-200
                rounded-2xl
                p-5
              "
            >

              <div
                className="
                  flex
                  flex-wrap
                  justify-between
                  gap-4
                "
              >

                <div>

                  <p
                    className="
                      font-semibold
                      text-lg
                    "
                  >
                    Inspección #{inspeccion.id}
                  </p>

                  <p
                    className="
                      text-sm
                      text-slate-500
                    "
                  >
                    Colmena #{inspeccion.colmena_id}
                  </p>

                </div>


                <span
                  className="
                    bg-slate-100
                    px-3
                    py-1
                    rounded-full
                    text-sm
                  "
                >
                  {inspeccion.estado_general}
                </span>

              </div>


              <div
                className="
                  grid
                  sm:grid-cols-2
                  lg:grid-cols-4
                  gap-4
                  mt-5
                  text-sm
                "
              >

                <Dato
                  nombre="Reina observada"
                  valor={
                    inspeccion.reina_observada
                      ? "Sí"
                      : "No"
                  }
                />

                <Dato
                  nombre="Presencia de cría"
                  valor={
                    inspeccion.presencia_cria
                      ? "Sí"
                      : "No"
                  }
                />

                <Dato
                  nombre="Población"
                  valor={
                    inspeccion.nivel_poblacion
                  }
                />

                <Dato
                  nombre="Reservas"
                  valor={
                    inspeccion.reservas_alimento
                  }
                />

              </div>

            </div>

          )
        )}

      </div>

    </Modulo>

  );

}


// ==========================================================
// TRATAMIENTOS
// ==========================================================

function VistaTratamientos({
  tratamientos,
}) {

  return (

    <Modulo
      titulo="Tratamientos"
      descripcion="Tratamientos sanitarios registrados."
    >

      <div
        className="
          grid
          grid-cols-1
          xl:grid-cols-2
          gap-5
        "
      >

        {tratamientos.map(
          (tratamiento) => (

            <div
              key={tratamiento.id}
              className="
                bg-white
                border
                border-slate-200
                rounded-2xl
                p-6
              "
            >

              <div
                className="
                  flex
                  justify-between
                  gap-4
                  mb-4
                "
              >

                <div>

                  <p
                    className="
                      text-lg
                      font-bold
                    "
                  >
                    {tratamiento.tipo_tratamiento}
                  </p>

                  <p
                    className="
                      text-sm
                      text-slate-500
                    "
                  >
                    Colmena #{tratamiento.colmena_id}
                  </p>

                </div>

                <Pill
                  className="text-amber-500"
                />

              </div>


              <Dato
                nombre="Producto"
                valor={tratamiento.producto}
              />

              <Dato
                nombre="Dosis"
                valor={tratamiento.dosis}
              />

              <Dato
                nombre="Estado"
                valor={tratamiento.estado}
              />

            </div>

          )
        )}

      </div>

    </Modulo>

  );

}


// ==========================================================
// TRANSFERENCIAS
// ==========================================================

function VistaTransferencias({
  transferencias,
}) {

  return (

    <Modulo
      titulo="Transferencias de marcos"
      descripcion="Trazabilidad entre colmenas."
    >

      <div className="grid gap-4">

        {transferencias.map(
          (transferencia) => (

            <div
              key={transferencia.id}
              className="
                bg-white
                border
                border-slate-200
                rounded-2xl
                p-5
                flex
                flex-wrap
                items-center
                justify-between
                gap-5
              "
            >

              <div>

                <p className="font-semibold">
                  Transferencia #{transferencia.id}
                </p>

                <p
                  className="
                    text-sm
                    text-slate-500
                  "
                >
                  {transferencia.cantidad_marcos} marco(s) ·{" "}
                  {transferencia.tipo_marco}
                </p>

              </div>


              <div
                className="
                  flex
                  items-center
                  gap-4
                  font-semibold
                "
              >

                <span>
                  Colmena #
                  {transferencia.colmena_origen_id}
                </span>

                <ArrowRightLeft
                  className="text-amber-500"
                />

                <span>
                  Colmena #
                  {transferencia.colmena_destino_id}
                </span>

              </div>

            </div>

          )
        )}

      </div>

    </Modulo>

  );

}


// ==========================================================
// QR
// ==========================================================

function VistaQR({
  colmenas,
  colmenaQr,
  setColmenaQr,
}) {

  return (

    <Modulo
      titulo="Códigos QR"
      descripcion="Generación e identificación rápida de colmenas."
    >

      <div
        className="
          grid
          grid-cols-1
          xl:grid-cols-3
          gap-6
        "
      >

        <div
          className="
            xl:col-span-2
            bg-white
            border
            border-slate-200
            rounded-2xl
            overflow-hidden
          "
        >

          {colmenas.map((colmena) => (

            <button
              key={colmena.id}
              type="button"
              onClick={() =>
                setColmenaQr(colmena)
              }
              className="
                w-full
                flex
                justify-between
                items-center
                px-5
                py-4
                border-b
                border-slate-100
                hover:bg-slate-50
                text-left
              "
            >

              <div>

                <p className="font-semibold">
                  {colmena.codigo}
                </p>

                <p
                  className="
                    text-xs
                    text-slate-500
                    break-all
                  "
                >
                  {colmena.codigo_qr}
                </p>

              </div>

              <QrCode
                className="text-amber-500"
              />

            </button>

          ))}

        </div>


        <div
          className="
            bg-white
            border
            border-slate-200
            rounded-2xl
            p-6
            flex
            flex-col
            items-center
            justify-center
            min-h-96
          "
        >

          {colmenaQr ? (

            <>

              <p
                className="
                  font-bold
                  text-xl
                  mb-1
                "
              >
                {colmenaQr.codigo}
              </p>

              <p
                className="
                  text-sm
                  text-slate-500
                  mb-5
                "
              >
                Código QR
              </p>


              <img
                src={`${API_URL}/colmenas/${colmenaQr.id}/qr`}
                alt={`Código QR ${colmenaQr.codigo}`}
                className="
                  w-64
                  max-w-full
                  border
                  border-slate-200
                  rounded-xl
                "
              />

            </>

          ) : (

            <div
              className="
                text-center
                text-slate-500
              "
            >

              <QrCode
                size={50}
                className="
                  mx-auto
                  mb-3
                  text-slate-300
                "
              />

              <p>
                Selecciona una colmena
              </p>

            </div>

          )}

        </div>

      </div>

    </Modulo>

  );

}


// ==========================================================
// VISTA ADMINISTRATIVA
// ==========================================================

function VistaProtegida({
  titulo,
  descripcion,
  icono: Icon,
}) {

  return (

    <div
      className="
        bg-white
        border
        border-slate-200
        rounded-2xl
        p-10
        text-center
      "
    >

      <div
        className="
          w-16
          h-16
          bg-amber-100
          text-amber-700
          rounded-2xl
          flex
          items-center
          justify-center
          mx-auto
          mb-5
        "
      >

        <Icon size={30} />

      </div>


      <h2
        className="
          text-2xl
          font-bold
          mb-2
        "
      >
        {titulo}
      </h2>

      <p
        className="
          text-slate-500
          max-w-xl
          mx-auto
        "
      >
        {descripcion}
      </p>

    </div>

  );

}


// ==========================================================
// COMPONENTES
// ==========================================================

function Tarjeta({
  titulo,
  valor,
  icono: Icon,
  cargando,
  onClick,
}) {

  return (

    <button
      type="button"
      onClick={onClick}
      className="
        bg-white
        border
        border-slate-200
        rounded-2xl
        p-5
        text-left
        hover:border-amber-300
        hover:shadow-md
        transition
      "
    >

      <div
        className="
          flex
          items-center
          justify-between
        "
      >

        <div>

          <p
            className="
              text-sm
              text-slate-500
            "
          >
            {titulo}
          </p>

          <p
            className="
              text-3xl
              font-bold
              mt-2
            "
          >
            {cargando ? "..." : valor}
          </p>

        </div>


        <div
          className="
            bg-amber-100
            text-amber-700
            p-3
            rounded-xl
          "
        >

          <Icon size={24} />

        </div>

      </div>

    </button>

  );

}


function EstadoSistema({
  icono: Icon,
  titulo,
  detalle,
}) {

  return (

    <div
      className="
        flex
        items-center
        gap-3
      "
    >

      <div
        className="
          w-10
          h-10
          bg-emerald-50
          text-emerald-600
          rounded-xl
          flex
          items-center
          justify-center
        "
      >

        <Icon size={19} />

      </div>


      <div>

        <p className="font-medium">
          {titulo}
        </p>

        <p
          className="
            text-sm
            text-slate-500
          "
        >
          {detalle}
        </p>

      </div>

    </div>

  );

}


function Modulo({
  titulo,
  descripcion,
  busqueda,
  setBusqueda,
  children,
}) {

  return (

    <>

      <div
        className="
          flex
          flex-col
          md:flex-row
          md:items-end
          justify-between
          gap-4
          mb-7
        "
      >

        <div>

          <h2
            className="
              text-2xl
              lg:text-3xl
              font-bold
            "
          >
            {titulo}
          </h2>

          <p
            className="
              text-slate-500
              mt-1
            "
          >
            {descripcion}
          </p>

        </div>


        {setBusqueda && (

          <div className="relative">

            <Search
              size={18}
              className="
                absolute
                left-3
                top-1/2
                -translate-y-1/2
                text-slate-400
              "
            />

            <input
              value={busqueda}
              onChange={(e) =>
                setBusqueda(
                  e.target.value
                )
              }
              placeholder="Buscar..."
              className="
                w-full
                md:w-72
                border
                border-slate-300
                rounded-xl
                pl-10
                pr-4
                py-2.5
                bg-white
                outline-none
                focus:ring-2
                focus:ring-amber-400
                focus:border-amber-400
              "
            />

          </div>

        )}

      </div>

      {children}

    </>

  );

}


function Dato({
  nombre,
  valor,
}) {

  return (

    <div>

      <p
        className="
          text-xs
          uppercase
          tracking-wide
          text-slate-400
        "
      >
        {nombre}
      </p>

      <p
        className="
          font-medium
          mt-1
        "
      >
        {valor ?? "No registrado"}
      </p>

    </div>

  );

}


export default App;