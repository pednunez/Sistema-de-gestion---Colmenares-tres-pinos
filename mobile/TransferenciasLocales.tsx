import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  listarTransferenciasPreparadas,
} from './database/inspeccionesAvanzadas';

import {
  leerSesionGuardada,
} from './api/auth';

import {
  listarTransferencias,
} from './api/transferencias';

import type {
  TransferenciaMarco,
} from './api/transferencias';

// ==========================================
// COLMENARES TRES PINOS
// MODULO MOBILE: TRANSFERENCIAS
// ==========================================

type TransferenciaLocal =
  Awaited<
    ReturnType<typeof listarTransferenciasPreparadas>
  >[number];

type Filtro =
  | 'TODAS'
  | 'PENDIENTES'
  | 'REGISTRADAS';

type Props = {
  onEscanear: () => void;
};

type TransferenciaVista = {
  id: string;
  origen: string;
  destino: string;
  ubicacion: string | null;
  numero: number | null;
  contenido: string | null;
  cantidad: number;
  estado: string;
  fecha: string | null;
  fuente: 'LOCAL' | 'SERVIDOR';
};

// ==========================================
// FORMATO DE DATOS
// ==========================================

function nombreUbicacion(
  ubicacion: string | null
): string {

  if (ubicacion === 'CAMARA_CRIA') {
    return 'Cámara de cría';
  }

  if (ubicacion === 'ALZA') {
    return 'Alza';
  }

  return ubicacion ?? 'No especificada';
}

// ==========================================
// CONTENIDO DE MARCOS
// ==========================================

function nombreContenido(
  contenido: string | null
): string {

  const nombres: Record<string, string> = {

    MIEL_Y_CRIA: 'Miel y cría',
    SOLO_CRIA: 'Solo cría',
    SOLO_MIEL: 'Solo miel',

    CERA_ESTIRADA: 'Cera estirada',
    CERA_ESTAMPADA: 'Cera estampada',
    CERA_UNTADA: 'Cera untada',

    SIN_MARCO: 'Sin marco',

    CRIA: 'Cría',
    MIEL: 'Miel',
    POLEN: 'Polen',
    VACIO: 'Vacío',
    OTRO: 'Otro',
  };

  if (!contenido) {
    return 'No especificado';
  }

  return nombres[contenido] ?? contenido;
}

// ==========================================
// ESTADOS
// ==========================================

function nombreEstado(estado: string): string {

  if (estado === 'REGISTRADA') {
    return 'Registrada';
  }

  if (estado === 'PENDIENTE') {
    return 'Pendiente de sincronización';
  }

  if (estado === 'ERROR') {
    return 'Error de sincronización';
  }

  return estado.replace(/_/g, ' ');
}

function formatearFecha(
  fecha: string | null
): string {

  if (!fecha) {
    return 'Fecha local no disponible';
  }

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

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function TransferenciasLocales({
  onEscanear,
}: Props) {

  const [locales, setLocales] =
    useState<TransferenciaLocal[]>([]);

  const [servidor, setServidor] =
    useState<TransferenciaMarco[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState('');

  const [filtro, setFiltro] =
    useState<Filtro>('TODAS');

  // ========================================
  // CARGAR TRANSFERENCIAS
  // ========================================

  const cargarTransferencias = useCallback(
    async () => {

      setCargando(true);
      setError('');

      const errores: string[] = [];

      // ------------------------------------
      // 1. CONSULTAR MOVIMIENTOS LOCALES
      // ------------------------------------

      try {

        const resultado =
          await listarTransferenciasPreparadas();

        // Mostrar solamente las que todavía
        // no han sido sincronizadas.
        setLocales(
          resultado.filter(
            item =>
              item.estado.toUpperCase() !==
              'SINCRONIZADO'
          )
        );

      } catch (e) {

        console.error(
          'Error consultando transferencias locales:',
          e
        );

        errores.push(
          'No se pudieron consultar los movimientos locales.'
        );

      }

      // ------------------------------------
      // 2. CONSULTAR SESION
      // ------------------------------------

      try {

        const sesion =
          await leerSesionGuardada();

        if (!sesion) {
          throw new Error(
            'No existe una sesión activa.'
          );
        }

        // ----------------------------------
        // 3. CONSULTAR FASTAPI
        // ----------------------------------

        const resultado =
          await listarTransferencias(sesion);

        setServidor(resultado);

      } catch (e) {

        console.error(
          'Error consultando transferencias del servidor:',
          e
        );

        errores.push(
          e instanceof Error
            ? e.message
            : 'No fue posible consultar FastAPI.'
        );

      }

      setError(errores.join('\n'));

      setCargando(false);

    },
    []
  );

  // ========================================
  // INICIALIZAR
  // ========================================

  useEffect(() => {

    void cargarTransferencias();

  }, [cargarTransferencias]);

  // ========================================
  // CONVERTIR MOVIMIENTOS LOCALES
  // ========================================

  const transferenciasLocales =
    useMemo<TransferenciaVista[]>(() => {

      return locales.map((item, index) => ({

        id:
          `LOCAL-${item.inspeccion_local_id}-${item.ubicacion}-${item.numero}-${index}`,

        origen: item.origen,

        destino: item.destino,

        ubicacion: item.ubicacion,

        numero: item.numero,

        contenido: item.contenido,

        cantidad: 1,

        estado: item.estado,

        fecha: null,

        fuente: 'LOCAL',

      }));

    }, [locales]);

  // ========================================
  // CONVERTIR MOVIMIENTOS DEL SERVIDOR
  // ========================================

  const transferenciasServidor =
    useMemo<TransferenciaVista[]>(() => {

      return servidor.map(item => ({

        id: `SERVIDOR-${item.id}`,

        origen:
          `Colmena #${item.colmena_origen_id}`,

        destino:
          `Colmena #${item.colmena_destino_id}`,

        ubicacion: item.ubicacion,

        numero: item.numero_marco,

        contenido:
          item.contenido ?? item.tipo_marco,

        cantidad: item.cantidad_marcos,

        estado: 'REGISTRADA',

        fecha:
          item.fecha_transferencia ??
          item.fecha_creacion,

        fuente: 'SERVIDOR',

      }));

    }, [servidor]);

  // ========================================
  // UNIFICAR MOVIMIENTOS
  // ========================================

  const transferencias =
    useMemo<TransferenciaVista[]>(() => {

      return [
        ...transferenciasServidor,
        ...transferenciasLocales,
      ];

    }, [
      transferenciasServidor,
      transferenciasLocales,
    ]);

  // ========================================
  // RESUMEN
  // ========================================

  const pendientes = locales.length;

  const registradas = servidor.length;

  const totalMarcos = useMemo(
    () =>
      transferencias.reduce(
        (total, item) =>
          total + item.cantidad,
        0
      ),
    [transferencias]
  );

  // ========================================
  // FILTROS
  // ========================================

  const filtradas = useMemo(() => {

    if (filtro === 'PENDIENTES') {

      return transferencias.filter(
        item => item.fuente === 'LOCAL'
      );

    }

    if (filtro === 'REGISTRADAS') {

      return transferencias.filter(
        item => item.fuente === 'SERVIDOR'
      );

    }

    return transferencias;

  }, [transferencias, filtro]);

  // ========================================
  // TARJETA DE TRANSFERENCIA
  // ========================================

  const renderTransferencia = (
    item: TransferenciaVista
  ) => {

    const pendiente =
      item.fuente === 'LOCAL';

    return (

      <View
        key={item.id}
        style={styles.tarjeta}
      >

        {/* CABECERA */}

        <View style={styles.tarjetaCabecera}>

          <View style={styles.numeroMarco}>

            <Text style={styles.numeroMarcoTexto}>
              {item.numero ?? `×${item.cantidad}`}
            </Text>

          </View>

          <View style={styles.cabeceraInfo}>

            <Text style={styles.tituloTarjeta}>
              {item.numero !== null
                ? `Marco #${item.numero}`
                : `${item.cantidad} marcos`}
            </Text>

            <Text style={styles.subtitulo}>
              {nombreUbicacion(item.ubicacion)}
            </Text>

          </View>

          <View
            style={[
              styles.estado,
              pendiente
                ? styles.estadoPendiente
                : styles.estadoRegistrada,
            ]}
          >

            <Text
              style={[
                styles.estadoTexto,
                pendiente
                  ? styles.textoPendiente
                  : styles.textoRegistrada,
              ]}
            >
              {nombreEstado(item.estado)}
            </Text>

          </View>

        </View>

        <View style={styles.separador} />

        {/* ORIGEN */}

        <View style={styles.datoFila}>

          <Text style={styles.etiqueta}>
            Colmena de origen
          </Text>

          <Text style={styles.valor}>
            {item.origen}
          </Text>

        </View>

        {/* DESTINO */}

        <View style={styles.datoFila}>

          <Text style={styles.etiqueta}>
            Colmena de destino
          </Text>

          <Text style={styles.destino}>
            {item.destino}
          </Text>

        </View>

        {/* CONTENIDO */}

        <View style={styles.datoFila}>

          <Text style={styles.etiqueta}>
            Contenido del marco
          </Text>

          <Text style={styles.valor}>
            {nombreContenido(item.contenido)}
          </Text>

        </View>

        {/* CANTIDAD */}

        <View style={styles.datoFila}>

          <Text style={styles.etiqueta}>
            Cantidad de marcos
          </Text>

          <Text style={styles.valor}>
            {item.cantidad}
          </Text>

        </View>

        {/* FECHA */}

        {item.fecha !== null && (

          <View style={styles.datoFila}>

            <Text style={styles.etiqueta}>
              Fecha de transferencia
            </Text>

            <Text style={styles.valor}>
              {formatearFecha(item.fecha)}
            </Text>

          </View>

        )}

        {/* FUENTE */}

        <View style={styles.fuenteFila}>

          <Text style={styles.fuenteTexto}>
            {pendiente
              ? 'Guardada en este dispositivo'
              : 'Registrada en FastAPI'}
          </Text>

        </View>

      </View>

    );

  };

  // ========================================
  // PANTALLA
  // ========================================

  return (

    <ScrollView
      style={styles.contenedor}
      contentContainerStyle={styles.contenido}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={cargando}
          onRefresh={() => {
            void cargarTransferencias();
          }}
          tintColor="#276749"
        />
      }
    >

      {/* ENCABEZADO */}

      <View style={styles.encabezado}>

        <Text style={styles.titulo}>
          Transferencias
        </Text>

        <Text style={styles.descripcion}>
          Consulta y controla los movimientos
          de marcos entre colmenas.
        </Text>

      </View>

      {/* RESUMEN */}

      <View style={styles.resumen}>

        <View style={styles.resumenItem}>

          <Text style={styles.resumenNumero}>
            {transferencias.length}
          </Text>

          <Text style={styles.resumenEtiqueta}>
            Movimientos
          </Text>

        </View>

        <View style={styles.divisorResumen} />

        <View style={styles.resumenItem}>

          <Text
            style={[
              styles.resumenNumero,
              { color: '#B7791F' },
            ]}
          >
            {pendientes}
          </Text>

          <Text style={styles.resumenEtiqueta}>
            Pendientes
          </Text>

        </View>

        <View style={styles.divisorResumen} />

        <View style={styles.resumenItem}>

          <Text
            style={[
              styles.resumenNumero,
              { color: '#276749' },
            ]}
          >
            {registradas}
          </Text>

          <Text style={styles.resumenEtiqueta}>
            Registradas
          </Text>

        </View>

      </View>

      {/* TOTAL DE MARCOS */}

      <View style={styles.totalMarcos}>

        <Text style={styles.totalMarcosEtiqueta}>
          Total de marcos involucrados
        </Text>

        <Text style={styles.totalMarcosNumero}>
          {totalMarcos}
        </Text>

      </View>

      {/* NUEVA TRANSFERENCIA */}

      <Pressable
        style={({ pressed }) => [
          styles.botonNueva,
          pressed && styles.botonPresionado,
        ]}
        onPress={onEscanear}
      >

        <Text style={styles.botonNuevaTexto}>
          + Registrar transferencia
        </Text>

        <Text style={styles.botonNuevaDescripcion}>
          Identifica la colmena de origen mediante su código QR.
        </Text>

      </Pressable>

      {/* HISTORIAL */}

      <Text style={styles.tituloSeccion}>
        Historial de movimientos
      </Text>

      {/* FILTROS */}

      <View style={styles.filtros}>

        {([
          'TODAS',
          'PENDIENTES',
          'REGISTRADAS',
        ] as Filtro[]).map(opcion => (

          <Pressable
            key={opcion}
            onPress={() => setFiltro(opcion)}
            style={[
              styles.filtro,
              filtro === opcion &&
                styles.filtroActivo,
            ]}
          >

            <Text
              style={[
                styles.filtroTexto,
                filtro === opcion &&
                  styles.filtroTextoActivo,
              ]}
            >
              {opcion === 'TODAS'
                ? 'Todas'
                : opcion === 'PENDIENTES'
                  ? 'Pendientes'
                  : 'Registradas'}
            </Text>

          </Pressable>

        ))}

      </View>

      {/* CARGANDO */}

      {cargando && transferencias.length === 0 && (

        <View style={styles.centrado}>

          <ActivityIndicator
            size="large"
            color="#276749"
          />

          <Text style={styles.mensaje}>
            Consultando transferencias...
          </Text>

        </View>

      )}

      {/* AVISO DE CONEXION */}

      {!cargando && error !== '' && (

        <View style={styles.errorCaja}>

          <Text style={styles.errorTitulo}>
            Aviso de actualización
          </Text>

          <Text style={styles.errorTexto}>
            {error}
          </Text>

          <Pressable
            onPress={() => {
              void cargarTransferencias();
            }}
            style={styles.botonReintentar}
          >

            <Text style={styles.botonReintentarTexto}>
              Reintentar
            </Text>

          </Pressable>

        </View>

      )}

      {/* LISTADO */}

      {filtradas.length > 0 && (

        <View style={styles.lista}>

          {filtradas.map(renderTransferencia)}

        </View>

      )}

      {/* SIN RESULTADOS */}

      {!cargando &&
        filtradas.length === 0 && (

        <View style={styles.vacio}>

          <Text style={styles.vacioIcono}>
            ⇄
          </Text>

          <Text style={styles.vacioTitulo}>
            {filtro === 'PENDIENTES'
              ? 'No hay transferencias pendientes'
              : filtro === 'REGISTRADAS'
                ? 'No hay transferencias registradas'
                : 'Todavía no hay transferencias'}
          </Text>

          <Text style={styles.vacioTexto}>
            Los movimientos aparecerán aquí
            cuando se registren desde la aplicación.
          </Text>

        </View>

      )}

    </ScrollView>

  );

}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  contenedor: {
    flex: 1,
    backgroundColor: '#F5F7F4',
  },

  contenido: {
    padding: 18,
    paddingBottom: 35,
  },

  encabezado: {
    marginBottom: 20,
  },

  titulo: {
    fontSize: 26,
    fontWeight: '800',
    color: '#183D2B',
  },

  descripcion: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 21,
  },

  resumen: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 2,
  },

  resumenItem: {
    flex: 1,
    alignItems: 'center',
  },

  resumenNumero: {
    fontSize: 25,
    fontWeight: '800',
    color: '#183D2B',
  },

  resumenEtiqueta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 5,
    textAlign: 'center',
  },

  divisorResumen: {
    width: 1,
    height: 38,
    backgroundColor: '#E2E8F0',
  },

  totalMarcos: {
    backgroundColor: '#E7F3E9',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  totalMarcosEtiqueta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#276749',
  },

  totalMarcosNumero: {
    fontSize: 21,
    fontWeight: '800',
    color: '#183D2B',
  },

  botonNueva: {
    backgroundColor: '#276749',
    borderRadius: 13,
    padding: 17,
    marginBottom: 25,
  },

  botonPresionado: {
    opacity: 0.8,
  },

  botonNuevaTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  botonNuevaDescripcion: {
    color: '#E2F4E9',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },

  tituloSeccion: {
    fontSize: 19,
    fontWeight: '800',
    color: '#183D2B',
    marginBottom: 13,
  },

  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },

  filtro: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D6DED7',
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  filtroActivo: {
    backgroundColor: '#276749',
    borderColor: '#276749',
  },

  filtroTexto: {
    fontSize: 12,
    fontWeight: '600',
    color: '#526357',
  },

  filtroTextoActivo: {
    color: '#FFFFFF',
  },

  lista: {
    gap: 13,
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E5EAE5',
    elevation: 1,
  },

  tarjetaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  numeroMarco: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E7F3E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  numeroMarcoTexto: {
    fontSize: 15,
    fontWeight: '800',
    color: '#276749',
  },

  cabeceraInfo: {
    flex: 1,
    marginLeft: 11,
  },

  tituloTarjeta: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },

  subtitulo: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },

  estado: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
    maxWidth: 125,
  },

  estadoPendiente: {
    backgroundColor: '#FEF3C7',
  },

  estadoRegistrada: {
    backgroundColor: '#D1FAE5',
  },

  estadoTexto: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },

  textoPendiente: {
    color: '#92400E',
  },

  textoRegistrada: {
    color: '#065F46',
  },

  separador: {
    height: 1,
    backgroundColor: '#EDF0ED',
    marginVertical: 13,
  },

  datoFila: {
    marginBottom: 10,
  },

  etiqueta: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },

  valor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },

  destino: {
    fontSize: 13,
    fontWeight: '800',
    color: '#276749',
  },

  fuenteFila: {
    borderTopWidth: 1,
    borderTopColor: '#EDF0ED',
    paddingTop: 10,
    marginTop: 2,
  },

  fuenteTexto: {
    fontSize: 10,
    color: '#64748B',
  },

  centrado: {
    alignItems: 'center',
    padding: 35,
  },

  mensaje: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },

  errorCaja: {
    padding: 18,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    marginBottom: 15,
  },

  errorTitulo: {
    fontWeight: '800',
    color: '#991B1B',
    fontSize: 14,
  },

  errorTexto: {
    color: '#7F1D1D',
    fontSize: 12,
    marginTop: 7,
    lineHeight: 19,
  },

  botonReintentar: {
    alignSelf: 'flex-start',
    backgroundColor: '#991B1B',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 12,
  },

  botonReintentarTexto: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  vacio: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    marginTop: 5,
  },

  vacioIcono: {
    fontSize: 38,
    color: '#276749',
    marginBottom: 12,
  },

  vacioTitulo: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },

  vacioTexto: {
    fontSize: 12,
    lineHeight: 19,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },

});