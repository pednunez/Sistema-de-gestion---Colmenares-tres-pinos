
import React, {
  useEffect,
  useState,
} from 'react';

import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  listarInspeccionesLocales,
} from './database/inspecciones';

import {
  useConexion,
} from './sincronizacion/conectividad';

import {
  solicitarAPI,
} from './api/cliente';

// ==========================================
// COLMENARES TRES PINOS
// MENÚ PRINCIPAL MÓVIL
// ==========================================

type Props = {
  onEscanear: () => void;
  onInspecciones: () => void;
  onColmenas: () => void;
  onTratamientos: () => void;
  onRevisiones: () => void;
};

type Accion =
  | 'colmenas'
  | 'inspecciones'
  | 'tratamientos'
  | 'revisiones'
  | 'qr';

type Modulo = {
  nombre: string;
  detalle: string;
  icono: string;
  accion?: Accion;
};

type EstadoServidor =
  | 'SIN_COMPROBAR'
  | 'COMPROBANDO'
  | 'DISPONIBLE'
  | 'NO_DISPONIBLE';

type RespuestaHealth = {
  status: string;
};

// ==========================================
// MÓDULOS DE OPERACIÓN
// ==========================================

const OPERACION: Modulo[] = [
  {
    nombre: 'Colmenas',
    detalle: 'Consulta de colmenas locales',
    icono: '🐝',
    accion: 'colmenas',
  },
  {
    nombre: 'Inspecciones',
    detalle: 'Historial guardado en el teléfono',
    icono: '📋',
    accion: 'inspecciones',
  },
  {
    nombre: 'Tratamientos',
    detalle: 'Registro sanitario local SQLite',
    icono: '💊',
    accion: 'tratamientos',
  },
  {
    nombre: 'Revisiones por grupo',
    detalle: 'Recorrido y progreso de colmenas',
    icono: '🗂️',
    accion: 'revisiones',
  },
  {
    nombre: 'Transferencias',
    detalle: 'Por desarrollar',
    icono: '🔄',
  },
  {
    nombre: 'Stock',
    detalle: 'Por desarrollar',
    icono: '📦',
  },
  {
    nombre: 'Códigos QR',
    detalle: 'Escáner de colmenas',
    icono: '▦',
    accion: 'qr',
  },
];

// ==========================================
// MÓDULOS DE ADMINISTRACIÓN
// ==========================================

const ADMINISTRACION: Modulo[] = [
  {
    nombre: 'Dashboard',
    detalle: 'Solo ADMIN. Pendiente',
    icono: '📊',
  },
  {
    nombre: 'Apiarios',
    detalle: 'Solo ADMIN. Pendiente',
    icono: '📍',
  },
  {
    nombre: 'Auditoría',
    detalle: 'Solo ADMIN. Pendiente',
    icono: '🛡️',
  },
  {
    nombre: 'Usuarios',
    detalle: 'Solo ADMIN. Pendiente',
    icono: '👥',
  },
];

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function InicioModulos({
  onEscanear,
  onInspecciones,
  onColmenas,
  onTratamientos,
  onRevisiones,
}: Props) {

  // ========================================
  // ESTADÍSTICAS LOCALES
  // ========================================

  const [total, setTotal] =
    useState<number | null>(null);

  const [pendientes, setPendientes] =
    useState<number | null>(null);

  const [error, setError] =
    useState(false);

  // ========================================
  // CONECTIVIDAD DEL TELÉFONO
  // ========================================

  const conexion = useConexion();

  const conInternet =
    conexion === 'CON_INTERNET';

  const sinInternet =
    conexion === 'SIN_INTERNET';

  // ========================================
  // COMPROBACIÓN DE FASTAPI
  // ========================================

  const [
    estadoServidor,
    setEstadoServidor,
  ] = useState<EstadoServidor>(
    'SIN_COMPROBAR'
  );

  const [
    reintentoServidor,
    setReintentoServidor,
  ] = useState(0);

  useEffect(() => {
    let activo = true;

    // No consultar el servidor si
    // el teléfono no tiene internet.
    if (conexion !== 'CON_INTERNET') {
      setEstadoServidor('SIN_COMPROBAR');
      return;
    }

    setEstadoServidor('COMPROBANDO');

    // Ruta pública de FastAPI.
    // No requiere login.
    void solicitarAPI<RespuestaHealth>(
      '/health',
      {
        method: 'GET',
      }
    )
      .then(respuesta => {
        if (!activo) return;

        if (respuesta.status === 'ok') {
          setEstadoServidor('DISPONIBLE');
        } else {
          setEstadoServidor('NO_DISPONIBLE');
        }
      })
      .catch(e => {
        if (!activo) return;

        console.warn(
          'FastAPI no disponible:',
          e instanceof Error
            ? e.message
            : 'Error de conexión'
        );

        setEstadoServidor('NO_DISPONIBLE');
      });

    return () => {
      activo = false;
    };
  }, [conexion, reintentoServidor]);

  // ========================================
  // CARGAR ESTADÍSTICAS DESDE SQLITE
  // ========================================

  useEffect(() => {
    let activo = true;

    listarInspeccionesLocales()
      .then(items => {
        if (!activo) return;

        setTotal(items.length);

        setPendientes(
          items.filter(
            item =>
              item.estado !== 'SINCRONIZADO'
          ).length
        );

        setError(false);
      })
      .catch(e => {
        console.error(
          'Error consultando SQLite:',
          e
        );

        if (activo) {
          setError(true);
        }
      });

    return () => {
      activo = false;
    };
  }, []);

  // ========================================
  // ESTADO DE INTERNET
  // ========================================

  const textoConexion = conInternet
    ? '🟢 Con internet'
    : sinInternet
      ? '🟠 Sin internet'
      : '⏳ Comprobando conexión';

  const detalleConexion = conInternet
    ? 'El teléfono detecta acceso a internet.'
    : sinInternet
      ? 'Los registros guardados en SQLite se conservan.'
      : 'Verificando la conectividad del teléfono.';

  // ========================================
  // ESTADO DEL SERVIDOR
  // ========================================

  const textoServidor =
    estadoServidor === 'DISPONIBLE'
      ? '🟢 FastAPI disponible'
      : estadoServidor === 'COMPROBANDO'
        ? '⏳ Comprobando FastAPI'
        : estadoServidor === 'NO_DISPONIBLE'
          ? '🔴 FastAPI no disponible'
          : '⚪ FastAPI sin comprobar';

  const detalleServidor =
    estadoServidor === 'DISPONIBLE'
      ? (
        'El servidor respondió correctamente. ' +
        'Esto no confirma todavía el login ni la sincronización.'
      )
      : estadoServidor === 'COMPROBANDO'
        ? 'Consultando la ruta /health del servidor.'
        : estadoServidor === 'NO_DISPONIBLE'
          ? (
            'El teléfono tiene internet, pero la API configurada ' +
            'no respondió correctamente. Revisa la dirección y el servidor.'
          )
          : sinInternet
            ? 'Se comprobará cuando vuelva el acceso a internet.'
            : 'Esperando conexión para comprobar el servidor.';

  // ========================================
  // NAVEGACIÓN ENTRE MÓDULOS
  // ========================================

  const ejecutar = (
    accion?: Accion
  ) => {
    switch (accion) {

      case 'colmenas':
        onColmenas();
        break;

      case 'inspecciones':
        onInspecciones();
        break;

      case 'tratamientos':
        onTratamientos();
        break;

      case 'revisiones':
        onRevisiones();
        break;

      case 'qr':
        onEscanear();
        break;

      default:
        break;
    }
  };

  // ========================================
  // TARJETAS DE MÓDULOS
  // ========================================

  const renderModulo = (
    item: Modulo
  ) => {

    const contenido = (
      <>
        <Text style={styles.moduloIcono}>
          {item.icono}
        </Text>

        <View style={styles.moduloContenido}>
          <Text style={styles.moduloNombre}>
            {item.nombre}
          </Text>

          <Text style={styles.moduloDetalle}>
            {item.detalle}
          </Text>
        </View>

        <View
          style={[
            styles.estado,
            item.accion
              ? styles.estadoLocal
              : styles.estadoPendiente,
          ]}
        >
          <Text
            style={[
              styles.estadoTexto,
              item.accion
                ? styles.estadoTextoLocal
                : styles.estadoTextoPendiente,
            ]}
          >
            {item.accion
              ? 'LOCAL'
              : 'PENDIENTE'}
          </Text>
        </View>
      </>
    );

    if (!item.accion) {
      return (
        <View
          key={item.nombre}
          style={[
            styles.modulo,
            styles.inactivo,
          ]}
        >
          {contenido}
        </View>
      );
    }

    return (
      <Pressable
        key={item.nombre}
        style={styles.modulo}
        onPress={() => ejecutar(item.accion)}
      >
        {contenido}
      </Pressable>
    );
  };

  // ========================================
  // INTERFAZ DEL MENÚ PRINCIPAL
  // ========================================

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
    >
      <StatusBar barStyle="light-content" />

      {/* CABECERA */}

      <View style={styles.cabecera}>

        <View style={styles.marca}>
          <Text style={styles.marcaTexto}>
            CP
          </Text>
        </View>

        <View style={styles.cabeceraTextos}>
          <Text style={styles.cabeceraTitulo}>
            Colmenares Tres Pinos
          </Text>

          <Text style={styles.cabeceraSubtitulo}>
            Sistema de Control de Colmenas
          </Text>
        </View>

      </View>

      {/* TÍTULO */}

      <Text style={styles.titulo}>
        Módulo móvil
      </Text>

      <Text style={styles.introduccion}>
        Registro de terreno con almacenamiento
        SQLite. La sincronización automática con
        FastAPI todavía no está habilitada.
      </Text>

      {/* CONECTIVIDAD */}

      <View
        style={[
          styles.conexion,
          conInternet
            ? styles.conexionOnline
            : sinInternet
              ? styles.conexionOffline
              : styles.conexionVerificando,
        ]}
      >
        <Text style={styles.conexionTitulo}>
          {textoConexion}
        </Text>

        <Text style={styles.conexionDetalle}>
          {detalleConexion}
        </Text>
      </View>

      {/* SERVIDOR FASTAPI */}

      <View
        style={[
          styles.conexion,
          estadoServidor === 'DISPONIBLE'
            ? styles.conexionOnline
            : estadoServidor === 'NO_DISPONIBLE'
              ? styles.conexionError
              : styles.conexionVerificando,
        ]}
      >
        <Text style={styles.conexionTitulo}>
          {textoServidor}
        </Text>

        <Text style={styles.conexionDetalle}>
          {detalleServidor}
        </Text>

        <Pressable
          style={[
            styles.botonRevisar,
            (
              !conInternet ||
              estadoServidor === 'COMPROBANDO'
            ) && styles.deshabilitado,
          ]}
          disabled={
            !conInternet ||
            estadoServidor === 'COMPROBANDO'
          }
          onPress={() =>
            setReintentoServidor(
              actual => actual + 1
            )
          }
        >
          <Text style={styles.textoRevisar}>
            Comprobar servidor
          </Text>
        </Pressable>
      </View>

      {/* ESTADÍSTICAS SQLITE */}

      <View style={styles.estadisticas}>

        <View style={styles.estadistica}>
          <Text style={styles.cifra}>
            {error ? '!' : total ?? '…'}
          </Text>

          <Text style={styles.etiqueta}>
            Inspecciones locales
          </Text>
        </View>

        <View style={styles.linea} />

        <View style={styles.estadistica}>
          <Text style={styles.cifra}>
            {error ? '!' : pendientes ?? '…'}
          </Text>

          <Text style={styles.etiqueta}>
            Pendientes de envío
          </Text>
        </View>

      </View>

      {error && (
        <Text style={styles.error}>
          No fue posible cargar el resumen local.
        </Text>
      )}

      {/* ACCIONES DE TERRENO */}

      <Text style={styles.seccion}>
        Acciones de terreno
      </Text>

      <Pressable
        style={styles.botonPrincipal}
        onPress={onEscanear}
      >
        <Text style={styles.botonPrincipalTexto}>
          ▦ Escanear código QR
        </Text>
      </Pressable>

      <Pressable
        style={styles.botonSecundario}
        onPress={onInspecciones}
      >
        <Text style={styles.botonSecundarioTexto}>
          Ver mis inspecciones
        </Text>
      </Pressable>

      {/* MÓDULOS DE OPERACIÓN */}

      <Text style={styles.seccion}>
        Operación
      </Text>

      {OPERACION.map(renderModulo)}

      {/* ADMINISTRACIÓN */}

      <Text style={styles.seccion}>
        Administración
      </Text>

      <Text style={styles.nota}>
        Estos módulos requieren permisos
        de administrador y todavía no
        están habilitados en la app móvil.
      </Text>

      {ADMINISTRACION.map(renderModulo)}

      {/* PIE */}

      <Text style={styles.pie}>
        Prototipo móvil · Expo + SQLite
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
    backgroundColor: '#F8FAFC',
  },

  contenido: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },

  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -18,
    paddingHorizontal: 20,
    paddingTop: 68,
    paddingBottom: 22,
    backgroundColor: '#0F172A',
  },

  marca: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },

  marcaTexto: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
  },

  cabeceraTextos: {
    flex: 1,
    marginLeft: 12,
  },

  cabeceraTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  cabeceraSubtitulo: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 3,
  },

  titulo: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 26,
    marginTop: 25,
  },

  introduccion: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  // CONECTIVIDAD

  conexion: {
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14,
  },

  conexionOnline: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },

  conexionOffline: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },

  conexionError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },

  conexionVerificando: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },

  conexionTitulo: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },

  conexionDetalle: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },

  botonRevisar: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderRadius: 9,
    marginTop: 12,
  },

  textoRevisar: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  deshabilitado: {
    opacity: 0.45,
  },

  // ESTADÍSTICAS

  estadisticas: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    flexDirection: 'row',
    paddingVertical: 18,
    marginTop: 20,
  },

  estadistica: {
    flex: 1,
    alignItems: 'center',
  },

  cifra: {
    color: '#92400E',
    fontSize: 30,
    fontWeight: '800',
  },

  etiqueta: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3,
  },

  linea: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },

  seccion: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },

  botonPrincipal: {
    backgroundColor: '#D99A24',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 10,
  },

  botonPrincipalTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
  },

  botonSecundario: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D99A24',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },

  botonSecundarioTexto: {
    color: '#775315',
    fontWeight: '700',
    fontSize: 16,
  },

  // MÓDULOS

  modulo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 9,
  },

  moduloIcono: {
    fontSize: 24,
    marginRight: 12,
  },

  moduloContenido: {
    flex: 1,
  },

  moduloNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  moduloDetalle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },

  estado: {
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 7,
  },

  estadoLocal: {
    backgroundColor: '#FEF3C7',
  },

  estadoPendiente: {
    backgroundColor: '#F1F5F9',
  },

  estadoTexto: {
    fontSize: 10,
    fontWeight: '800',
  },

  estadoTextoLocal: {
    color: '#92400E',
  },

  estadoTextoPendiente: {
    color: '#475569',
  },

  inactivo: {
    opacity: 0.68,
  },

  nota: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },

  pie: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 22,
  },

  error: {
    color: '#B91C1C',
    marginTop: 10,
  },
});
