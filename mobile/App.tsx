
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
// PANTALLAS DE LA APLICACIÃ“N
// ==========================================

import FormularioInspeccion from './FormularioInspeccion';
import MisInspecciones from './MisInspecciones';
import InicioModulos from './InicioModulos';
import ColmenasLocales from './ColmenasLocales';
import TratamientosLocales from './TratamientosLocales';
import RevisionesGrupos from './RevisionesGrupos';

// ==========================================
// AUTENTICACIÃ“N Y CATÃLOGO
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
// APLICACIÃ“N PRINCIPAL
// ==========================================

export default function App() {

  // ========================================
  // NAVEGACIÃ“N
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
  // CÃMARA
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
  // ABRIR ESCÃNER QR
  // ========================================

  const abrirEscaner = async () => {

    if (!permission?.granted) {

      const resultado =
        await requestPermission();

      if (!resultado.granted) {
        Alert.alert(
          'Permiso necesario',
          'Debes permitir el acceso a la cÃ¡mara para escanear las colmenas.'
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

    // Impedir escaneos simultÃ¡neos.
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
        'CÃ³digo QR invÃ¡lido',
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
          'SesiÃ³n no disponible',
          'El QR fue leÃ­do correctamente, pero debes iniciar sesiÃ³n para consultar el catÃ¡logo oficial de colmenas.'
        );

        return;
      }

      // ====================================
      // CONSULTAR CATÃLOGO SQLITE
      // ====================================

      const catalogo =
        await leerCatalogoLocal(
          sesion.usuario.id
        );

      if (!catalogo) {
        mostrarErrorEscaneo(
          'CatÃ¡logo no disponible',
          'No hay un catÃ¡logo oficial descargado para este usuario. Debes iniciar sesiÃ³n con conexiÃ³n a FastAPI para obtenerlo.'
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
          'El QR tiene un formato vÃ¡lido, pero no pertenece a ninguna colmena del catÃ¡logo oficial disponible.'
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
        'No se pudo consultar el catÃ¡logo local. Los datos no se han modificado.'
      );
    }
  };

  // ========================================
  // MENÃš PRINCIPAL
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
  // FORMULARIO DE INSPECCIÃ“N
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
  // ESCÃNER QR
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
              'Error de cÃ¡mara',
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
            Escanear cÃ³digo QR
          </Text>

          <Text
            style={styles.cameraSubtitle}
          >
            Apunta la cÃ¡mara al QR
            oficial de una colmena.
          </Text>

          {!cameraReady && (
            <Text
              style={styles.cameraSubtitle}
            >
              Iniciando cÃ¡mara...
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
  // INFORMACIÃ“N DE LA COLMENA
  // ========================================

  return (
    <View style={styles.container}>

      <StatusBar
        barStyle="dark-content"
      />

      <Text style={styles.icon}>
        ðŸ
      </Text>

      <Text style={styles.title}>
        InformaciÃ³n de la colmena
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
            'Sin informaciÃ³n'
          }
        </Text>

        <Text
          style={styles.infoText}
        >
          Estado: {
            colmenaSeleccionada?.estado ??
            'Sin informaciÃ³n'
          }
        </Text>

        <Text
          style={styles.infoText}
        >
          Marcos registrados: {
            colmenaSeleccionada
              ?.cantidad_marcos ?? 'Sin informaciÃ³n'
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
          InformaciÃ³n obtenida
          del catÃ¡logo oficial
          almacenado en el telÃ©fono.
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
                'Debes escanear una colmena oficial antes de registrar una inspecciÃ³n.'
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
            Iniciar inspecciÃ³n
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
