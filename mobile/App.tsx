
import React, {
  useRef,
  useState,
} from 'react';

import {
  Alert,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';

// ==========================================
// PANTALLAS DE LA APLICACIÓN
// ==========================================

import FormularioInspeccion from './FormularioInspeccion';
import MisInspecciones from './MisInspecciones';
import InicioModulos from './InicioModulos';
import ColmenasLocales from './ColmenasLocales';
import TratamientosLocales from './TratamientosLocales';
import RevisionesGrupos from './RevisionesGrupos';

// ==========================================
// AUTENTICACIÓN Y CATÁLOGO
// ==========================================

import {
  leerSesionGuardada,
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
  | 'tratamientos-locales'
  | 'revisiones-grupos';

type Catalogo = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

type ColmenaCatalogo =
  Catalogo['colmenas'][number];

type ApiarioCatalogo =
  Catalogo['apiarios'][number];

// ==========================================
// VALIDAR QR OFICIAL
// ==========================================

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const PATRON_QR = new RegExp(
  `(?:^|/colmenas/qr/)(${UUID})/?(?:[?#].*)?$`,
  'i'
);

function obtenerUUIDDesdeQR(
  valor: string
): string | null {
  const texto = valor.trim();

  const coincidencia =
    texto.match(PATRON_QR);

  if (!coincidencia) {
    return null;
  }

  return coincidencia[1].toLowerCase();
}

// ==========================================
// APLICACIÓN PRINCIPAL
// ==========================================

export default function App() {

  // ========================================
  // NAVEGACIÓN
  // ========================================

  const [pantalla, setPantalla] =
    useState<Pantalla>('inicio');

  // ========================================
  // COLMENA IDENTIFICADA
  // ========================================

  const [codigoQR, setCodigoQR] =
    useState('');

  const [
    colmenaSeleccionada,
    setColmenaSeleccionada,
  ] = useState<ColmenaCatalogo | null>(
    null
  );

  const [
    apiarioSeleccionado,
    setApiarioSeleccionado,
  ] = useState<ApiarioCatalogo | null>(
    null
  );

  // ========================================
  // CÁMARA
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
  // VOLVER AL INICIO
  // ========================================

  const volverInicio = () => {
    bloqueoEscaneo.current = false;

    setCameraReady(false);
    setCodigoQR('');
    setColmenaSeleccionada(null);
    setApiarioSeleccionado(null);

    setPantalla('inicio');
  };

  // ========================================
  // ABRIR ESCÁNER QR
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

    setPantalla('escaner');
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

    // Extraer el UUID de la etiqueta.
    const uuid = obtenerUUIDDesdeQR(
      data
    );

    if (!uuid) {
      mostrarErrorEscaneo(
        'Código QR inválido',
        'El QR no tiene el formato oficial de una colmena.'
      );

      return;
    }

    try {

      // ====================================
      // IDENTIFICAR USUARIO
      // ====================================

      const sesion =
        await leerSesionGuardada();

      if (!sesion) {
        mostrarErrorEscaneo(
          'Sesión no disponible',
          'El QR fue leído correctamente, pero debes iniciar sesión para consultar el catálogo oficial de colmenas.'
        );

        return;
      }

      // ====================================
      // CONSULTAR CATÁLOGO SQLITE
      // ====================================

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

      // ====================================
      // BUSCAR COLMENA OFICIAL
      // ====================================

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

      // ====================================
      // IDENTIFICAR APIARIO
      // ====================================

      const apiario =
        catalogo.apiarios.find(
          item =>
            item.id ===
            colmena.apiario_id
        ) ?? null;

      // ====================================
      // ABRIR COLMENA
      // ====================================

      setCodigoQR(
        colmena.codigo_qr
      );

      setColmenaSeleccionada(
        colmena
      );

      setApiarioSeleccionado(
        apiario
      );

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
  // MENÚ PRINCIPAL
  // ========================================

  if (pantalla === 'inicio') {
    return (
      <InicioModulos

        onEscanear={() => {
          void abrirEscaner();
        }}

        onInspecciones={() => {
          setPantalla(
            'mis-inspecciones'
          );
        }}

        onColmenas={() => {
          setPantalla(
            'colmenas-locales'
          );
        }}

        onTratamientos={() => {
          setPantalla(
            'tratamientos-locales'
          );
        }}

        onRevisiones={() => {
          setPantalla(
            'revisiones-grupos'
          );
        }}

      />
    );
  }

  // ========================================
  // REVISIONES POR GRUPO
  // ========================================

  if (
    pantalla === 'revisiones-grupos'
  ) {
    return (
      <RevisionesGrupos
        onVolver={volverInicio}
      />
    );
  }

  // ========================================
  // TRATAMIENTOS
  // ========================================

  if (
    pantalla === 'tratamientos-locales'
  ) {
    return (
      <TratamientosLocales
        onVolver={volverInicio}
      />
    );
  }

  // ========================================
  // COLMENAS LOCALES
  // ========================================

  if (
    pantalla === 'colmenas-locales'
  ) {
    return (
      <ColmenasLocales

        onVolver={volverInicio}

        onEscanear={() => {
          void abrirEscaner();
        }}

        onVerInspecciones={() => {
          setPantalla(
            'mis-inspecciones'
          );
        }}

      />
    );
  }

  // ========================================
  // HISTORIAL DE INSPECCIONES
  // ========================================

  if (
    pantalla === 'mis-inspecciones'
  ) {
    return (
      <MisInspecciones
        onVolver={volverInicio}
      />
    );
  }

  // ========================================
  // FORMULARIO DE INSPECCIÓN
  // ========================================

  if (
    pantalla === 'inspeccion'
  ) {
    return (
      <FormularioInspeccion

        codigoQR={codigoQR}

        onVolver={() => {
          setPantalla('colmena');
        }}

      />
    );
  }

  // ========================================
  // ESCÁNER QR
  // ========================================

  if (
    pantalla === 'escaner'
  ) {
    return (
      <View
        style={styles.cameraContainer}
      >
        <StatusBar
          barStyle="light-content"
        />

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
                  void escanearQR(
                    resultado
                  );
                }
          }
        />

        <View
          style={styles.cameraHeader}
        >

          <Text
            style={styles.cameraTitle}
          >
            Escanear código QR
          </Text>

          <Text
            style={styles.cameraSubtitle}
          >
            Apunta la cámara al QR
            oficial de una colmena.
          </Text>

          {!cameraReady && (
            <Text
              style={styles.cameraSubtitle}
            >
              Iniciando cámara...
            </Text>
          )}

        </View>

        <Pressable
          style={styles.backButton}
          onPress={volverInicio}
        >
          <Text
            style={styles.buttonText}
          >
            Volver al inicio
          </Text>
        </Pressable>

      </View>
    );
  }

  // ========================================
  // INFORMACIÓN DE LA COLMENA
  // ========================================

  return (
    <View style={styles.container}>

      <StatusBar
        barStyle="dark-content"
      />

      <Text style={styles.icon}>
        🐝
      </Text>

      <Text style={styles.title}>
        Información de la colmena
      </Text>

      <View style={styles.card}>

        <Text
          style={styles.cardLabel}
        >
          Colmena identificada
        </Text>

        <Text
          style={styles.nombreColmena}
        >
          {colmenaSeleccionada?.codigo ??
            'Sin identificar'}
        </Text>

        <Text
          style={styles.infoText}
        >
          Apiario: {
            apiarioSeleccionado?.nombre ??
            'Sin información'
          }
        </Text>

        <Text
          style={styles.infoText}
        >
          Estado: {
            colmenaSeleccionada?.estado ??
            'Sin información'
          }
        </Text>

        <Text
          style={styles.infoText}
        >
          Marcos registrados: {
            colmenaSeleccionada
              ?.cantidad_marcos ?? 'Sin información'
          }
        </Text>

        <Text
          style={styles.cardLabel}
        >
          UUID de la colmena
        </Text>

        <Text style={styles.codigo}>
          {codigoQR}
        </Text>

        <Text
          style={styles.infoText}
        >
          Información obtenida
          del catálogo oficial
          almacenado en el teléfono.
        </Text>

      </View>

      <View style={styles.menu}>

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

            setPantalla(
              'inspeccion'
            );
          }}
        >
          <Text
            style={styles.buttonText}
          >
            Iniciar inspección
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={volverInicio}
        >
          <Text
            style={styles.secondaryText}
          >
            Volver al inicio
          </Text>
        </Pressable>

      </View>

    </View>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#FFF9EC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  icon: {
    fontSize: 64,
    marginBottom: 20,
  },

  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#3D321B',
    textAlign: 'center',
  },

  menu: {
    width: '100%',
    marginTop: 35,
    gap: 15,
  },

  button: {
    backgroundColor: '#D99A24',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },

  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D99A24',
  },

  secondaryText: {
    color: '#775315',
    fontSize: 17,
    fontWeight: '600',
  },

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
    bottom: 55,
    alignSelf: 'center',
    backgroundColor: '#D99A24',
    paddingVertical: 16,
    paddingHorizontal: 35,
    borderRadius: 12,
  },

  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginTop: 30,
    alignItems: 'center',
  },

  cardLabel: {
    fontSize: 14,
    color: '#766B52',
    marginTop: 12,
  },

  nombreColmena: {
    fontSize: 23,
    fontWeight: '800',
    color: '#3D321B',
    marginTop: 10,
    textAlign: 'center',
  },

  codigo: {
    fontSize: 13,
    fontWeight: '600',
    color: '#775315',
    marginTop: 10,
    textAlign: 'center',
  },

  infoText: {
    color: '#766B52',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 12,
  },
});
