
import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <StatusBar barStyle="dark-content" />

      {/* ENCABEZADO */}
      <Text style={styles.icon}>
        🐝
      </Text>

      <Text style={styles.title}>
        Mis inspecciones
      </Text>

      <Text style={styles.subtitle}>
        Registros guardados en este dispositivo
      </Text>

      {/* RESUMEN */}
      <View style={styles.resumen}>

        <View style={styles.resumenItem}>
          <Text style={styles.numero}>
            {inspecciones.length}
          </Text>

          <Text style={styles.resumenLabel}>
            Total local
          </Text>
        </View>

        <View style={styles.resumenItem}>
          <Text style={styles.numero}>
            {pendientes}
          </Text>

          <Text style={styles.resumenLabel}>
            Pendientes
          </Text>
        </View>

      </View>

      {/* ACTUALIZAR */}
      <Pressable
        style={styles.actualizar}
        onPress={() => void cargarInspecciones()}
        disabled={cargando}
      >
        <Text style={styles.actualizarTexto}>
          Actualizar historial
        </Text>
      </Pressable>

      {/* CARGANDO */}
      {cargando ? (
        <ActivityIndicator
          size="large"
          color="#D99A24"
          style={styles.loading}
        />
      ) : error ? (

        // ERROR DE SQLITE
        <View style={styles.card}>
          <Text style={styles.error}>
            {error}
          </Text>
        </View>

      ) : inspecciones.length === 0 ? (

        // SIN REGISTROS
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>
            Todavía no hay inspecciones
          </Text>

          <Text style={styles.detalle}>
            Escanea una colmena y guarda tu primera
            inspección para verla aquí.
          </Text>
        </View>

      ) : (

        // LISTADO DE INSPECCIONES
        inspecciones.map((item) => {
          const sincronizado =
            item.estado === 'SINCRONIZADO';

          return (
            <View
              key={item.id}
              style={styles.card}
            >

              <Text style={styles.cardTitle}>
                Inspección N.º {item.id}
              </Text>

              <Text style={styles.codigo}>
                {item.codigo_qr}
              </Text>

              <Text style={styles.fecha}>
                {formatearFecha(item.fecha_local)}
              </Text>

              {/* ESTADO DE SINCRONIZACIÓN */}
              <View
                style={[
                  styles.estado,
                  sincronizado
                    ? styles.sincronizado
                    : styles.pendiente,
                ]}
              >
                <Text style={styles.estadoTexto}>
                  {sincronizado
                    ? '✓ Sincronizada'
                    : '◷ Pendiente de sincronización'}
                </Text>
              </View>

              {/* DETALLES */}
              <View style={styles.detalles}>

                <Text style={styles.detalle}>
                  Marcos totales: {item.marcos_totales}
                </Text>

                <Text style={styles.detalle}>
                  Marcos con cría: {item.marcos_cria}
                </Text>

                <Text style={styles.detalle}>
                  Marcos con miel: {item.marcos_miel}
                </Text>

                <Text style={styles.detalle}>
                  Estado de la reina: {item.reina}
                </Text>

              </View>

              {/* OBSERVACIONES */}
              {item.observaciones.trim() !== '' && (
                <View style={styles.observaciones}>

                  <Text style={styles.observacionesTitulo}>
                    Observaciones
                  </Text>

                  <Text style={styles.detalle}>
                    {item.observaciones}
                  </Text>

                </View>
              )}

            </View>
          );
        })
      )}

      {/* VOLVER AL INICIO */}
      <Pressable
        style={styles.botonVolver}
        onPress={onVolver}
      >
        <Text style={styles.textoVolver}>
          Volver al inicio
        </Text>
      </Pressable>

      <Text style={styles.footer}>
        Las inspecciones permanecen guardadas localmente.
        La sincronización con FastAPI todavía está en desarrollo.
      </Text>
    </ScrollView>
  );
}

// ESTILOS
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#FFF9EC',
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 50,
  },

  icon: {
    fontSize: 55,
    textAlign: 'center',
    marginBottom: 12,
  },

  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#3D321B',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 14,
    color: '#766B52',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 25,
  },

  resumen: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
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
    color: '#956513',
  },

  resumenLabel: {
    fontSize: 13,
    color: '#766B52',
    marginTop: 5,
  },

  actualizar: {
    alignSelf: 'flex-end',
    padding: 10,
    marginBottom: 12,
  },

  actualizarTexto: {
    color: '#956513',
    fontWeight: 'bold',
  },

  loading: {
    marginVertical: 35,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },

  cardTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#3D321B',
  },

  codigo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#956513',
    marginTop: 10,
  },

  fecha: {
    fontSize: 13,
    color: '#938972',
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
    backgroundColor: '#FFF0CC',
  },

  sincronizado: {
    backgroundColor: '#DAF4E0',
  },

  estadoTexto: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#775315',
  },

  detalles: {
    gap: 8,
    borderTopWidth: 1,
    borderColor: '#F0E6D3',
    paddingTop: 14,
  },

  detalle: {
    fontSize: 14,
    color: '#594D36',
    lineHeight: 21,
  },

  observaciones: {
    marginTop: 15,
  },

  observacionesTitulo: {
    fontWeight: 'bold',
    color: '#3D321B',
    marginBottom: 7,
  },

  emptyTitle: {
    fontWeight: 'bold',
    color: '#3D321B',
    marginBottom: 8,
  },

  error: {
    color: '#B42318',
  },

  botonVolver: {
    backgroundColor: '#D99A24',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },

  textoVolver: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 17,
  },

  footer: {
    fontSize: 12,
    color: '#938972',
    textAlign: 'center',
    marginTop: 25,
    lineHeight: 19,
  },

});
