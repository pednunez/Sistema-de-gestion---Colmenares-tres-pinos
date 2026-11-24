
import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { COLORS } from './theme';

import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  StyleSheet,
  StatusBar,
} from 'react-native';

import {
  listarInspeccionesLocales,
} from './database/inspecciones';

import type {
  InspeccionGuardada,
} from './database/inspecciones';

type Props = {
  onVolver: () => void;
};

// FORMATO DE FECHA
function formatearFecha(fecha: string): string {
  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return 'Fecha no disponible';
  }

  return valor.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MisInspecciones({
  onVolver,
}: Props) {

  // REGISTROS GUARDADOS
  const [inspecciones, setInspecciones] = useState<
    InspeccionGuardada[]
  >([]);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // CONSULTAR SQLITE
  const cargarInspecciones = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const registros = await listarInspeccionesLocales();
      setInspecciones(registros);
    } catch (err) {
      console.error('Error consultando SQLite:', err);

      setError(
        'No se pudieron cargar las inspecciones guardadas.'
      );
    } finally {
      setCargando(false);
    }
  }, []);

  // CARGAR AL ABRIR LA PANTALLA
  useEffect(() => {
    void cargarInspecciones();
  }, [cargarInspecciones]);

  // CONTADOR DE PENDIENTES
  const pendientes = inspecciones.filter(
    item => item.estado !== 'SINCRONIZADO'
  ).length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        style={{ flex: 1 }}
        data={inspecciones}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View>
            <Pressable
              style={styles.botonVolver}
              onPress={onVolver}
            >
              <Text style={styles.textoVolver}>‹ Volver al inicio</Text>
            </Pressable>

            <Text style={styles.icon}>🐝</Text>
            <Text style={styles.title}>Mis inspecciones</Text>
            <Text style={styles.subtitle}>
              Registros guardados en este dispositivo
            </Text>

            <View style={styles.resumen}>
              <View style={styles.resumenItem}>
                <Text style={styles.numero}>{inspecciones.length}</Text>
                <Text style={styles.resumenLabel}>Total local</Text>
              </View>
              <View style={styles.resumenItem}>
                <Text style={styles.numero}>{pendientes}</Text>
                <Text style={styles.resumenLabel}>Pendientes</Text>
              </View>
            </View>

            <Pressable
              style={styles.actualizar}
              onPress={() => void cargarInspecciones()}
              disabled={cargando}
            >
              <Text style={styles.actualizarTexto}>Actualizar historial</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          cargando ? (
            <ActivityIndicator
              size="large"
              color={COLORS.gold}
              style={styles.loading}
            />
          ) : error ? (
            <View style={styles.card}>
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyTitle}>Todavía no hay inspecciones</Text>
              <Text style={styles.detalle}>
                Escanea una colmena y guarda tu primera inspección para verla aquí.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const sincronizado = item.estado === 'SINCRONIZADO';

          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Inspección N.º {item.id}</Text>
              <Text style={styles.codigo}>{item.codigo_qr}</Text>
              <Text style={styles.fecha}>{formatearFecha(item.fecha_local)}</Text>

              <View
                style={[
                  styles.estado,
                  sincronizado ? styles.sincronizado : styles.pendiente,
                ]}
              >
                <Text style={styles.estadoTexto}>
                  {sincronizado
                    ? '✓ Sincronizada'
                    : '◷ Pendiente de sincronización'}
                </Text>
              </View>

              <View style={styles.detalles}>
                <Text style={styles.detalle}>Marcos totales: {item.marcos_totales}</Text>
                <Text style={styles.detalle}>Marcos con cría: {item.marcos_cria}</Text>
                <Text style={styles.detalle}>Marcos con miel: {item.marcos_miel}</Text>
                <Text style={styles.detalle}>Estado de la reina: {item.reina}</Text>
              </View>

              {item.observaciones.trim() !== '' && (
                <View style={styles.observaciones}>
                  <Text style={styles.observacionesTitulo}>Observaciones</Text>
                  <Text style={styles.detalle}>{item.observaciones}</Text>
                </View>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          <Text style={styles.footer}>
            Las inspecciones permanecen guardadas localmente.
            La sincronización con FastAPI todavía está en desarrollo.
          </Text>
        }
      />
    </View>
  );

}

// ESTILOS
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: COLORS.goldSoft,
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 50,
  },

  // VOLVER AL INICIO
  botonVolver: {
    alignSelf: 'flex-start',
    marginBottom: 45,
    paddingVertical: 5,
  },

  textoVolver: {
    color: COLORS.goldText,
    fontWeight: 'bold',
    fontSize: 22,
  },

  icon: {
    fontSize: 55,
    textAlign: 'center',
    marginBottom: 12,
  },

  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 25,
  },

  resumen: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
  },

  resumenItem: {
    flex: 1,
    alignItems: 'center',
  },

  numero: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.goldText,
  },

  resumenLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 5,
  },

  actualizar: {
    alignSelf: 'flex-end',
    padding: 10,
    marginBottom: 12,
  },

  actualizarTexto: {
    color: COLORS.goldText,
    fontWeight: 'bold',
  },

  loading: {
    marginVertical: 35,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },

  cardTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: COLORS.text,
  },

  codigo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.goldText,
    marginTop: 10,
  },

  fecha: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    marginBottom: 12,
  },

  estado: {
    padding: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },

  pendiente: {
    backgroundColor: COLORS.goldSoft,
  },

  sincronizado: {
    backgroundColor: COLORS.successBg,
  },

  estadoTexto: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.goldText,
  },

  detalles: {
    gap: 8,
    borderTopWidth: 1,
    borderColor: COLORS.goldSoft,
    paddingTop: 14,
  },

  detalle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },

  observaciones: {
    marginTop: 15,
  },

  observacionesTitulo: {
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 7,
  },

  emptyTitle: {
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },

  error: {
    color: COLORS.danger,
  },

  footer: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 25,
    lineHeight: 19,
  },

});
