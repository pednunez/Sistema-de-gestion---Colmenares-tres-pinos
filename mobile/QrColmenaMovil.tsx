import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { COLORS } from './theme';
import { API_BASE_URL } from './api/config';
import { leerSesionGuardada } from './api/auth';
import { asociarQrColmena } from './api/colmenas';

// ==========================================
// QR DE COLMENA: VISUALIZAR, DESCARGAR Y CAMBIAR ETIQUETA
// ==========================================

type Props = {
  colmenaId: number;
  codigo: string;
  codigoQR: string;
  rol?: string;
  onQrActualizado: (nuevoCodigo: string) => void;
};

function extraerUUID(valor: string): string | null {
  const coincidencia = valor.trim().match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return coincidencia?.[1]?.toLowerCase() ?? null;
}

export default function QrColmenaMovil({
  colmenaId,
  codigo,
  codigoQR,
  rol,
  onQrActualizado,
}: Props) {
  const [cargando, setCargando] = useState(false);
  const [errorImagen, setErrorImagen] = useState(false);
  const [opcionesAbiertas, setOpcionesAbiertas] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const bloqueo = useRef(false);

  const urlImagen = `${API_BASE_URL}/colmenas/${colmenaId}/qr?etiqueta=${encodeURIComponent(codigoQR)}`;

  const descargar = async () => {
    if (cargando) return;
    setCargando(true);
    try {
      const directorio = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!directorio) throw new Error('No hay una carpeta disponible para guardar la imagen.');
      const nombre = `QR_${codigo.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
      const destino = `${directorio}${nombre}`;
      const respuesta = await FileSystem.downloadAsync(urlImagen, destino);
      if (respuesta.status !== 200) throw new Error('El servidor no pudo generar la imagen QR.');

      const permiso = await MediaLibrary.requestPermissionsAsync();
      if (!permiso.granted) {
        Alert.alert(
          'Permiso necesario',
          'Autoriza el acceso a fotos para guardar la etiqueta QR en la galería del teléfono.'
        );
        return;
      }

      await MediaLibrary.saveToLibraryAsync(respuesta.uri);
      Alert.alert('Imagen guardada', `El QR de ${codigo} quedó guardado en la galería del teléfono.`);
    } catch (err) {
      Alert.alert('No se pudo descargar el QR', err instanceof Error ? err.message : 'Intenta nuevamente.');
    } finally {
      setCargando(false);
    }
  };

  const asociar = async (nuevoCodigo: string | null) => {
    if (cargando) return;
    setCargando(true);
    try {
      const sesion = await leerSesionGuardada();
      if (!sesion) throw new Error('Debes iniciar sesión nuevamente.');
      const actualizada = await asociarQrColmena(colmenaId, nuevoCodigo, sesion.accessToken);
      setOpcionesAbiertas(false);
      setEscaneando(false);
      bloqueo.current = false;
      Alert.alert(
        'Etiqueta actualizada',
        nuevoCodigo
          ? `La etiqueta escaneada quedó asociada a ${codigo}. El QR anterior dejó de funcionar.`
          : `Se generó un nuevo código QR para ${codigo}. Descarga e imprime la nueva etiqueta.`,
        [{ text: 'Aceptar', onPress: () => onQrActualizado(actualizada.codigo_qr) }]
      );
    } catch (err) {
      bloqueo.current = false;
      Alert.alert('No se pudo cambiar la etiqueta', err instanceof Error ? err.message : 'Intenta nuevamente.');
    } finally {
      setCargando(false);
    }
  };

  const iniciarEscaneo = async () => {
    if (!permission?.granted) {
      const permiso = await requestPermission();
      if (!permiso.granted) {
        Alert.alert('Permiso de cámara', 'Necesitas habilitar la cámara para leer la etiqueta QR que ya está impresa.');
        return;
      }
    }
    bloqueo.current = false;
    setOpcionesAbiertas(false);
    setEscaneando(true);
  };

  const leerEtiqueta = (valor: string) => {
    if (bloqueo.current) return;
    bloqueo.current = true;
    const uuid = extraerUUID(valor);
    if (!uuid) {
      bloqueo.current = false;
      Alert.alert('QR no válido', 'La etiqueta no contiene un identificador de colmena reconocido.');
      return;
    }
    void asociar(uuid);
  };

  return (
    <View style={styles.contenedor}>
      <View style={styles.imagenContenedor}>
        {errorImagen ? (
          <View style={styles.errorQr}>
            <Text style={styles.iconoQr}>▦</Text>
            <Text style={styles.textoErrorQr}>No se pudo cargar el QR</Text>
            <Pressable onPress={() => setErrorImagen(false)}>
              <Text style={styles.reintentar}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <Image
            key={codigoQR}
            source={{ uri: urlImagen }}
            style={styles.imagen}
            resizeMode="contain"
            onError={() => setErrorImagen(true)}
          />
        )}
      </View>

      <Pressable style={styles.botonTexto} onPress={() => void descargar()} disabled={cargando}>
        {cargando ? <ActivityIndicator size="small" color={COLORS.goldText} /> : <Text style={styles.botonDescargar}>Descargar imagen</Text>}
      </Pressable>

      {rol === 'ADMIN' && (
        <Pressable style={styles.botonCambiar} onPress={() => setOpcionesAbiertas(true)} disabled={cargando}>
          <Text style={styles.iconoCambiar}>▦</Text>
          <Text style={styles.textoCambiar}>Cambiar etiqueta</Text>
        </Pressable>
      )}

      <Modal visible={opcionesAbiertas} transparent animationType="fade" onRequestClose={() => setOpcionesAbiertas(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <View style={styles.modalCabecera}>
              <Text style={styles.modalTitulo}>Etiqueta QR de {codigo}</Text>
              <Pressable onPress={() => setOpcionesAbiertas(false)}><Text style={styles.cerrar}>×</Text></Pressable>
            </View>
            <Text style={styles.modalAyuda}>Puedes asociar una etiqueta que ya está impresa o generar un código nuevo si la etiqueta se perdió o dañó.</Text>
            <Pressable style={styles.opcion} onPress={() => void iniciarEscaneo()}>
              <Text style={styles.opcionTitulo}>Escanear etiqueta ya impresa</Text>
              <Text style={styles.opcionTexto}>Lee el QR nuevo con la cámara. El código anterior dejará de funcionar.</Text>
            </Pressable>
            <Pressable style={styles.opcion} onPress={() => {
              Alert.alert(
                'Generar un QR nuevo',
                `La etiqueta anterior de ${codigo} dejará de funcionar. Debes descargar e imprimir el nuevo QR.`,
                [
                  { text: 'Volver', style: 'cancel' },
                  { text: 'Generar QR', onPress: () => void asociar(null) },
                ]
              );
            }}>
              <Text style={styles.opcionTitulo}>Generar código nuevo</Text>
              <Text style={styles.opcionTexto}>El servidor crea una etiqueta nueva para esta colmena.</Text>
            </Pressable>
            <Pressable style={styles.cancelar} onPress={() => setOpcionesAbiertas(false)}>
              <Text style={styles.cancelarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={escaneando} animationType="slide" onRequestClose={() => setEscaneando(false)}>
        <View style={styles.camaraContenedor}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={resultado => leerEtiqueta(resultado.data)}
          />
          <View style={styles.camaraCabecera}>
            <Text style={styles.camaraTitulo}>Escanear etiqueta nueva</Text>
            <Text style={styles.camaraAyuda}>Centra el QR impreso dentro del recuadro.</Text>
          </View>
          <View pointerEvents="none" style={styles.marcoEscaneo} />
          <Pressable style={styles.cerrarCamara} onPress={() => {
            setEscaneando(false);
            bloqueo.current = false;
          }}>
            <Text style={styles.cerrarCamaraTexto}>Cancelar escaneo</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { alignItems: 'center', gap: 5, marginTop: 12 },
  imagenContenedor: { width: 172, height: 172, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, overflow: 'hidden' },
  imagen: { width: 166, height: 166 },
  errorQr: { alignItems: 'center', gap: 6, padding: 12 },
  iconoQr: { color: COLORS.textMuted, fontSize: 34 },
  textoErrorQr: { color: COLORS.textSecondary, fontSize: 10, textAlign: 'center' },
  reintentar: { color: COLORS.goldText, fontSize: 11, fontWeight: '800' },
  botonTexto: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  botonDescargar: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  botonCambiar: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8 },
  iconoCambiar: { color: COLORS.textSecondary, fontSize: 14 },
  textoCambiar: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: '#00000077', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 480, backgroundColor: COLORS.surface, borderRadius: 17, paddingBottom: 14, overflow: 'hidden' },
  modalCabecera: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitulo: { color: COLORS.forest, fontSize: 15, fontWeight: '900' },
  cerrar: { color: COLORS.textSecondary, fontSize: 28 },
  modalAyuda: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  opcion: { marginHorizontal: 14, marginTop: 8, padding: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, gap: 5 },
  opcionTitulo: { color: COLORS.forest, fontSize: 13, fontWeight: '800' },
  opcionTexto: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  cancelar: { marginHorizontal: 14, marginTop: 12, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelarTexto: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  camaraContenedor: { flex: 1, backgroundColor: '#000000' },
  camaraCabecera: { position: 'absolute', top: 55, left: 20, right: 20, alignItems: 'center', gap: 6 },
  camaraTitulo: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  camaraAyuda: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },
  marcoEscaneo: { position: 'absolute', width: 250, height: 250, alignSelf: 'center', top: '34%', borderWidth: 3, borderColor: COLORS.gold, borderRadius: 18 },
  cerrarCamara: { position: 'absolute', bottom: 48, alignSelf: 'center', backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 13 },
  cerrarCamaraTexto: { color: COLORS.forest, fontSize: 13, fontWeight: '800' },
});
