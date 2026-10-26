
import React, { useRef, useState } from 'react';

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

import FormularioInspeccion from './FormularioInspeccion';
import MisInspecciones from './MisInspecciones';
import InicioModulos from './InicioModulos';
import ColmenasLocales from './ColmenasLocales';
import TratamientosLocales from './TratamientosLocales';

type Pantalla =
  | 'inicio'
  | 'escaner'
  | 'colmena'
  | 'inspeccion'
  | 'mis-inspecciones'
  | 'colmenas-locales'
  | 'tratamientos-locales';

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('inicio');
  const [codigoQR, setCodigoQR] = useState('');
  const [cameraReady, setCameraReady] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();

  const bloqueoEscaneo = useRef(false);

  // VOLVER AL INICIO
  const volverInicio = () => {
    bloqueoEscaneo.current = false;
    setCameraReady(false);
    setCodigoQR('');
    setPantalla('inicio');
  };

  // ABRIR ESCÁNER
  const abrirEscaner = async () => {
    if (!permission?.granted) {
      const resultado = await requestPermission();

      if (!resultado.granted) {
        Alert.alert(
          'Permiso necesario',
          'Debes permitir el acceso a la cámara.'
        );
        return;
      }
    }

    bloqueoEscaneo.current = false;
    setCameraReady(false);
    setPantalla('escaner');
  };

  // LEER QR
  const escanearQR = ({ data }: { data: string }) => {
    if (bloqueoEscaneo.current) return;

    bloqueoEscaneo.current = true;

    if (data !== 'COLMENA-PRUEBA-001') {
      Alert.alert(
        'QR no registrado',
        'El código fue leído, pero todavía no está conectado al catálogo oficial de colmenas.',
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
      return;
    }

    setCodigoQR(data);
    setCameraReady(false);
    setPantalla('colmena');
  };

  // PANTALLA PRINCIPAL
  if (pantalla === 'inicio') {
    return (
      <InicioModulos
        onEscanear={() => void abrirEscaner()}
        onInspecciones={() =>
          setPantalla('mis-inspecciones')
        }
        onColmenas={() =>
          setPantalla('colmenas-locales')
        }
        onTratamientos={() =>
          setPantalla('tratamientos-locales')
        }
      />
    );
  }

  // TRATAMIENTOS
  if (pantalla === 'tratamientos-locales') {
    return (
      <TratamientosLocales onVolver={volverInicio} />
    );
  }

  // COLMENAS LOCALES
  if (pantalla === 'colmenas-locales') {
    return (
      <ColmenasLocales
        onVolver={volverInicio}
        onEscanear={() => void abrirEscaner()}
        onVerInspecciones={() =>
          setPantalla('mis-inspecciones')
        }
      />
    );
  }

  // HISTORIAL DE INSPECCIONES
  if (pantalla === 'mis-inspecciones') {
    return (
      <MisInspecciones onVolver={volverInicio} />
    );
  }

  // FORMULARIO DE INSPECCIÓN
  if (pantalla === 'inspeccion') {
    return (
      <FormularioInspeccion
        codigoQR={codigoQR}
        onVolver={() => setPantalla('colmena')}
      />
    );
  }

  // ESCÁNER QR
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
          onCameraReady={() => setCameraReady(true)}
          onMountError={error =>
            Alert.alert('Error de cámara', error.message)
          }
          onBarcodeScanned={
            bloqueoEscaneo.current
              ? undefined
              : escanearQR
          }
        />

        <View style={styles.cameraHeader}>
          <Text style={styles.cameraTitle}>
            Escanear código QR
          </Text>

          <Text style={styles.cameraSubtitle}>
            Apunta la cámara al QR de una colmena
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

  // INFORMACIÓN DE LA COLMENA
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Text style={styles.icon}>🐝</Text>

      <Text style={styles.title}>
        Información de la colmena
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>
          Código QR identificado
        </Text>

        <Text style={styles.codigo}>
          {codigoQR}
        </Text>

        <Text style={styles.testLabel}>
          Registro de prueba
        </Text>

        <Text style={styles.infoText}>
          La consulta de datos reales estará disponible
          cuando conectemos FastAPI.
        </Text>
      </View>

      <View style={styles.menu}>
        <Pressable
          style={styles.button}
          onPress={() => setPantalla('inspeccion')}
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
    </View>
  );
}

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
    fontSize: 15,
    color: '#766B52',
  },
  codigo: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#3D321B',
    marginTop: 12,
    textAlign: 'center',
  },
  testLabel: {
    color: '#956513',
    fontSize: 14,
    marginTop: 12,
  },
  infoText: {
    color: '#766B52',
    textAlign: 'center',
    fontSize: 13,
    marginTop: 12,
  },
});
