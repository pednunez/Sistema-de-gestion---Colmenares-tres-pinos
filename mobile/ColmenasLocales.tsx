
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { COLORS } from './theme';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  listarInspeccionesLocales,
} from './database/inspecciones';

import type {
  InspeccionGuardada,
} from './database/inspecciones';

// ==========================================
// PROPIEDADES
// ==========================================

type Props = {
  onVolver: () => void;
  onEscanear: () => void;
  onVerInspecciones: () => void;
};

type Filtro = 'TODAS' | 'PENDIENTES';

type ResumenColmena = {
  codigo: string;
  registros: InspeccionGuardada[];
  pendientes: number;
  ultima: InspeccionGuardada;
};

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

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

function estaPendiente(
  registro: InspeccionGuardada
): boolean {
  return registro.estado !== 'SINCRONIZADO';
}

function textoEstado(
  registro: InspeccionGuardada
): string {
  if (registro.estado === 'SINCRONIZADO') {
    return 'Sincronizada';
  }

  if (registro.estado === 'PENDIENTE') {
    return 'Pendiente de sincronización';
  }

  return registro.estado;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function ColmenasLocales({
  onVolver,
  onEscanear,
  onVerInspecciones,
}: Props) {

  const [registros, setRegistros] = useState<
    InspeccionGuardada[]
  >([]);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODAS');

  const [codigoSeleccionado, setCodigoSeleccionado] =
    useState<string | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // ==========================================
  // CARGAR DATOS DESDE SQLITE
  // ==========================================

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const datos = await listarInspeccionesLocales();
      setRegistros(datos);
    } catch (err) {
      console.error('Error al consultar SQLite:', err);

      setError(
        'No se pudieron consultar los registros locales.'
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  // ==========================================
  // AGRUPAR INSPECCIONES POR COLMENA
  // ==========================================

  const colmenas = useMemo(() => {
    const grupos = new Map<
      string,
      InspeccionGuardada[]
    >();

    for (const registro of registros) {
      const codigo = registro.codigo_qr.trim();

      if (!codigo) continue;

      const existentes = grupos.get(codigo) ?? [];

      existentes.push(registro);
      grupos.set(codigo, existentes);
    }

    const resultados: ResumenColmena[] = [];

    for (const [codigo, inspecciones] of grupos) {

      const ordenadas = [...inspecciones].sort(
        (a, b) => {
          const porFecha = b.fecha_local.localeCompare(
            a.fecha_local
          );

          return porFecha || b.id - a.id;
        }
      );

      resultados.push({
        codigo,
        registros: ordenadas,
        pendientes: ordenadas.filter(estaPendiente).length,
        ultima: ordenadas[0],
      });
    }

    return resultados.sort(
      (a, b) =>
        b.ultima.fecha_local.localeCompare(
          a.ultima.fecha_local
        ) ||
        a.codigo.localeCompare(b.codigo, 'es', {
          numeric: true,
        })
    );

  }, [registros]);

  // ==========================================
  // FILTRAR COLMENAS
  // ==========================================

  const colmenasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    return colmenas.filter((colmena) => {
      const coincide = colmena.codigo
        .toLowerCase()
        .includes(termino);

      const coincideEstado =
        filtro === 'TODAS' ||
        colmena.pendientes > 0;

      return coincide && coincideEstado;
    });
  }, [colmenas, busqueda, filtro]);

  // ==========================================
  // COLMENA SELECCIONADA
  // ==========================================

  const colmenaSeleccionada = colmenas.find(
    item => item.codigo === codigoSeleccionado
  );

  // ==========================================
  // FICHA DE LA COLMENA
  // ==========================================

  if (colmenaSeleccionada) {
    const colmena = colmenaSeleccionada;

    return (
      <ScrollView
        style={styles.pantalla}
        contentContainerStyle={styles.contenido}
      >
        <StatusBar barStyle="dark-content" />

        <Pressable
          style={styles.volver}
          onPress={() => setCodigoSeleccionado(null)}
        >
          <Text style={styles.volverTexto}>
            ‹ Volver a colmenas
          </Text>
        </Pressable>

        <Text style={styles.iconoGrande}>🐝</Text>

        <Text style={styles.tituloCentrado}>
          Información de la colmena
        </Text>

        {/* DATOS PRINCIPALES */}
        <View style={styles.tarjeta}>
          <Text style={styles.etiqueta}>
            Código de colmena
          </Text>

          <Text style={styles.codigoGrande}>
            {colmena.codigo}
          </Text>

          <View style={styles.insignia}>
            <Text style={styles.insigniaTexto}>
              Registro local de prueba
            </Text>
          </View>

          <View style={styles.divisor} />

          <Text style={styles.dato}>
            Inspecciones locales: {colmena.registros.length}
          </Text>

          <Text style={styles.dato}>
            Pendientes de envío: {colmena.pendientes}
          </Text>

          <Text style={styles.dato}>
            Última inspección: {
              formatearFecha(colmena.ultima.fecha_local)
            }
          </Text>
        </View>

        {/* INFORMACIÓN DEL SERVIDOR */}
        <View style={styles.aviso}>
          <Text style={styles.avisoTitulo}>
            Información oficial pendiente
          </Text>

          <Text style={styles.avisoTexto}>
            El apiario, estado operativo, fecha de
            instalación y código QR oficial estarán
            disponibles cuando conectemos FastAPI.
          </Text>
        </View>

        {/* ÚLTIMA INSPECCIÓN */}
        <Text style={styles.seccion}>
          Última inspección local
        </Text>

        <View style={styles.tarjeta}>
          <Text style={styles.dato}>
            Marcos totales: {
              colmena.ultima.marcos_totales
            }
          </Text>

          <Text style={styles.dato}>
            Marcos con cría: {
              colmena.ultima.marcos_cria
            }
          </Text>

          <Text style={styles.dato}>
            Marcos con miel: {
              colmena.ultima.marcos_miel
            }
          </Text>

          <Text style={styles.dato}>
            Estado de la reina: {
              colmena.ultima.reina
            }
          </Text>

          <View style={styles.divisor} />

          <Text style={styles.etiqueta}>
            Observaciones
          </Text>

          <Text style={styles.dato}>
            {colmena.ultima.observaciones.trim() ||
              'Sin observaciones'}
          </Text>
        </View>

        {/* HISTORIAL DE LA COLMENA */}
        <Text style={styles.seccion}>
          Historial de inspecciones
        </Text>

        {colmena.registros.map((registro) => (
          <View
            key={registro.id}
            style={styles.tarjeta}
          >
            <Text style={styles.tarjetaTitulo}>
              Inspección N.º {registro.id}
            </Text>

            <Text style={styles.fecha}>
              {formatearFecha(registro.fecha_local)}
            </Text>

            <View
              style={[
                styles.estado,
                estaPendiente(registro)
                  ? styles.estadoPendiente
                  : styles.estadoSincronizado,
              ]}
            >
              <Text style={styles.estadoTexto}>
                {textoEstado(registro)}
              </Text>
            </View>

            <Text style={styles.dato}>
              Marcos totales: {registro.marcos_totales}
            </Text>

            <Text style={styles.dato}>
              Marcos con cría: {registro.marcos_cria}
            </Text>

            <Text style={styles.dato}>
              Marcos con miel: {registro.marcos_miel}
            </Text>

            <Text style={styles.dato}>
              Reina: {registro.reina}
            </Text>

            {registro.observaciones.trim() !== '' && (
              <>
                <View style={styles.divisor} />

                <Text style={styles.etiqueta}>
                  Observaciones
                </Text>

                <Text style={styles.dato}>
                  {registro.observaciones}
                </Text>
              </>
            )}
          </View>
        ))}

        {/* ACCIONES */}
        <Pressable
          style={styles.botonPrincipal}
          onPress={onEscanear}
        >
          <Text style={styles.botonPrincipalTexto}>
            Escanear QR para inspeccionar
          </Text>
        </Pressable>

        <Pressable
          style={styles.botonSecundario}
          onPress={onVerInspecciones}
        >
          <Text style={styles.botonSecundarioTexto}>
            Ver todas mis inspecciones
          </Text>
        </Pressable>

        <Text style={styles.pie}>
          Datos almacenados localmente en SQLite.
        </Text>
      </ScrollView>
    );
  }

  // ==========================================
  // LISTADO DE COLMENAS
  // ==========================================

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      <Pressable
        style={styles.volver}
        onPress={onVolver}
      >
        <Text style={styles.volverTexto}>
          ‹ Volver al inicio
        </Text>
      </Pressable>

      <Text style={styles.titulo}>
        🐝 Colmenas
      </Text>

      <Text style={styles.subtitulo}>
        Consulta de colmenas identificadas en inspecciones
        guardadas en este dispositivo.
      </Text>

      {/* CONTADORES */}
      <View style={styles.resumen}>
        <View style={styles.resumenItem}>
          <Text style={styles.numero}>
            {colmenas.length}
          </Text>

          <Text style={styles.resumenTexto}>
            Colmenas locales
          </Text>
        </View>

        <View style={styles.resumenItem}>
          <Text style={styles.numero}>
            {registros.length}
          </Text>

          <Text style={styles.resumenTexto}>
            Inspecciones
          </Text>
        </View>
      </View>

      {/* BÚSQUEDA */}
      <Text style={styles.seccion}>
        Buscar colmena
      </Text>

      <TextInput
        style={styles.buscador}
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por código QR"
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
      />

      {/* FILTROS */}
      <View style={styles.filtros}>
        <Pressable
          style={[
            styles.filtro,
            filtro === 'TODAS' && styles.filtroActivo,
          ]}
          onPress={() => setFiltro('TODAS')}
        >
          <Text
            style={[
              styles.filtroTexto,
              filtro === 'TODAS' && styles.filtroTextoActivo,
            ]}
          >
            Todas
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.filtro,
            filtro === 'PENDIENTES' &&
              styles.filtroActivo,
          ]}
          onPress={() => setFiltro('PENDIENTES')}
        >
          <Text
            style={[
              styles.filtroTexto,
              filtro === 'PENDIENTES' &&
                styles.filtroTextoActivo,
            ]}
          >
            Con pendientes
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={styles.actualizar}
        disabled={cargando}
        onPress={() => void cargarDatos()}
      >
        <Text style={styles.actualizarTexto}>
          Actualizar listado
        </Text>
      </Pressable>

      {/* RESULTADOS */}
      {cargando ? (
        <ActivityIndicator
          size="large"
          color={COLORS.gold}
          style={styles.cargando}
        />
      ) : error ? (
        <View style={styles.tarjeta}>
          <Text style={styles.error}>
            {error}
          </Text>
        </View>
      ) : colmenasFiltradas.length === 0 ? (
        <View style={styles.tarjeta}>
          <Text style={styles.tarjetaTitulo}>
            No hay colmenas para mostrar
          </Text>

          <Text style={styles.dato}>
            {busqueda.trim() || filtro === 'PENDIENTES'
              ? 'Prueba cambiando los filtros.'
              : 'Todavía no hay inspecciones locales.'}
          </Text>
        </View>
      ) : (
        colmenasFiltradas.map((colmena) => (
          <View
            key={colmena.codigo}
            style={styles.tarjeta}
          >
            <Text style={styles.tarjetaTitulo}>
              {colmena.codigo}
            </Text>

            <View style={styles.insignia}>
              <Text style={styles.insigniaTexto}>
                {colmena.pendientes} pendientes
              </Text>
            </View>

            <Text style={styles.dato}>
              Inspecciones: {colmena.registros.length}
            </Text>

            <Text style={styles.dato}>
              Último registro: {
                formatearFecha(colmena.ultima.fecha_local)
              }
            </Text>

            <Text style={styles.dato}>
              Marcos en última inspección: {
                colmena.ultima.marcos_totales
              }
            </Text>

            <Pressable
              style={styles.botonFicha}
              onPress={() =>
                setCodigoSeleccionado(colmena.codigo)
              }
            >
              <Text style={styles.botonFichaTexto}>
                Ver ficha de colmena
              </Text>
            </Pressable>
          </View>
        ))
      )}

      <Pressable
        style={styles.botonPrincipal}
        onPress={onEscanear}
      >
        <Text style={styles.botonPrincipalTexto}>
          Escanear código QR
        </Text>
      </Pressable>

      <Text style={styles.pie}>
        Vista local. El inventario oficial de la web
        se incorporará al conectar FastAPI.
      </Text>
    </ScrollView>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: COLORS.backgroundSoft,
  },

  contenido: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 50,
  },

  volver: {
    paddingVertical: 10,
    marginBottom: 15,
  },

  volverTexto: {
    color: COLORS.goldText,
    fontSize: 15,
    fontWeight: '700',
  },

  titulo: {
    color: COLORS.forest,
    fontSize: 28,
    fontWeight: '800',
  },

  tituloCentrado: {
    color: COLORS.forest,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 22,
  },

  iconoGrande: {
    fontSize: 52,
    textAlign: 'center',
    marginBottom: 12,
  },

  subtitulo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginTop: 8,
  },

  resumen: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    padding: 22,
    marginTop: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  resumenItem: {
    flex: 1,
    alignItems: 'center',
  },

  numero: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.goldText,
  },

  resumenTexto: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 5,
    textAlign: 'center',
  },

  seccion: {
    color: COLORS.forest,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 26,
    marginBottom: 13,
  },

  buscador: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    padding: 16,
    color: COLORS.forest,
    fontSize: 15,
  },

  filtros: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },

  filtro: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 10,
  },

  filtroActivo: {
    backgroundColor: COLORS.goldSoft,
    borderColor: COLORS.gold,
  },

  filtroTexto: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },

  filtroTextoActivo: {
    color: COLORS.goldText,
  },

  actualizar: {
    alignSelf: 'flex-end',
    paddingVertical: 15,
  },

  actualizarTexto: {
    color: COLORS.goldText,
    fontWeight: '700',
  },

  cargando: {
    marginTop: 35,
  },

  tarjeta: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 20,
    marginBottom: 15,
  },

  tarjetaTitulo: {
    color: COLORS.forest,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },

  etiqueta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 5,
  },

  codigoGrande: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.forest,
  },

  insignia: {
    backgroundColor: COLORS.goldSoft,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 10,
  },

  insigniaTexto: {
    color: COLORS.goldText,
    fontWeight: '700',
    fontSize: 12,
  },

  dato: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginTop: 6,
  },

  fecha: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
  },

  divisor: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
  },

  aviso: {
    backgroundColor: COLORS.goldSoft,
    borderRadius: 12,
    padding: 16,
    marginTop: 5,
  },

  avisoTitulo: {
    color: COLORS.goldText,
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 7,
  },

  avisoTexto: {
    color: COLORS.goldText,
    fontSize: 13,
    lineHeight: 20,
  },

  estado: {
    alignSelf: 'flex-start',
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 13,
  },

  estadoPendiente: {
    backgroundColor: COLORS.goldSoft,
  },

  estadoSincronizado: {
    backgroundColor: COLORS.successBg,
  },

  estadoTexto: {
    color: COLORS.goldText,
    fontWeight: '700',
    fontSize: 12,
  },

  botonFicha: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 10,
    padding: 14,
    marginTop: 17,
    alignItems: 'center',
  },

  botonFichaTexto: {
    color: COLORS.goldText,
    fontWeight: '700',
    fontSize: 15,
  },

  botonPrincipal: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },

  botonPrincipalTexto: {
    color: COLORS.surface,
    fontWeight: '800',
    fontSize: 16,
  },

  botonSecundario: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 12,
    padding: 17,
    alignItems: 'center',
    marginTop: 12,
  },

  botonSecundarioTexto: {
    color: COLORS.goldText,
    fontWeight: '700',
    fontSize: 15,
  },

  error: {
    color: COLORS.danger,
    fontSize: 14,
  },

  pie: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: 24,
  },
});
