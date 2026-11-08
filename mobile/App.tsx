
import React, {
  useRef,
  useState,
} from 'react';

import {
  Alert,
  Modal,
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
  | 'grupos'
  | 'inspecciones'
  | 'tratamientos'
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
    id: 'grupos',
    nombre: 'Grupos',
    icono: '▤',
    roles: TODOS,
    destino: 'revisiones-grupos',
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

    case 'revisiones-grupos':
      return 'grupos';

    case 'mis-inspecciones':
    case 'inspeccion':
      return 'inspecciones';

    case 'tratamientos-locales':
      return 'tratamientos';

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

    <View style={styles.sidebarContenido}>

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
          <View style={styles.logo}>
            <Text style={styles.logoTexto}>
              CP
            </Text>
          </View>

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
      <View style={styles.sidebarFooter}>

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

        <Pressable
          style={styles.botonSalir}
          onPress={onCerrarSesion}
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

  // ========================================
  // CONTENIDO DE LAS PANTALLAS
  // ========================================

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
          setPantalla('revisiones-grupos');
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

  // REVISIONES POR GRUPO
  else if (pantalla === 'revisiones-grupos') {

    contenido = (
      <RevisionesGrupos
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

  // ========================================
  // INTERFAZ RESPONSIVE
  // ========================================

  return (

    <View style={styles.appContainer}>

      <StatusBar barStyle="dark-content" />

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
    backgroundColor: '#F1F4FA',
  },

  areaPrincipal: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F1F4FA',
  },

  contenidoPrincipal: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F1F4FA',
  },

  // SIDEBAR TABLET

  sidebarTablet: {
    width: 270,
    backgroundColor: '#0F172A',
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
    backgroundColor: '#0F172A',
    zIndex: 2,
    elevation: 2,
  },

  sidebarContenido: {
    flex: 1,
    backgroundColor: '#0F172A',
  },

  sidebarMarca: {
    height: 86,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    borderBottomWidth: 1,
    borderBottomColor: '#263449',
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

  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoTexto: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '900',
  },

  marcaTextos: {
    marginLeft: 11,
    flex: 1,
  },

  marcaTitulo: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },

  marcaSubtitulo: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },

  botonCerrarMenu: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },

  botonCerrarMenuTexto: {
    color: '#FFFFFF',
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
    color: '#64748B',
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
    backgroundColor: '#FBBF24',
  },

  menuItemDeshabilitado: {
    opacity: 0.65,
  },

  menuItemPresionado: {
    backgroundColor: '#1E293B',
  },

  menuIcono: {
    width: 31,
    fontSize: 19,
    color: '#CBD5E1',
    textAlign: 'center',
  },

  menuIconoActivo: {
    color: '#0F172A',
  },

  menuIconoDeshabilitado: {
    color: '#64748B',
  },

  menuTextos: {
    flex: 1,
    marginLeft: 7,
  },

  menuNombre: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
  },

  menuNombreActivo: {
    color: '#0F172A',
    fontWeight: '900',
  },

  menuNombreDeshabilitado: {
    color: '#94A3B8',
  },

  menuPendiente: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '900',
    marginTop: 3,
    letterSpacing: 0.5,
  },

  menuIndicador: {
    width: 6,
    height: 6,
    borderRadius: 4,
    backgroundColor: '#0F172A',
  },

  // USUARIO SIDEBAR

  sidebarFooter: {
    borderTopWidth: 1,
    borderTopColor: '#263449',
    padding: 16,
  },

  usuarioAvatar: {
    width: 37,
    height: 37,
    borderRadius: 11,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },

  usuarioAvatarTexto: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '900',
  },

  usuarioDatos: {
    marginTop: 9,
  },

  usuarioNombre: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  usuarioRol: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 3,
  },

  botonSalir: {
    marginTop: 15,
    minHeight: 43,
    borderRadius: 9,
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },

  botonSalirIcono: {
    color: '#FCA5A5',
    fontSize: 18,
    marginRight: 10,
  },

  botonSalirTexto: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },

  // CABECERA

  cabecera: {
    minHeight: 76,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '900',
  },

  cabeceraSubtitulo: {
    color: '#64748B',
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
    borderColor: '#E2E8F0',
    borderRadius: 9,
    marginRight: 11,
  },

  botonMenuTexto: {
    color: '#0F172A',
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
    backgroundColor: '#F0FDF4',
  },

  estadoChipOffline: {
    backgroundColor: '#FFF7ED',
  },

  estadoPunto: {
    width: 7,
    height: 7,
    borderRadius: 5,
  },

  puntoActivo: {
    backgroundColor: '#16A34A',
  },

  puntoOffline: {
    backgroundColor: '#EA580C',
  },

  estadoTexto: {
    fontSize: 10,
    fontWeight: '800',
  },

  estadoTextoActivo: {
    color: '#166534',
  },

  estadoTextoOffline: {
    color: '#9A3412',
  },

  // ACTUALIZAR

  botonActualizar: {
    minHeight: 39,
    paddingHorizontal: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },

  actualizarIcono: {
    color: '#0F172A',
    fontSize: 21,
    fontWeight: '700',
  },

  actualizarTexto: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },

  // AVISOS

  avisoOffline: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: '#FFF7ED',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },

  avisoOfflineTitulo: {
    color: '#9A3412',
    fontWeight: '900',
    fontSize: 12,
  },

  avisoOfflineTexto: {
    color: '#9A3412',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },

  avisoCatalogo: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },

  avisoCatalogoTexto: {
    color: '#92400E',
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
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  cameraSubtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },

  backButton: {
    position: 'absolute',
    bottom: 35,
    alignSelf: 'center',
    backgroundColor: '#FBBF24',
    paddingVertical: 16,
    paddingHorizontal: 35,
    borderRadius: 12,
  },

  buttonText: {
    color: '#0F172A',
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
    color: '#0F172A',
    textAlign: 'center',
  },

  card: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginTop: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  cardLabel: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 12,
    fontWeight: '700',
  },

  nombreColmena: {
    fontSize: 23,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
    textAlign: 'center',
  },

  codigo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#956513',
    marginTop: 10,
    textAlign: 'center',
  },

  infoText: {
    color: '#64748B',
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
    backgroundColor: '#FBBF24',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },

  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  secondaryText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '700',
  },

});
