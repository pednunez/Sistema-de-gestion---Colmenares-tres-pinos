import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import { COLORS } from './theme';

import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';

// ==========================================
// PANTALLAS
// ==========================================

import FormularioInspeccion from './FormularioInspeccion';
import MisInspecciones from './MisInspecciones';
import InicioModulos from './InicioModulos';
import ColmenasLocales from './ColmenasLocales';
import TratamientosLocales from './TratamientosLocales';
import RevisionesGrupos from './RevisionesGrupos';
import ApiariosLocales from './ApiariosLocales';
import TransferenciasLocales from './TransferenciasLocales';
import StockLocales from './StockLocales';
import AuditoriaLocales from './AuditoriaLocales';
import UsuariosLocales from './UsuariosLocales';
import Tutorial from './Tutorial';

import {
  tutorialFueVisto,
  marcarTutorialVisto,
} from './api/tutorial';

// ==========================================
// AUTENTICACION Y CATALOGO
// ==========================================

import {
  leerSesionGuardada,
} from './api/auth';

import type {
  UsuarioMovil,
} from './api/auth';

import {
  leerCatalogoLocal,
} from './database/catalogo';

// ==========================================
// SINCRONIZACION AUTOMATICA
// ==========================================

import {
  useControladorSincronizacion,
} from './sincronizacion/controlador';

// ==========================================
// TIPOS
// ==========================================

type Pantalla =
  | 'inicio'
  | 'escaner'
  | 'colmena'
  | 'inspeccion'
  | 'mis-inspecciones'
  | 'colmenas-locales'
  | 'apiarios-locales'
  | 'transferencias-locales'
  | 'tratamientos-locales'
  | 'revisiones-grupos'
  | 'stock-locales'
  | 'auditoria'
  | 'usuarios-locales';

type Rol = 'ADMIN' | 'APICULTOR';

type IdModulo =
  | 'dashboard'
  | 'apiarios'
  | 'colmenas'
  | 'inspecciones'
  | 'tratamientos'
  | 'revisiones'
  | 'transferencias'
  | 'stock'
  | 'qr'
  | 'auditoria'
  | 'usuarios';

type ItemMenu = {
  id: IdModulo;
  nombre: string;
  icono: string;
  roles: Rol[];
  destino?: Pantalla;
  disponible: boolean;
};

type Props = {
  usuario: UsuarioMovil;
  sinConexion: boolean;
  avisoCatalogo: string;
  onReintentarConexion: () => void;
  onCerrarSesion: () => void;
};

type Catalogo = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

type ColmenaCatalogo =
  Catalogo['colmenas'][number];

type ApiarioCatalogo =
  Catalogo['apiarios'][number];

// ==========================================
// MENU SEGUN LOS ROLES DE LA WEB
// ==========================================

const TODOS: Rol[] = [
  'ADMIN',
  'APICULTOR',
];

const SOLO_ADMIN: Rol[] = [
  'ADMIN',
];

// La opción permanece oculta por defecto según el alcance móvil
// aprobado; el módulo de revisiones de main sigue disponible si
// se habilita expresamente para una prueba o revisión de alcance.
const HABILITAR_REVISIONES_GRUPOS =
  process.env.EXPO_PUBLIC_ENABLE_REVISIONES_GRUPOS === 'true';

const MENU: ItemMenu[] = [

  {
    id: 'dashboard',
    nombre: 'Dashboard',
    icono: '▦',
    roles: SOLO_ADMIN,
    destino: 'inicio',
    disponible: true,
  },

  {
    id: 'apiarios',
    nombre: 'Apiarios',
    icono: '🌿',
    roles: SOLO_ADMIN,
    destino: 'apiarios-locales',
    disponible: true,
  },

  {
    id: 'colmenas',
    nombre: 'Colmenas',
    icono: '🐝',
    roles: TODOS,
    destino: 'colmenas-locales',
    disponible: true,
  },



  {
    id: 'inspecciones',
    nombre: 'Inspecciones',
    icono: '📋',
    roles: TODOS,
    destino: 'mis-inspecciones',
    disponible: true,
  },

  {
    id: 'tratamientos',
    nombre: 'Tratamientos',
    icono: '💊',
    roles: TODOS,
    destino: 'tratamientos-locales',
    disponible: true,
  },

  ...(HABILITAR_REVISIONES_GRUPOS
    ? [{
        id: 'revisiones' as const,
        nombre: 'Revisiones por grupo',
        icono: '📑',
        roles: TODOS,
        destino: 'revisiones-grupos' as const,
        disponible: true,
      }]
    : []),

  {
    id: 'transferencias',
    nombre: 'Transferencias',
    icono: '⇄',
    roles: TODOS,
    destino: 'transferencias-locales',
    disponible: true,
  },

  {
    id: 'stock',
    nombre: 'Stock',
    icono: '📦',
    roles: TODOS,
    destino: 'stock-locales',
    disponible: true,
  },

  {
    id: 'qr',
    nombre: 'Códigos QR',
    icono: '▦',
    roles: TODOS,
    disponible: true,
  },

  {
    id: 'auditoria',
    nombre: 'Auditoría',
    icono: '🛡️',
    roles: SOLO_ADMIN,
    destino: 'auditoria',
    disponible: true,
  },

  {
    id: 'usuarios',
    nombre: 'Usuarios',
    icono: '👥',
    roles: SOLO_ADMIN,
    destino: 'usuarios-locales',
    disponible: true,
  },

];

// ==========================================
// FILTRAR MENU POR ROL
// ==========================================

function menuParaRol(rol: string): ItemMenu[] {
  return MENU.filter(item =>
    item.roles.includes(rol as Rol)
  );
}

// ==========================================
// IDENTIFICAR MODULO ACTIVO
// ==========================================

function obtenerModuloActivo(
  pantalla: Pantalla
): IdModulo {

  switch (pantalla) {

    case 'inicio':
      return 'dashboard';

    case 'apiarios-locales':
      return 'apiarios';

    case 'transferencias-locales':
      return 'transferencias';

    case 'stock-locales':
      return 'stock';

    case 'auditoria':
      return 'auditoria';

    case 'usuarios-locales':
      return 'usuarios';

    case 'colmenas-locales':
    case 'colmena':
      return 'colmenas';

    case 'mis-inspecciones':
    case 'inspeccion':
      return 'inspecciones';

    case 'tratamientos-locales':
      return 'tratamientos';

    case 'revisiones-grupos':
      return 'revisiones';

    case 'escaner':
      return 'qr';

    default:
      return 'colmenas';
  }
}

// ==========================================
// VALIDAR QR OFICIAL
// ==========================================

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const PATRON_QR = new RegExp(
  `(?:^|/colmenas/qr/)(${UUID})/?(?:[?#].*)?$`,
  'i'
);

const PATRON_QR_WEB = new RegExp(
  `[?&]qr=(${UUID})(?:&|#|$)`,
  'i'
);

function obtenerUUIDDesdeQR(
  valor: string
): string | null {

  const texto = valor.trim();

  const coincidencia =
    texto.match(PATRON_QR) ??
    texto.match(PATRON_QR_WEB);

  if (!coincidencia) {
    return null;
  }

  return coincidencia[1].toLowerCase();
}

// ==========================================
// APLICACION PRINCIPAL
// ==========================================

export default function App({
  usuario,
  sinConexion,
  avisoCatalogo,
  onReintentarConexion,
  onCerrarSesion,
}: Props) {

  // ========================================
  // SINCRONIZACION AUTOMATICA
  // ========================================

  useControladorSincronizacion();

  // ========================================
  // RESPONSIVE
  // ========================================

  const { width } = useWindowDimensions();

  // Tablet desde 768 px.
  const esTablet = width >= 768;

  const pantallaInicial: Pantalla =
    usuario.rol === 'ADMIN'
      ? 'inicio'
      : 'colmenas-locales';

  // ========================================
  // NAVEGACION
  // ========================================

  const [pantalla, setPantalla] =
    useState<Pantalla>(pantallaInicial);

  const [menuAbierto, setMenuAbierto] =
    useState(false);

  // ========================================
  // TUTORIAL AUTOMATICO POR USUARIO
  // ========================================

  const [tutorialVisible, setTutorialVisible] =
    useState(false);

  const tutorialCerrado = useRef(false);

  useEffect(() => {

    let activo = true;

    tutorialCerrado.current = false;
    setTutorialVisible(false);

    const comprobarTutorial = async () => {

      try {

        const visto = await tutorialFueVisto(usuario.id);

        if (
          activo &&
          !visto &&
          !tutorialCerrado.current
        ) {
          setTutorialVisible(true);
        }

      } catch (error) {

        console.warn(
          '[Colmenares] No se pudo consultar el tutorial:',
          error
        );

        if (
          activo &&
          !tutorialCerrado.current
        ) {
          setTutorialVisible(true);
        }

      }
    };

    void comprobarTutorial();

    return () => {
      activo = false;
    };

  }, [usuario.id]);

  // ========================================
  // ABRIR TUTORIAL MANUALMENTE
  // ========================================

  const abrirTutorial = () => {
    tutorialCerrado.current = false;
    setMenuAbierto(false);
    setTutorialVisible(true);
  };

  // ========================================
  // CERRAR Y RECORDAR TUTORIAL
  // ========================================

  const cerrarTutorial = async () => {

    tutorialCerrado.current = true;
    setTutorialVisible(false);

    try {

      await marcarTutorialVisto(usuario.id);

    } catch (error) {

      console.warn(
        '[Colmenares] No se pudo guardar el tutorial:',
        error
      );

    }
  };

  const itemsMenu = menuParaRol(usuario.rol);

  const moduloActivo =
    obtenerModuloActivo(pantalla);

  const itemActual = itemsMenu.find(
    item => item.id === moduloActivo
  );

  const tituloActual =
    itemActual?.nombre ??
    (
      pantalla === 'inspeccion'
        ? 'Nueva inspección'
        : 'Información de colmena'
    );

  const nombreRol =
    usuario.rol === 'ADMIN'
      ? 'Administrador'
      : 'Apicultor';

  // ========================================
  // COLMENA IDENTIFICADA
  // ========================================

  const [codigoQR, setCodigoQR] =
    useState('');

  const [
    colmenaSeleccionada,
    setColmenaSeleccionada,
  ] = useState<ColmenaCatalogo | null>(null);

  const [
    apiarioSeleccionado,
    setApiarioSeleccionado,
  ] = useState<ApiarioCatalogo | null>(null);

  // ========================================
  // CAMARA
  // ========================================

  const [
    cameraReady,
    setCameraReady,
  ] = useState(false);

  const [
    permission,
    requestPermission,
  ] = useCameraPermissions();

  const bloqueoEscaneo = useRef(false);

  // ========================================
  // VOLVER AL INICIO SEGUN EL ROL
  // ========================================

  const volverInicio = () => {

    bloqueoEscaneo.current = false;

    setCameraReady(false);
    setCodigoQR('');
    setColmenaSeleccionada(null);
    setApiarioSeleccionado(null);
    setMenuAbierto(false);

    setPantalla(pantallaInicial);
  };

  // ========================================
  // ABRIR ESCANER QR
  // ========================================

  const abrirEscaner = async () => {

    if (!permission?.granted) {

      const resultado =
        await requestPermission();

      if (!resultado.granted) {

        Alert.alert(
          'Permiso necesario',
          'Debes permitir el acceso a la cámara para escanear las colmenas.'
        );

        return;
      }
    }

    bloqueoEscaneo.current = false;

    setCameraReady(false);
    setCodigoQR('');

    setColmenaSeleccionada(null);
    setApiarioSeleccionado(null);

    setMenuAbierto(false);
    setPantalla('escaner');
  };

  // ========================================
  // NAVEGAR POR EL MENU
  // ========================================

  const navegarModulo = (item: ItemMenu) => {

    if (!item.disponible) {
      return;
    }

    // Panel de control: volver al inicio en un solo toque.
    if (item.id === 'dashboard') {
      volverInicio();
      return;
    }

    setMenuAbierto(false);

    // Escáner QR.
    if (item.id === 'qr') {
      void abrirEscaner();
      return;
    }

    // Resto de los módulos disponibles.
    if (item.destino) {
      setCameraReady(false);
      setPantalla(item.destino);
    }
  };

  // ========================================
  // MOSTRAR ERROR DE ESCANEO
  // ========================================

  const mostrarErrorEscaneo = (
    titulo: string,
    mensaje: string
  ) => {

    Alert.alert(
      titulo,
      mensaje,
      [
        {
          text: 'Volver a escanear',
          onPress: () => {
            bloqueoEscaneo.current = false;
          },
        },
        {
          text: 'Ir al inicio',
          onPress: volverInicio,
        },
      ]
    );
  };

  // ========================================
  // LEER Y VALIDAR QR
  // ========================================

  const escanearQR = async ({
    data,
  }: {
    data: string;
  }) => {

    // Impedir escaneos simultáneos.
    if (bloqueoEscaneo.current) {
      return;
    }

    bloqueoEscaneo.current = true;

    // Extraer UUID.
    const uuid = obtenerUUIDDesdeQR(data);

    if (!uuid) {

      mostrarErrorEscaneo(
        'Código QR inválido',
        'El QR no tiene el formato oficial de una colmena.'
      );

      return;
    }

    try {

      // IDENTIFICAR USUARIO
      const sesion =
        await leerSesionGuardada();

      if (!sesion) {

        mostrarErrorEscaneo(
          'Sesión no disponible',
          'El QR fue leído correctamente, pero debes iniciar sesión para consultar el catálogo oficial de colmenas.'
        );

        return;
      }

      // CONSULTAR SQLITE
      const catalogo =
        await leerCatalogoLocal(
          sesion.usuario.id
        );

      if (!catalogo) {

        mostrarErrorEscaneo(
          'Catálogo no disponible',
          'No hay un catálogo oficial descargado para este usuario. Debes iniciar sesión con conexión a FastAPI para obtenerlo.'
        );

        return;
      }

      // BUSCAR COLMENA
      const colmena =
        catalogo.colmenas.find(
          item =>
            item.codigo_qr
              .trim()
              .toLowerCase() === uuid
        );

      if (!colmena) {

        mostrarErrorEscaneo(
          'Colmena no registrada',
          'El QR tiene un formato válido, pero no pertenece a ninguna colmena del catálogo oficial disponible.'
        );

        return;
      }

      // IDENTIFICAR APIARIO
      const apiario =
        catalogo.apiarios.find(
          item =>
            item.id === colmena.apiario_id
        ) ?? null;

      // ABRIR COLMENA
      setCodigoQR(colmena.codigo_qr);

      setColmenaSeleccionada(colmena);

      setApiarioSeleccionado(apiario);

      setCameraReady(false);

      setPantalla('colmena');

    } catch (error) {

      console.error(
        'Error al consultar la colmena:',
        error
      );

      mostrarErrorEscaneo(
        'Error de consulta',
        'No se pudo consultar el catálogo local. Los datos no se han modificado.'
      );
    }
  };

  // ========================================
  // MENU LATERAL
  // ========================================

  const renderSidebar = (
    mostrarCerrar: boolean
  ) => (

    <View style={[
      styles.sidebarContenido,
      mostrarCerrar && styles.sidebarContenidoMovil,
    ]}>

      {/* MARCA: AL TOCARLA REGRESA A LA PANTALLA PRINCIPAL DEL ROL */}
      <View style={styles.sidebarMarca}>

        <Pressable
          style={({ pressed }) => [
            styles.marcaAcceso,
            pressed && styles.marcaAccesoPresionado,
          ]}
          onPress={volverInicio}
          accessibilityRole="button"
          accessibilityLabel={
            usuario.rol === 'ADMIN'
              ? 'Ir al panel de control'
              : 'Ir a colmenas'
          }
        >
          <Image
            source={require('./assets/colmenares-logo-mark.png')}
            style={styles.logoImagen}
            resizeMode="contain"
            accessibilityLabel="Logo Colmenares Tres Pinos"
          />

          <View style={styles.marcaTextos}>
            <Text style={styles.marcaTitulo}>
              Colmenares
            </Text>

            <Text style={styles.marcaSubtitulo}>
              Tres Pinos
            </Text>
          </View>
        </Pressable>

        {mostrarCerrar && (
          <Pressable
            style={styles.botonCerrarMenu}
            onPress={() => setMenuAbierto(false)}
            accessibilityLabel="Cerrar menú"
          >
            <Text style={styles.botonCerrarMenuTexto}>
              ✕
            </Text>
          </Pressable>
        )}

      </View>

      {/* NAVEGACION */}
      <ScrollView
        style={styles.listaMenu}
        contentContainerStyle={styles.listaMenuContenido}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.menuEtiqueta}>
          MENÚ PRINCIPAL
        </Text>

        {itemsMenu.map(item => {

          const activo =
            item.id === moduloActivo;

          return (

            <Pressable
              key={item.id}
              disabled={!item.disponible}
              onPress={() => navegarModulo(item)}
              accessibilityRole="button"
              accessibilityState={{
                disabled: !item.disponible,
                selected: activo,
              }}
              style={({ pressed }) => [

                styles.menuItem,

                activo && styles.menuItemActivo,

                !item.disponible &&
                  styles.menuItemDeshabilitado,

                pressed &&
                  item.disponible &&
                  styles.menuItemPresionado,

              ]}
            >

              <Text
                style={[
                  styles.menuIcono,
                  activo && styles.menuIconoActivo,
                  !item.disponible &&
                    styles.menuIconoDeshabilitado,
                ]}
              >
                {item.icono}
              </Text>

              <View style={styles.menuTextos}>

                <Text
                  style={[
                    styles.menuNombre,
                    activo && styles.menuNombreActivo,
                    !item.disponible &&
                      styles.menuNombreDeshabilitado,
                  ]}
                >
                  {item.nombre}
                </Text>

                {!item.disponible && (
                  <Text style={styles.menuPendiente}>
                    EN DESARROLLO
                  </Text>
                )}

              </View>

              {activo && (
                <View style={styles.menuIndicador} />
              )}

            </Pressable>
          );
        })}

      </ScrollView>

      {/* USUARIO Y SESION */}
      <View style={[
        styles.sidebarFooter,
        mostrarCerrar && styles.sidebarFooterMovil,
      ]}>

        <View style={styles.usuarioAvatar}>
          <Text style={styles.usuarioAvatarTexto}>
            {usuario.nombre.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.usuarioDatos}>

          <Text
            style={styles.usuarioNombre}
            numberOfLines={1}
          >
            {usuario.nombre}
          </Text>

          <Text style={styles.usuarioRol}>
            {nombreRol}
          </Text>

        </View>

        {/* AYUDA Y TUTORIAL */}

        <Pressable
          style={({ pressed }) => [
            styles.botonAyuda,
            pressed && styles.botonAyudaPresionado,
          ]}
          onPress={abrirTutorial}
          accessibilityRole="button"
          accessibilityLabel="Abrir guía de uso"
        >

          <View style={styles.botonAyudaIcono}>
            <Text style={styles.botonAyudaIconoTexto}>
              ?
            </Text>
          </View>

          <Text style={styles.botonAyudaTexto}>
            ¿Cómo se usa la app?
          </Text>

        </Pressable>

        <Pressable
          style={styles.botonSalir}
          onPress={onCerrarSesion}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
        >
          <Text style={styles.botonSalirIcono}>
            ↪
          </Text>

          <Text style={styles.botonSalirTexto}>
            Cerrar sesión
          </Text>
        </Pressable>

      </View>

    </View>
  );

  // ========================================
  // ESCANER QR
  // PANTALLA COMPLETA
  // ========================================

  if (pantalla === 'escaner') {

    return (

      <View style={styles.cameraContainer}>

        <StatusBar barStyle="light-content" />

        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
          onCameraReady={() => {
            setCameraReady(true);
          }}
          onMountError={error => {

            Alert.alert(
              'Error de cámara',
              error.message
            );

          }}
          onBarcodeScanned={
            bloqueoEscaneo.current
              ? undefined
              : resultado => {
                  void escanearQR(resultado);
                }
          }
        />

        <View style={styles.cameraHeader}>

          <Text style={styles.cameraTitle}>
            Escanear código QR
          </Text>

          <Text style={styles.cameraSubtitle}>
            Apunta la cámara al QR oficial de una colmena.
          </Text>

          {!cameraReady && (
            <Text style={styles.cameraSubtitle}>
              Iniciando cámara...
            </Text>
          )}

        </View>

        <Pressable
          style={styles.backButton}
          onPress={volverInicio}
        >
          <Text style={styles.buttonText}>
            Volver al inicio
          </Text>
        </Pressable>

      </View>
    );
  }

  // ==========================================
  // CONTENIDO DE LAS PANTALLAS
  // ==========================================

  let contenido: React.ReactNode = null;

  // DASHBOARD
  if (pantalla === 'inicio') {

    contenido = (
      <InicioModulos

        onEscanear={() => {
          void abrirEscaner();
        }}

        onInspecciones={() => {
          setPantalla('mis-inspecciones');
        }}

        onColmenas={() => {
          setPantalla('colmenas-locales');
        }}

        onTratamientos={() => {
          setPantalla('tratamientos-locales');
        }}

        onRevisiones={() => {
          if (HABILITAR_REVISIONES_GRUPOS) {
            setPantalla('revisiones-grupos');
          }
        }}

      />
    );
  }

  // APIARIOS
  else if (pantalla === 'apiarios-locales') {

    contenido = (
      <ApiariosLocales
        onVolver={volverInicio}
      />
    );
  }

  // TRANSFERENCIAS
  else if (pantalla === 'transferencias-locales') {

    contenido = (
      <TransferenciasLocales
        onEscanear={() => {
          void abrirEscaner();
        }}
      />
    );
  }

  // STOCK
  else if (pantalla === 'stock-locales') {

    contenido = (
      <StockLocales
        onVolver={volverInicio}
        rol={usuario.rol}
      />
    );
  }

  // AUDITORÍA
  else if (pantalla === 'auditoria') {

    contenido = (
      <AuditoriaLocales
        onVolver={volverInicio}
      />
    );
  }

  // USUARIOS
  else if (pantalla === 'usuarios-locales') {

    contenido = (
      <UsuariosLocales
        onVolver={volverInicio}
      />
    );
  }

  // TRATAMIENTOS
  else if (pantalla === 'tratamientos-locales') {

    contenido = (
      <TratamientosLocales
        onVolver={volverInicio}
      />
    );
  }

  // REVISIONES POR GRUPO (conservadas de la versión main).
  else if (pantalla === 'revisiones-grupos') {

    contenido = (
      <RevisionesGrupos
        onVolver={volverInicio}
      />
    );
  }

  // COLMENAS LOCALES
  else if (pantalla === 'colmenas-locales') {

    contenido = (
      <ColmenasLocales

        onVolver={volverInicio}

        onEscanear={() => {
          void abrirEscaner();
        }}

        onVerInspecciones={() => {
          setPantalla('mis-inspecciones');
        }}

      />
    );
  }

  // HISTORIAL DE INSPECCIONES
  else if (pantalla === 'mis-inspecciones') {

    contenido = (
      <MisInspecciones
        onVolver={volverInicio}
      />
    );
  }

  // FORMULARIO DE INSPECCION
  else if (pantalla === 'inspeccion') {

    contenido = (
      <FormularioInspeccion

        codigoQR={codigoQR}

        onVolver={() => {
          setPantalla('colmena');
        }}

      />
    );
  }

  // INFORMACION DE LA COLMENA
  else if (pantalla === 'colmena') {

    contenido = (

      <ScrollView
        contentContainerStyle={styles.detalleContenido}
        showsVerticalScrollIndicator={false}
      >

        <Text style={styles.icon}>
          🐝
        </Text>

        <Text style={styles.title}>
          Información de la colmena
        </Text>

        <View style={styles.card}>

          <Text style={styles.cardLabel}>
            Colmena identificada
          </Text>

          <Text style={styles.nombreColmena}>
            {colmenaSeleccionada?.codigo ??
              'Sin identificar'}
          </Text>

          <Text style={styles.infoText}>
            Apiario: {
              apiarioSeleccionado?.nombre ??
              'Sin información'
            }
          </Text>

          <Text style={styles.infoText}>
            Estado: {
              colmenaSeleccionada?.estado ??
              'Sin información'
            }
          </Text>

          <Text style={styles.infoText}>
            Marcos registrados: {
              colmenaSeleccionada
                ?.cantidad_marcos ?? 'Sin información'
            }
          </Text>

          <Text style={styles.cardLabel}>
            UUID de la colmena
          </Text>

          <Text style={styles.codigo}>
            {codigoQR}
          </Text>

          <Text style={styles.infoText}>
            Información obtenida del catálogo oficial
            almacenado en el teléfono.
          </Text>

        </View>

        <View style={styles.menuDetalle}>

          <Pressable
            style={styles.button}
            onPress={() => {

              if (
                !colmenaSeleccionada ||
                !codigoQR
              ) {

                Alert.alert(
                  'Colmena no disponible',
                  'Debes escanear una colmena oficial antes de registrar una inspección.'
                );

                return;
              }

              setPantalla('inspeccion');
            }}
          >
            <Text style={styles.buttonText}>
              Iniciar inspección
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={volverInicio}
          >
            <Text style={styles.secondaryText}>
              Volver al inicio
            </Text>
          </Pressable>

        </View>

      </ScrollView>
    );
  }

  // ==========================================
  // INTERFAZ RESPONSIVE
  // ==========================================

  return (

    <View style={styles.appContainer}>

      <StatusBar barStyle={menuAbierto ? 'light-content' : 'dark-content'} />

      {/* MENU PERMANENTE EN TABLETS */}
      {esTablet && (

        <View style={styles.sidebarTablet}>
          {renderSidebar(false)}
        </View>

      )}

      {/* AREA PRINCIPAL */}
      <View style={styles.areaPrincipal}>

        {/* CABECERA SUPERIOR */}
        <View style={styles.cabecera}>

          <View style={styles.cabeceraIzquierda}>

            {!esTablet && (

              <Pressable
                style={styles.botonMenu}
                onPress={() => setMenuAbierto(true)}
                accessibilityLabel="Abrir menú"
              >
                <Text style={styles.botonMenuTexto}>
                  ☰
                </Text>
              </Pressable>

            )}

            <View style={styles.cabeceraTitulos}>

              <Text
                style={styles.cabeceraTitulo}
                numberOfLines={1}
              >
                {tituloActual}
              </Text>

              {width >= 420 && (
                <Text style={styles.cabeceraSubtitulo}>
                  Colmenares Tres Pinos
                </Text>
              )}

            </View>

          </View>

          <View style={styles.cabeceraDerecha}>

            {/* ESTADO DE SESION */}
            <View
              style={[
                styles.estadoChip,
                sinConexion
                  ? styles.estadoChipOffline
                  : styles.estadoChipActivo,
              ]}
            >

              <View
                style={[
                  styles.estadoPunto,
                  sinConexion
                    ? styles.puntoOffline
                    : styles.puntoActivo,
                ]}
              />

              {width >= 420 && (
                <Text
                  style={[
                    styles.estadoTexto,
                    sinConexion
                      ? styles.estadoTextoOffline
                      : styles.estadoTextoActivo,
                  ]}
                >
                  {sinConexion
                    ? 'Sin conexión'
                    : 'Sesión activa'}
                </Text>
              )}

            </View>

            {/* ACTUALIZAR */}
            <Pressable
              style={styles.botonActualizar}
              onPress={() => {
                onReintentarConexion();
              }}
            >

              <Text style={styles.actualizarIcono}>
                ↻
              </Text>

              {width >= 520 && (
                <Text style={styles.actualizarTexto}>
                  Actualizar
                </Text>
              )}

            </Pressable>

          </View>

        </View>

        {/* AVISO SIN CONEXION */}
        {sinConexion && (

          <View style={styles.avisoOffline}>

            <Text style={styles.avisoOfflineTitulo}>
              Sin conexión con FastAPI
            </Text>

            <Text style={styles.avisoOfflineTexto}>
              Los registros locales se conservan.
              La sincronización automática todavía está pendiente.
            </Text>

          </View>

        )}

        {/* AVISO CATALOGO */}
        {avisoCatalogo !== '' && (

          <View style={styles.avisoCatalogo}>

            <Text style={styles.avisoCatalogoTexto}>
              {avisoCatalogo}
            </Text>

          </View>

        )}

        {/* CONTENIDO */}
        <View style={styles.contenidoPrincipal}>
          {contenido}
        </View>

      </View>

      {/* MENU DESPLEGABLE EN TELEFONOS
          Modal nativo para asegurar que el panel quede por encima
          de toda la pantalla y reciba correctamente los toques. */}
      <Modal
        visible={menuAbierto && !esTablet}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuAbierto(false)}
      >
        <View style={styles.menuModalContenedor}>

          {/* Tocar fuera del panel lo cierra y mantiene la pantalla actual. */}
          <Pressable
            style={styles.fondoModal}
            onPress={() => setMenuAbierto(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar menú y volver a la pantalla actual"
          />

          {/* El panel queda por encima del fondo y conserva su navegación. */}
          <View style={styles.sidebarMovil}>
            {renderSidebar(true)}
          </View>

        </View>
      </Modal>

      {/* TUTORIAL INTERACTIVO */}

      <Tutorial
        visible={tutorialVisible}
        rol={
          usuario.rol === 'ADMIN'
            ? 'ADMIN'
            : 'APICULTOR'
        }
        onDismiss={() => {
          void cerrarTutorial();
        }}
      />

    </View>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  // ESTRUCTURA GENERAL

  appContainer: {
    flex: 1,
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: COLORS.background,
  },

  areaPrincipal: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.background,
  },

  contenidoPrincipal: {
    flex: 1,
    minHeight: 0,
    backgroundColor: COLORS.background,
  },

  // SIDEBAR TABLET

  sidebarTablet: {
    width: 270,
    backgroundColor: COLORS.forestDeep,
  },

  menuModalContenedor: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  sidebarMovil: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 292,
    maxWidth: '86%',
    backgroundColor: COLORS.forestDeep,
    zIndex: 2,
    elevation: 2,
  },

  sidebarContenido: {
    flex: 1,
    backgroundColor: COLORS.forestDeep,
  },

  // En el menú modal, reserva espacio para la barra de estado.
  // El pie móvil reserva espacio para la navegación inferior de Android
  // y el indicador de inicio de iOS.
  sidebarContenidoMovil: {
    paddingTop: Platform.OS === 'android'
      ? (StatusBar.currentHeight ?? 24)
      : Platform.OS === 'ios'
        ? 44
        : 0,
  },

  sidebarMarca: {
    height: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.forestBorder,
  },

  marcaAcceso: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },

  marcaAccesoPresionado: {
    opacity: 0.7,
  },

  logoImagen: {
    width: 48,
    height: 48,
  },

  marcaTextos: {
    marginLeft: 11,
    flex: 1,
  },

  marcaTitulo: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: '900',
  },

  marcaSubtitulo: {
    color: COLORS.gold,
    fontSize: 12,
    marginTop: 3,
  },

  botonCerrarMenu: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: COLORS.forestMid,
  },

  botonCerrarMenuTexto: {
    color: COLORS.surface,
    fontSize: 17,
  },

  // MENU

  listaMenu: {
    flex: 1,
  },

  listaMenuContenido: {
    paddingHorizontal: 13,
    paddingTop: 23,
    paddingBottom: 20,
  },

  menuEtiqueta: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginHorizontal: 9,
    marginBottom: 13,
  },

  menuItem: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
    marginBottom: 5,
  },

  menuItemActivo: {
    backgroundColor: COLORS.gold,
  },

  menuItemDeshabilitado: {
    opacity: 0.65,
  },

  menuItemPresionado: {
    backgroundColor: COLORS.forestMid,
  },

  menuIcono: {
    width: 31,
    fontSize: 19,
    color: COLORS.borderStrong,
    textAlign: 'center',
  },

  menuIconoActivo: {
    color: COLORS.forest,
  },

  menuIconoDeshabilitado: {
    color: COLORS.textMuted,
  },

  menuTextos: {
    flex: 1,
    marginLeft: 7,
  },

  menuNombre: {
    color: COLORS.borderStrong,
    fontSize: 13,
    fontWeight: '600',
  },

  menuNombreActivo: {
    color: COLORS.forest,
    fontWeight: '900',
  },

  menuNombreDeshabilitado: {
    color: COLORS.textMuted,
  },

  menuPendiente: {
    color: COLORS.textMuted,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 3,
    letterSpacing: 0.5,
  },

  menuIndicador: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: COLORS.forest,
  },

  // USUARIO SIDEBAR

  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: COLORS.forestBorder,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },

  sidebarFooterMovil: {
    paddingBottom: Platform.OS === 'android'
      ? 38
      : Platform.OS === 'ios'
        ? 36
        : 20,
  },

  usuarioAvatar: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },

  usuarioAvatarTexto: {
    color: COLORS.forest,
    fontSize: 17,
    fontWeight: '900',
  },

  usuarioDatos: {
    marginTop: 9,
  },

  usuarioNombre: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '800',
  },

  usuarioRol: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 3,
  },

  botonAyuda: {
    marginTop: 13,
    minHeight: 48,
    borderRadius: 9,
    backgroundColor: COLORS.forestDeep,
    borderWidth: 1,
    borderColor: COLORS.forestBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  botonAyudaPresionado: {
    backgroundColor: COLORS.forestBorder,
  },

  botonAyudaIcono: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  botonAyudaIconoTexto: {
    color: COLORS.forest,
    fontSize: 14,
    fontWeight: '900',
  },

  botonAyudaTexto: {
    color: COLORS.borderStrong,
    fontSize: 12,
    fontWeight: '700',
  },

  botonSalir: {
    marginTop: 12,
    minHeight: 52,
    borderRadius: 11,
    backgroundColor: COLORS.forestMid,
    borderWidth: 1,
    borderColor: COLORS.forestBorder,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  botonSalirIcono: {
    color: COLORS.dangerBg,
    fontSize: 18,
    marginRight: 10,
  },

  botonSalirTexto: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '800',
  },

  // CABECERA

  cabecera: {
    minHeight: 76,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  cabeceraIzquierda: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },

  cabeceraTitulos: {
    flex: 1,
    minWidth: 0,
  },

  cabeceraTitulo: {
    color: COLORS.forest,
    fontSize: 19,
    fontWeight: '900',
  },

  cabeceraSubtitulo: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 3,
  },

  cabeceraDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  botonMenu: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    marginRight: 11,
  },

  botonMenuTexto: {
    color: COLORS.forest,
    fontSize: 21,
  },

  // ESTADO

  estadoChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 9,
    gap: 7,
  },

  estadoChipActivo: {
    backgroundColor: COLORS.successBg,
  },

  estadoChipOffline: {
    backgroundColor: COLORS.goldSoft,
  },

  estadoPunto: {
    width: 7,
    height: 7,
    borderRadius: 5,
  },

  puntoActivo: {
    backgroundColor: COLORS.success,
  },

  puntoOffline: {
    backgroundColor: COLORS.warning,
  },

  estadoTexto: {
    fontSize: 10,
    fontWeight: '800',
  },

  estadoTextoActivo: {
    color: COLORS.successDeep,
  },

  estadoTextoOffline: {
    color: COLORS.goldText,
  },

  // ACTUALIZAR

  botonActualizar: {
    minHeight: 39,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  actualizarIcono: {
    color: COLORS.forest,
    fontSize: 21,
    fontWeight: '700',
  },

  actualizarTexto: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },

  // AVISOS

  avisoOffline: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: COLORS.goldSoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBg,
  },

  avisoOfflineTitulo: {
    color: COLORS.goldText,
    fontWeight: '900',
    fontSize: 12,
  },

  avisoOfflineTexto: {
    color: COLORS.goldText,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },

  avisoCatalogo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.goldSoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.goldBorder,
  },

  avisoCatalogoTexto: {
    color: COLORS.goldText,
    fontSize: 11,
    lineHeight: 17,
  },

  // MENU MOVIL

  fondoModal: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#00000088',
    zIndex: 1,
    elevation: 1,
  },

  // CAMARA

  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },

  camera: {
    flex: 1,
    width: '100%',
  },

  cameraHeader: {
    position: 'absolute',
    top: 75,
    alignSelf: 'center',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#00000099',
    borderRadius: 12,
    maxWidth: '90%',
  },

  cameraTitle: {
    color: COLORS.surface,
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  cameraSubtitle: {
    color: COLORS.surface,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },

  backButton: {
    position: 'absolute',
    bottom: 35,
    alignSelf: 'center',
    backgroundColor: COLORS.gold,
    paddingVertical: 16,
    paddingHorizontal: 35,
    borderRadius: 12,
  },

  buttonText: {
    color: COLORS.forest,
    fontSize: 16,
    fontWeight: '900',
  },

  // INFORMACION DE COLMENA

  detalleContenido: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },

  icon: {
    fontSize: 55,
    marginBottom: 15,
  },

  title: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.forest,
    textAlign: 'center',
  },

  card: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    marginTop: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  cardLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 12,
    fontWeight: '700',
  },

  nombreColmena: {
    fontSize: 23,
    fontWeight: '900',
    color: COLORS.forest,
    marginTop: 10,
    textAlign: 'center',
  },

  codigo: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.goldText,
    marginTop: 10,
    textAlign: 'center',
  },

  infoText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },

  menuDetalle: {
    width: '100%',
    maxWidth: 700,
    marginTop: 25,
    gap: 12,
  },

  button: {
    backgroundColor: COLORS.gold,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },

  secondaryButton: {
    backgroundColor: COLORS.surface,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  secondaryText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
  },

});
