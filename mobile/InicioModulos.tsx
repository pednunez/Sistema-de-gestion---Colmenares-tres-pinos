import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  listarInspeccionesLocales,
} from './database/inspecciones';

import {
  leerCatalogoLocal,
  descargarCatalogo,
} from './database/catalogo';

import {
  leerSesionGuardada,
} from './api/auth';

import {
  useConexion,
} from './sincronizacion/conectividad';

import {
  solicitarAPI,
} from './api/cliente';

// ==========================================
// COLMENARES TRES PINOS
// DASHBOARD MOBILE RESPONSIVE
// FUNCIONALIDADES EQUIVALENTES A LA WEB
// ==========================================

type Catalogo = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

type ColmenaCatalogo =
  Catalogo['colmenas'][number];

type ApiarioCatalogo =
  Catalogo['apiarios'][number];

type InspeccionDashboard = {
  id?: number;
  colmena_id: number;
  fecha_inspeccion: string;
  estado_general?: string | null;
  signos_enfermedad?: boolean | number | string | null;
  enfermedad_observada?: string | null;
  estado?: string;
};

type Prioridad = 'alta' | 'media';

type AlertaDashboard = {
  colmena: ColmenaCatalogo;
  prioridad: Prioridad;
  motivos: string[];
  ultima?: InspeccionDashboard;
};

type Props = {
  onEscanear: () => void;
  onInspecciones: () => void;
  onColmenas: () => void;
  onTratamientos: () => void;
  onRevisiones: () => void;
};

type EstadoServidor =
  | 'SIN_COMPROBAR'
  | 'COMPROBANDO'
  | 'DISPONIBLE'
  | 'NO_DISPONIBLE';

type RespuestaHealth = {
  status: string;
};

type ClaveDistribucion =
  | 'COMPLETA'
  | 'EN_DESARROLLO'
  | 'DONANTE'
  | 'DEBIL'
  | 'REQUIERE_REVISION'
  | 'ANTERIOR'
  | 'SIN';

// ==========================================
// CONFIGURACIÓN DEL DASHBOARD
// ==========================================

const DIAS_SIN_INSPECCION = 30;

const ESTADOS_ACTUALES = [
  'COMPLETA',
  'EN_DESARROLLO',
  'DONANTE',
  'DEBIL',
  'REQUIERE_REVISION',
];

const DISTRIBUCION: {
  clave: ClaveDistribucion;
  texto: string;
  color: string;
  soloSiHay?: boolean;
}[] = [
  {
    clave: 'COMPLETA',
    texto: 'Completa',
    color: '#10B981',
  },
  {
    clave: 'EN_DESARROLLO',
    texto: 'En desarrollo',
    color: '#0EA5E9',
  },
  {
    clave: 'DONANTE',
    texto: 'Donante',
    color: '#14B8A6',
  },
  {
    clave: 'DEBIL',
    texto: 'Débil',
    color: '#FBBF24',
  },
  {
    clave: 'REQUIERE_REVISION',
    texto: 'Requiere revisión',
    color: '#EF4444',
  },
  {
    clave: 'ANTERIOR',
    texto: 'Escala anterior',
    color: '#94A3B8',
    soloSiHay: true,
  },
  {
    clave: 'SIN',
    texto: 'Sin inspección',
    color: '#CBD5E1',
  },
];

// ==========================================
// FUNCIONES DE ALERTAS
// MISMAS REGLAS QUE LA WEB
// ==========================================

function colmenaOperativa(
  colmena: ColmenaCatalogo
): boolean {
  return (
    colmena.estado !== 'INACTIVA' &&
    colmena.estado !== 'BAJA'
  );
}

function obtenerFecha(
  fecha?: string | null
): number {
  if (!fecha) return 0;

  const resultado = Date.parse(fecha);

  return Number.isFinite(resultado)
    ? resultado
    : 0;
}

function diasDesde(
  fecha?: string | null
): number | null {
  if (!fecha) return null;

  const partes = fecha
    .slice(0, 10)
    .split('-')
    .map(Number);

  let fechaInspeccion: Date;

  if (
    partes.length === 3 &&
    partes.every(Number.isFinite)
  ) {
    fechaInspeccion = new Date(
      partes[0],
      partes[1] - 1,
      partes[2]
    );
  } else {
    const fechaParseada = new Date(fecha);

    if (!Number.isFinite(fechaParseada.getTime())) {
      return null;
    }

    fechaInspeccion = new Date(
      fechaParseada.getFullYear(),
      fechaParseada.getMonth(),
      fechaParseada.getDate()
    );
  }

  const hoy = new Date();

  hoy.setHours(0, 0, 0, 0);

  fechaInspeccion.setHours(0, 0, 0, 0);

  return Math.floor(
    (hoy.getTime() - fechaInspeccion.getTime()) /
      86400000
  );
}

// ==========================================
// ÚLTIMA INSPECCIÓN POR COLMENA
// ==========================================

function ultimaInspeccionPorColmena(
  inspecciones: InspeccionDashboard[]
): Map<number, InspeccionDashboard> {

  const ultimas = new Map<
    number,
    InspeccionDashboard
  >();

  for (const inspeccion of inspecciones) {

    const actual = ultimas.get(
      inspeccion.colmena_id
    );

    if (
      !actual ||
      obtenerFecha(inspeccion.fecha_inspeccion) >
        obtenerFecha(actual.fecha_inspeccion)
    ) {
      ultimas.set(
        inspeccion.colmena_id,
        inspeccion
      );
    }
  }

  return ultimas;
}

// ==========================================
// CALCULAR ALERTAS
// ==========================================

function calcularAlertas(
  colmenas: ColmenaCatalogo[],
  inspecciones: InspeccionDashboard[]
): AlertaDashboard[] {

  const ultimas =
    ultimaInspeccionPorColmena(inspecciones);

  const alertas: AlertaDashboard[] = [];

  for (const colmena of colmenas) {

    if (!colmenaOperativa(colmena)) {
      continue;
    }

    const ultima = ultimas.get(colmena.id);

    const motivos: string[] = [];

    let prioridad: Prioridad | null = null;

    // REQUIERE REVISIÓN O CRÍTICO

    if (
      ultima?.estado_general ===
        'REQUIERE_REVISION' ||
      ultima?.estado_general === 'CRITICO'
    ) {

      motivos.push(
        ultima.estado_general === 'CRITICO'
          ? 'Última inspección en estado crítico'
          : 'Última inspección: requiere revisión'
      );

      prioridad = 'alta';
    }

    // SIGNOS DE ENFERMEDAD

    const tieneSignos =
      ultima?.signos_enfermedad === true ||
      ultima?.signos_enfermedad === 1 ||
      ultima?.signos_enfermedad === '1' ||
      ultima?.signos_enfermedad === 'true';

    if (tieneSignos && ultima) {

      motivos.push(
        ultima.enfermedad_observada
          ? `Signos de enfermedad: ${ultima.enfermedad_observada}`
          : 'Signos de enfermedad'
      );

      prioridad = 'alta';
    }

    // ESTADOS DÉBILES O REGULARES

    if (
      ultima?.estado_general === 'DEBIL' ||
      ultima?.estado_general === 'REGULAR'
    ) {

      motivos.push(
        ultima.estado_general === 'REGULAR'
          ? 'Última inspección en estado regular'
          : 'Última inspección: colmena débil'
      );

      prioridad ??= 'media';
    }

    // EN OBSERVACIÓN

    if (colmena.estado === 'EN_OBSERVACION') {

      motivos.push('Marcada en observación');

      prioridad ??= 'media';
    }

    // SIN INSPECCIONES

    if (!ultima) {

      motivos.push('Sin inspecciones registradas');

      prioridad ??= 'media';

    } else {

      const dias = diasDesde(
        ultima.fecha_inspeccion
      );

      if (
        dias !== null &&
        dias > DIAS_SIN_INSPECCION
      ) {

        motivos.push(
          `Sin inspección hace ${dias} días`
        );

        prioridad ??= 'media';
      }
    }

    if (motivos.length > 0 && prioridad) {

      alertas.push({
        colmena,
        prioridad,
        motivos,
        ultima,
      });
    }
  }

  return alertas.sort(
    (a, b) =>
      (a.prioridad === 'alta' ? 0 : 1) -
      (b.prioridad === 'alta' ? 0 : 1)
  );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function InicioModulos(_props: Props) {

  // ========================================
  // RESPONSIVE
  // ========================================

  const { width } = useWindowDimensions();

  const esTablet = width >= 768;

  const [anchoContenedor, setAnchoContenedor] =
    useState(0);

  const anchoDisponible =
    anchoContenedor > 0
      ? anchoContenedor
      : width;

  const paddingHorizontal =
    esTablet ? 28 : 18;

  const anchoBase = Math.min(
    anchoDisponible,
    1280
  );

  const anchoContenido = Math.max(
    anchoBase - paddingHorizontal * 2,
    0
  );

  const anchoEstadistica =
    anchoContenido >= 1100
      ? '23.5%'
      : anchoContenido >= 340
        ? '48.5%'
        : '100%';

  const anchoEstado =
    anchoContenido >= 620
      ? '48.8%'
      : '100%';

  const dashboardEnFila =
    anchoContenido >= 980;

  // ========================================
  // DATOS DEL DASHBOARD
  // ========================================

  const [catalogo, setCatalogo] =
    useState<Catalogo | null>(null);

  const [inspecciones, setInspecciones] =
    useState<InspeccionDashboard[]>([]);

  const [cargandoDashboard, setCargandoDashboard] =
    useState(true);

  const [errorInspecciones, setErrorInspecciones] =
    useState(false);

  const [avisoCatalogo, setAvisoCatalogo] =
    useState('');

  const [versionDatos, setVersionDatos] =
    useState(0);

  // ========================================
  // CONECTIVIDAD
  // ========================================

  const conexion = useConexion();

  const conInternet =
    conexion === 'CON_INTERNET';

  const sinInternet =
    conexion === 'SIN_INTERNET';

  // ========================================
  // CARGAR CATÁLOGO E INSPECCIONES
  // ========================================

  useEffect(() => {

    let activo = true;

    const cargarDatos = async () => {

      setCargandoDashboard(true);

      let inspeccionesLocales:
        InspeccionDashboard[] = [];

      let errorLocal = false;

      let catalogoLocal: Catalogo | null = null;

      let aviso = '';

      // LEER INSPECCIONES SQLITE

      try {

        const items =
          await listarInspeccionesLocales();

        inspeccionesLocales =
          items as unknown as InspeccionDashboard[];

      } catch (error) {

        console.error(
          'Error cargando inspecciones locales:',
          error
        );

        errorLocal = true;
      }

      // RECUPERAR SESIÓN Y CATÁLOGO

      try {

        const sesion =
          await leerSesionGuardada();

        if (!sesion) {

          aviso =
            'No se encontró una sesión para consultar el catálogo.';

        } else {

          // ACTUALIZAR DESDE FASTAPI CUANDO HAY INTERNET

          let descargaCorrecta = false;

          if (conInternet) {

            try {

              await descargarCatalogo(sesion);

              descargaCorrecta = true;

            } catch (error) {

              console.warn(
                'No se pudo actualizar el catálogo:',
                error
              );
            }
          }

          // LEER SQLITE

          catalogoLocal =
            await leerCatalogoLocal(
              sesion.usuario.id
            );

          if (!catalogoLocal) {

            aviso =
              'No hay un catálogo oficial descargado para este dispositivo.';

          } else if (
            conInternet &&
            !descargaCorrecta
          ) {

            aviso =
              'No se pudo actualizar el catálogo. Se utiliza la última versión guardada en SQLite.';

          } else if (sinInternet) {

            aviso =
              'Se está utilizando el catálogo local guardado en el dispositivo.';
          }
        }

      } catch (error) {

        console.error(
          'Error consultando catálogo:',
          error
        );

        aviso =
          'No se pudo consultar el catálogo local.';
      }

      if (!activo) return;

      setInspecciones(inspeccionesLocales);

      setCatalogo(catalogoLocal);

      setErrorInspecciones(errorLocal);

      setAvisoCatalogo(aviso);

      setCargandoDashboard(false);
    };

    void cargarDatos();

    return () => {
      activo = false;
    };

  }, [conexion, versionDatos]);
    // ========================================
  // ESTADÍSTICAS DE INSPECCIONES LOCALES
  // ========================================

  const total = inspecciones.length;

  const pendientes = inspecciones.filter(
    item => item.estado !== 'SINCRONIZADO'
  ).length;

  const sincronizadas = Math.max(
    total - pendientes,
    0
  );

  // ========================================
  // ESTADO FASTAPI
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

  // ========================================
  // COMPROBAR FASTAPI
  // ========================================

  useEffect(() => {

    let activo = true;

    if (!conInternet) {

      setEstadoServidor('SIN_COMPROBAR');

      return () => {
        activo = false;
      };
    }

    setEstadoServidor('COMPROBANDO');

    void solicitarAPI<RespuestaHealth>(
      '/health',
      {
        method: 'GET',
      }
    )
      .then(respuesta => {

        if (!activo) return;

        setEstadoServidor(
          respuesta.status === 'ok'
            ? 'DISPONIBLE'
            : 'NO_DISPONIBLE'
        );
      })
      .catch(error => {

        if (!activo) return;

        console.warn(
          'FastAPI no disponible:',
          error
        );

        setEstadoServidor('NO_DISPONIBLE');
      });

    return () => {
      activo = false;
    };

  }, [conexion, reintentoServidor]);

  // ========================================
  // ACTUALIZAR DASHBOARD
  // ========================================

  const actualizarDashboard = () => {

    setVersionDatos(actual => actual + 1);

    setReintentoServidor(actual => actual + 1);
  };

  // ========================================
  // APIARIOS ORDENADOS
  // ========================================

  const apiariosOrdenados = useMemo(
    () =>
      [...(catalogo?.apiarios ?? [])].sort(
        (a, b) =>
          a.nombre.localeCompare(b.nombre, 'es')
      ),
    [catalogo]
  );

  // "" = todos los apiarios

  const [apiarioId, setApiarioId] =
    useState('');

  const apiarioElegido =
    apiariosOrdenados.find(
      apiario =>
        String(apiario.id) === apiarioId
    ) ?? null;

  // ========================================
  // RESUMEN GENERAL
  // MISMA LÓGICA QUE DASHBOARD WEB
  // ========================================

  const resumen = useMemo(() => {

    const colmenas =
      catalogo?.colmenas ?? [];

    const todasOperativas =
      colmenas.filter(colmenaOperativa);

    const todasAlertas =
      calcularAlertas(
        colmenas,
        inspecciones
      );

    const delApiario = (
      colmena: ColmenaCatalogo
    ) =>
      !apiarioId ||
      String(colmena.apiario_id) === apiarioId;

    const operativas =
      todasOperativas.filter(delApiario);

    const alertas =
      todasAlertas.filter(
        alerta =>
          delApiario(alerta.colmena)
      );

    const ultimas =
      ultimaInspeccionPorColmena(
        inspecciones
      );

    // CONTEO DE ESTADOS

    const conteo: Record<
      ClaveDistribucion,
      number
    > = {
      COMPLETA: 0,
      EN_DESARROLLO: 0,
      DONANTE: 0,
      DEBIL: 0,
      REQUIERE_REVISION: 0,
      ANTERIOR: 0,
      SIN: 0,
    };

    for (const colmena of operativas) {

      const estado =
        ultimas.get(colmena.id)?.estado_general;

      if (!estado) {

        conteo.SIN += 1;

      } else if (
        ESTADOS_ACTUALES.includes(estado)
      ) {

        conteo[estado as ClaveDistribucion] += 1;

      } else {

        // ESCALA ANTERIOR:
        // BUENO, REGULAR, CRÍTICO U OTRO ESTADO.

        conteo.ANTERIOR += 1;
      }
    }

    // RESUMEN POR APIARIO
    // SIEMPRE SE MUESTRAN TODOS.

    const porApiario =
      apiariosOrdenados.map(apiario => {

        const colmenasApiario =
          todasOperativas.filter(
            colmena =>
              colmena.apiario_id === apiario.id
          );

        const alertasApiario =
          todasAlertas.filter(
            alerta =>
              alerta.colmena.apiario_id === apiario.id
          );

        return {
          apiario,
          colmenas: colmenasApiario.length,
          alertas: alertasApiario.length,
        };
      });

    // TRATAMIENTOS EN CURSO

    const idsColmenas = new Set(
      colmenas
        .filter(delApiario)
        .map(colmena => colmena.id)
    );

    const tratamientosEnCurso =
      (
        catalogo?.tratamientos_en_curso ?? []
      ).filter(
        tratamiento =>
          idsColmenas.has(
            tratamiento.colmena_id
          )
      ).length;

    return {
      operativas,
      alertas,
      conteo,
      porApiario,
      tratamientosEnCurso,
    };

  }, [
    catalogo,
    inspecciones,
    apiarioId,
    apiariosOrdenados,
  ]);

  const prioridadAlta =
    resumen.alertas.filter(
      alerta => alerta.prioridad === 'alta'
    ).length;

  // ========================================
  // TEXTOS DE CONECTIVIDAD
  // ========================================

  const textoConexion = conInternet
    ? 'Internet disponible'
    : sinInternet
      ? 'Sin conexión a internet'
      : 'Comprobando conexión';

  const detalleConexion = conInternet
    ? 'El dispositivo detecta acceso a internet.'
    : sinInternet
      ? 'Los registros locales permanecen guardados.'
      : 'Verificando la conectividad del dispositivo.';

  // ========================================
  // TEXTOS FASTAPI
  // ========================================

  const textoServidor =
    estadoServidor === 'DISPONIBLE'
      ? 'FastAPI disponible'
      : estadoServidor === 'COMPROBANDO'
        ? 'Comprobando FastAPI'
        : estadoServidor === 'NO_DISPONIBLE'
          ? 'FastAPI no disponible'
          : 'FastAPI sin comprobar';

  const detalleServidor =
    estadoServidor === 'DISPONIBLE'
      ? 'El servidor respondió correctamente.'
      : estadoServidor === 'COMPROBANDO'
        ? 'Consultando la ruta /health.'
        : estadoServidor === 'NO_DISPONIBLE'
          ? 'La API configurada no respondió. Revisa el servidor.'
          : sinInternet
            ? 'Se comprobará cuando vuelva internet.'
            : 'Esperando conexión para comprobar el servidor.';

  // ========================================
  // INTERFAZ PRINCIPAL
  // ========================================

  return (
    <ScrollView
      style={styles.pantalla}
      onLayout={evento => {

        const nuevoAncho =
          evento.nativeEvent.layout.width;

        setAnchoContenedor(actual =>
          Math.abs(actual - nuevoAncho) > 1
            ? nuevoAncho
            : actual
        );
      }}
      contentContainerStyle={[
        styles.contenido,
        {
          paddingHorizontal,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >

      {/* =================================
          ENCABEZADO
      ================================= */}

      <View style={styles.encabezadoSuperior}>

        <View style={styles.encabezadoTextos}>

          <Text
            style={[
              styles.titulo,
              esTablet && styles.tituloTablet,
            ]}
          >
            Dashboard
          </Text>

          <Text style={styles.introduccion}>
            Colmenares Tres Pinos
          </Text>

        </View>

        <Pressable
          onPress={actualizarDashboard}
          disabled={cargandoDashboard}
          style={({ pressed }) => [
            styles.botonActualizar,
            pressed && styles.elementoPresionado,
            cargandoDashboard && styles.deshabilitado,
          ]}
        >
          {cargandoDashboard
            ? (
              <ActivityIndicator
                size="small"
                color="#92400E"
              />
            )
            : (
              <Text style={styles.botonActualizarTexto}>
                ↻ Actualizar
              </Text>
            )}
        </Pressable>

      </View>

      {/* =================================
          AVISO DEL CATÁLOGO
      ================================= */}

      {Boolean(avisoCatalogo) && (
        <View style={styles.avisoCatalogo}>
          <Text style={styles.avisoCatalogoTexto}>
            {avisoCatalogo}
          </Text>
        </View>
      )}

      {/* =================================
          FILTRO POR APIARIO
      ================================= */}

      <View style={styles.filtroSeccion}>

        <Text style={styles.filtroTitulo}>
          Ver:
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtroLista}
        >

          <Pressable
            onPress={() => setApiarioId('')}
            style={[
              styles.filtroBoton,
              apiarioId === '' &&
                styles.filtroBotonActivo,
            ]}
          >
            <Text
              style={[
                styles.filtroTexto,
                apiarioId === '' &&
                  styles.filtroTextoActivo,
              ]}
            >
              Todos los apiarios
            </Text>
          </Pressable>

          {apiariosOrdenados.map(apiario => {

            const activo =
              apiarioId === String(apiario.id);

            return (
              <Pressable
                key={apiario.id}
                onPress={() =>
                  setApiarioId(String(apiario.id))
                }
                style={[
                  styles.filtroBoton,
                  activo && styles.filtroBotonActivo,
                ]}
              >
                <Text
                  style={[
                    styles.filtroTexto,
                    activo && styles.filtroTextoActivo,
                  ]}
                >
                  {apiario.nombre}
                </Text>
              </Pressable>
            );
          })}

        </ScrollView>
      </View>

      {/* =================================
          INDICADORES PRINCIPALES
      ================================= */}

      <View style={styles.estadisticas}>

        {/* APIARIOS */}

        <View
          style={[
            styles.indicador,
            {
              width: anchoEstadistica,
            },
          ]}
        >

          <View style={styles.indicadorCabecera}>
            <Text style={styles.indicadorEtiqueta}>
              {apiarioElegido
                ? 'Apiario'
                : 'Apiarios'}
            </Text>

            <Text style={styles.indicadorIcono}>
              📍
            </Text>
          </View>

          <Text
            style={[
              styles.indicadorCifra,
              apiarioElegido && styles.indicadorNombre,
            ]}
            numberOfLines={2}
          >
            {catalogo
              ? apiarioElegido?.nombre ??
                catalogo.apiarios.length
              : '—'}
          </Text>

          <Text style={styles.indicadorDetalle}>
            {apiarioElegido
              ? apiarioElegido.ubicacion || 'Sin ubicación'
              : 'Registrados en el sistema'}
          </Text>

        </View>

        {/* COLMENAS OPERATIVAS */}

        <View
          style={[
            styles.indicador,
            {
              width: anchoEstadistica,
            },
          ]}
        >

          <View style={styles.indicadorCabecera}>
            <Text style={styles.indicadorEtiqueta}>
              Colmenas en operación
            </Text>

            <Text style={styles.indicadorIcono}>
              🐝
            </Text>
          </View>

          <Text style={styles.indicadorCifra}>
            {catalogo
              ? resumen.operativas.length
              : '—'}
          </Text>

          <Text style={styles.indicadorDetalle}>
            Colmenas activas
          </Text>

        </View>

        {/* ALERTAS */}

        <View
          style={[
            styles.indicador,
            {
              width: anchoEstadistica,
            },
            prioridadAlta > 0 &&
              styles.indicadorAlerta,
          ]}
        >

          <View style={styles.indicadorCabecera}>
            <Text style={styles.indicadorEtiqueta}>
              Requieren atención
            </Text>

            <Text style={styles.indicadorIcono}>
              ⚠️
            </Text>
          </View>

          <Text
            style={[
              styles.indicadorCifra,
              prioridadAlta > 0 &&
                styles.cifraAlerta,
            ]}
          >
            {catalogo
              ? resumen.alertas.length
              : '—'}
          </Text>

          <Text style={styles.indicadorDetalle}>
            {prioridadAlta > 0
              ? `${prioridadAlta} con prioridad alta`
              : 'Según última inspección'}
          </Text>

        </View>
                {/* TRATAMIENTOS */}

        <View
          style={[
            styles.indicador,
            {
              width: anchoEstadistica,
            },
          ]}
        >

          <View style={styles.indicadorCabecera}>
            <Text style={styles.indicadorEtiqueta}>
              Tratamientos en curso
            </Text>

            <Text style={styles.indicadorIcono}>
              💊
            </Text>
          </View>

          <Text style={styles.indicadorCifra}>
            {catalogo
              ? resumen.tratamientosEnCurso
              : '—'}
          </Text>

          <Text style={styles.indicadorDetalle}>
            Tratamientos activos
          </Text>

        </View>

      </View>

      {/* =================================
          ALERTAS Y DISTRIBUCIÓN
      ================================= */}

      <View
        style={[
          styles.panelesDashboard,
          {
            flexDirection: dashboardEnFila
              ? 'row'
              : 'column',
          },
        ]}
      >

        {/* COLMENAS QUE REQUIEREN ATENCIÓN */}

        <View
          style={[
            styles.panel,
            {
              width: dashboardEnFila
                ? '64.5%'
                : '100%',
            },
          ]}
        >

          <View style={styles.panelCabecera}>

            <Text style={styles.panelTitulo}>
              Colmenas que requieren atención
            </Text>

            <Text style={styles.panelDescripcion}>
              Según su última inspección, su estado o más de {DIAS_SIN_INSPECCION} días sin revisar.
            </Text>

          </View>

          {cargandoDashboard ? (

            <View style={styles.estadoVacio}>
              <ActivityIndicator
                size="small"
                color="#D9A323"
              />
              <Text style={styles.estadoVacioTexto}>
                Cargando alertas...
              </Text>
            </View>

          ) : !catalogo ? (

            <View style={styles.estadoVacio}>
              <Text style={styles.estadoVacioTexto}>
                No hay un catálogo disponible para consultar las alertas.
              </Text>
            </View>

          ) : resumen.alertas.length === 0 ? (

            <View style={styles.estadoVacio}>
              <Text style={styles.estadoVacioIcono}>
                ✓
              </Text>

              <Text style={styles.estadoVacioTexto}>
                Todas las colmenas están al día.
              </Text>
            </View>

          ) : (

            <View>

              {resumen.alertas
                .slice(0, 10)
                .map(({ colmena, prioridad, motivos }) => {

                  const apiario =
                    apiariosOrdenados.find(
                      item =>
                        item.id === colmena.apiario_id
                    );

                  const alta = prioridad === 'alta';

                  return (
                    <View
                      key={colmena.id}
                      style={styles.alertaFila}
                    >

                      <View style={styles.alertaContenido}>

                        <View style={styles.alertaTituloFila}>

                          <Text style={styles.alertaCodigo}>
                            {colmena.codigo}
                          </Text>

                          <Text style={styles.alertaApiario}>
                            {apiario?.nombre ?? 'Sin apiario'}
                          </Text>

                          <View
                            style={[
                              styles.insignia,
                              alta
                                ? styles.insigniaAlta
                                : styles.insigniaMedia,
                            ]}
                          >
                            <Text
                              style={[
                                styles.insigniaTexto,
                                alta
                                  ? styles.insigniaTextoAlta
                                  : styles.insigniaTextoMedia,
                              ]}
                            >
                              {alta
                                ? 'Prioridad alta'
                                : 'Revisar'}
                            </Text>
                          </View>

                        </View>

                        <Text style={styles.alertaMotivos}>
                          {motivos.join(' · ')}
                        </Text>

                      </View>

                      <Text style={styles.alertaFlecha}>
                        ›
                      </Text>

                    </View>
                  );
                })}

              {resumen.alertas.length > 10 && (
                <Text style={styles.alertasRestantes}>
                  Y {resumen.alertas.length - 10} colmenas más. Revísalas en el módulo Colmenas.
                </Text>
              )}

            </View>
          )}

        </View>

        {/* ESTADO SEGÚN ÚLTIMA INSPECCIÓN */}

        <View
          style={[
            styles.panel,
            {
              width: dashboardEnFila
                ? '33.5%'
                : '100%',
            },
          ]}
        >

          <View style={styles.panelCabecera}>
            <Text style={styles.panelTitulo}>
              Estado según última inspección
            </Text>

            <Text style={styles.panelDescripcion}>
              {apiarioElegido
                ? `${apiarioElegido.nombre} · `
                : ''}
              {resumen.operativas.length} colmenas en operación
            </Text>
          </View>

          {!catalogo ? (

            <View style={styles.estadoVacio}>
              <Text style={styles.estadoVacioTexto}>
                Datos no disponibles.
              </Text>
            </View>

          ) : (

            <View style={styles.distribucionContenido}>

              {DISTRIBUCION
                .filter(
                  fila =>
                    !fila.soloSiHay ||
                    resumen.conteo[fila.clave] > 0
                )
                .map(fila => {

                  const cantidad =
                    resumen.conteo[fila.clave];

                  const porcentaje =
                    resumen.operativas.length > 0
                      ? Math.round(
                          (cantidad * 100) /
                            resumen.operativas.length
                        )
                      : 0;

                  return (
                    <View
                      key={fila.clave}
                      style={styles.estadoBarraFila}
                    >

                      <View style={styles.estadoBarraTitulo}>

                        <Text style={styles.estadoBarraNombre}>
                          {fila.texto}
                        </Text>

                        <Text style={styles.estadoBarraCantidad}>
                          {cantidad}
                          <Text style={styles.estadoBarraPorcentaje}>
                            {' '}({porcentaje}%)
                          </Text>
                        </Text>

                      </View>

                      <View style={styles.barraFondo}>

                        <View
                          style={[
                            styles.barraProgreso,
                            {
                              width: `${porcentaje}%`,
                              backgroundColor: fila.color,
                            },
                          ]}
                        />

                      </View>

                    </View>
                  );
                })}

            </View>
          )}

        </View>

      </View>

      {/* =================================
          RESUMEN POR APIARIO
      ================================= */}

      <View style={styles.panel}>

        <View style={styles.panelCabecera}>
          <Text style={styles.panelTitulo}>
            Resumen por apiario
          </Text>

          <Text style={styles.panelDescripcion}>
            Comparación de colmenas operativas y alertas.
          </Text>
        </View>

        {cargandoDashboard ? (

          <View style={styles.estadoVacio}>
            <ActivityIndicator
              color="#D9A323"
            />
          </View>

        ) : resumen.porApiario.length === 0 ? (

          <View style={styles.estadoVacio}>
            <Text style={styles.estadoVacioTexto}>
              No hay apiarios registrados en el catálogo.
            </Text>
          </View>

        ) : (

          resumen.porApiario.map(
            ({ apiario, colmenas, alertas }) => {

              const activo =
                apiarioId === String(apiario.id);

              return (
                <View
                  key={apiario.id}
                  style={[
                    styles.apiarioFila,
                    activo && styles.apiarioFilaActivo,
                  ]}
                >

                  <View style={styles.apiarioDatos}>

                    <Text style={styles.apiarioNombre}>
                      {apiario.nombre}
                    </Text>

                    <Text style={styles.apiarioUbicacion}>
                      {apiario.ubicacion || 'Sin registrar'}
                    </Text>

                    <View style={styles.apiarioIndicadores}>

                      <Text style={styles.apiarioDato}>
                        🐝 {colmenas} colmenas
                      </Text>

                      <View
                        style={[
                          styles.insignia,
                          styles.insigniaMedia,
                        ]}
                      >
                        <Text style={styles.insigniaTextoMedia}>
                          {alertas} requieren atención
                        </Text>
                      </View>

                    </View>

                  </View>

                  <View style={styles.apiarioAcciones}>

                    <Pressable
                      onPress={() =>
                        setApiarioId(String(apiario.id))
                      }
                      style={styles.botonApiario}
                    >
                      <Text style={styles.botonApiarioTexto}>
                        Ver en panel
                      </Text>
                    </Pressable>

                  </View>

                </View>
              );
            }
          )
        )}

      </View>

      {/* =================================
          ESTADO DEL SISTEMA
      ================================= */}

      <Text style={styles.seccion}>
        Estado del sistema
      </Text>

      <View style={styles.estadoGrid}>

        {/* INTERNET */}

        <View
          style={[
            styles.tarjetaEstado,
            {
              width: anchoEstado,
            },
            conInternet
              ? styles.tarjetaOnline
              : sinInternet
                ? styles.tarjetaOffline
                : styles.tarjetaVerificando,
          ]}
        >

          <View style={styles.estadoFila}>

            <View
              style={[
                styles.puntoEstado,
                conInternet
                  ? styles.puntoOnline
                  : sinInternet
                    ? styles.puntoOffline
                    : styles.puntoNeutral,
              ]}
            />

            <Text style={styles.conexionTitulo}>
              {textoConexion}
            </Text>

          </View>

          <Text style={styles.conexionDetalle}>
            {detalleConexion}
          </Text>

        </View>

        {/* FASTAPI */}

        <View
          style={[
            styles.tarjetaEstado,
            {
              width: anchoEstado,
            },
            estadoServidor === 'DISPONIBLE'
              ? styles.tarjetaOnline
              : estadoServidor === 'NO_DISPONIBLE'
                ? styles.tarjetaError
                : styles.tarjetaVerificando,
          ]}
        >

          <View style={styles.estadoFila}>

            <View
              style={[
                styles.puntoEstado,
                estadoServidor === 'DISPONIBLE'
                  ? styles.puntoOnline
                  : estadoServidor === 'NO_DISPONIBLE'
                    ? styles.puntoOffline
                    : styles.puntoNeutral,
              ]}
            />

            <Text style={styles.conexionTitulo}>
              {textoServidor}
            </Text>

          </View>

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

      </View>

      {/* =================================
          RESUMEN DE ACTIVIDAD LOCAL
      ================================= */}

      <Text style={styles.seccion}>
        Resumen de actividad
      </Text>

      <View style={styles.estadisticas}>

        <View
          style={[
            styles.estadistica,
            {
              width: anchoEstadistica,
            },
          ]}
        >
          <Text style={styles.estadisticaEtiqueta}>
            TOTAL REGISTRADAS
          </Text>

          <Text style={styles.cifra}>
            {errorInspecciones ? '!' : total}
          </Text>

          <Text style={styles.estadisticaDetalle}>
            Inspecciones locales
          </Text>
        </View>

        <View
          style={[
            styles.estadistica,
            {
              width: anchoEstadistica,
            },
          ]}
        >
          <Text style={styles.estadisticaEtiqueta}>
            PENDIENTES
          </Text>

          <Text style={styles.cifraPendiente}>
            {errorInspecciones ? '!' : pendientes}
          </Text>

          <Text style={styles.estadisticaDetalle}>
            Pendientes de sincronización
          </Text>
        </View>

        <View
          style={[
            styles.estadistica,
            {
              width: anchoEstadistica,
            },
          ]}
        >
          <Text style={styles.estadisticaEtiqueta}>
            SINCRONIZADAS
          </Text>

          <Text style={styles.cifraSincronizada}>
            {errorInspecciones ? '!' : sincronizadas}
          </Text>

          <Text style={styles.estadisticaDetalle}>
            Confirmadas localmente
          </Text>
        </View>

      </View>

      {errorInspecciones && (
        <Text style={styles.error}>
          No fue posible cargar el resumen de inspecciones locales.
        </Text>
      )}

      {/* =================================
          PIE
      ================================= */}

      <View style={styles.pie}>

        <View style={styles.pieLinea} />

        <Text style={styles.pieTexto}>
          Colmenares Tres Pinos
        </Text>

        <Text style={styles.pieDetalle}>
          Aplicación móvil · Expo + SQLite
        </Text>

      </View>

    </ScrollView>
  );
}
// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  pantalla: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  contenido: {
    width: '100%',
    maxWidth: 1600,
    alignSelf: 'center',
    paddingTop: 22,
    paddingBottom: 45,
  },

  // ENCABEZADO

  encabezadoSuperior: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 22,
  },

  encabezadoTextos: {
    flex: 1,
    marginRight: 10,
  },

  titulo: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 26,
  },

  tituloTablet: {
    fontSize: 32,
  },

  introduccion: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 5,
  },

  botonActualizar: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  botonActualizarTexto: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '800',
  },

  elementoPresionado: {
    opacity: 0.75,
    borderColor: '#D9A323',
  },

  avisoCatalogo: {
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    marginBottom: 15,
  },

  avisoCatalogoTexto: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 19,
  },

  // FILTRO

  filtroSeccion: {
    marginBottom: 19,
  },

  filtroTitulo: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },

  filtroLista: {
    alignItems: 'center',
    paddingRight: 10,
  },

  filtroBoton: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    marginRight: 9,
  },

  filtroBotonActivo: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },

  filtroTexto: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },

  filtroTextoActivo: {
    color: '#422006',
    fontWeight: '800',
  },

  // INDICADORES

  estadisticas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  indicador: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 13,
    minHeight: 125,
    justifyContent: 'center',
  },

  indicadorAlerta: {
    borderColor: '#FECACA',
  },

  indicadorCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  indicadorEtiqueta: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },

  indicadorIcono: {
    fontSize: 21,
    marginLeft: 5,
  },

  indicadorCifra: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 7,
  },

  indicadorNombre: {
    fontSize: 19,
  },

  cifraAlerta: {
    color: '#DC2626',
  },

  indicadorDetalle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },

  // PANELES

  panelesDashboard: {
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 5,
  },

  panel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 17,
  },

  panelCabecera: {
    padding: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  panelTitulo: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },

  panelDescripcion: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 5,
    lineHeight: 18,
  },

  estadoVacio: {
    padding: 25,
    minHeight: 95,
    alignItems: 'center',
    justifyContent: 'center',
  },

  estadoVacioIcono: {
    fontSize: 28,
    fontWeight: '900',
    color: '#16A34A',
    marginBottom: 7,
  },

  estadoVacioTexto: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },

  // ALERTAS

  alertaFila: {
    paddingHorizontal: 15,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
  },

  alertaContenido: {
    flex: 1,
  },

  alertaTituloFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  alertaCodigo: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 8,
  },

  alertaApiario: {
    color: '#64748B',
    fontSize: 11,
    marginRight: 8,
  },

  alertaMotivos: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },

  alertaFlecha: {
    fontSize: 26,
    color: '#94A3B8',
    marginLeft: 7,
  },

  alertasRestantes: {
    padding: 14,
    color: '#64748B',
    fontSize: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  insignia: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  insigniaAlta: {
    backgroundColor: '#FEF2F2',
  },

  insigniaMedia: {
    backgroundColor: '#FFFBEB',
  },

  insigniaTexto: {
    fontSize: 10,
    fontWeight: '800',
  },

  insigniaTextoAlta: {
    color: '#B91C1C',
  },

  insigniaTextoMedia: {
    color: '#92400E',
  },

  // DISTRIBUCIÓN

  distribucionContenido: {
    padding: 17,
  },

  estadoBarraFila: {
    marginBottom: 19,
  },

  estadoBarraTitulo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },

  estadoBarraNombre: {
    color: '#475569',
    fontSize: 12,
    flex: 1,
  },

  estadoBarraCantidad: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },

  estadoBarraPorcentaje: {
    color: '#94A3B8',
    fontWeight: '400',
  },

  barraFondo: {
    height: 9,
    width: '100%',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    overflow: 'hidden',
  },

  barraProgreso: {
    height: '100%',
    borderRadius: 10,
  },

  // RESUMEN APIARIOS

  apiarioFila: {
    padding: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  apiarioFilaActivo: {
    backgroundColor: '#FFFBEB',
  },

  apiarioDatos: {
    marginBottom: 12,
  },

  apiarioNombre: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },

  apiarioUbicacion: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },

  apiarioIndicadores: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 11,
  },

  apiarioDato: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 10,
    marginBottom: 5,
  },

  apiarioAcciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  botonApiario: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    marginRight: 8,
    marginBottom: 5,
  },

  botonApiarioTexto: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },

  // TÍTULOS DE SECCIÓN

  seccion: {
    marginTop: 23,
    marginBottom: 13,
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },

  // CONECTIVIDAD

  estadoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  tarjetaEstado: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 112,
    marginBottom: 12,
  },

  tarjetaOnline: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },

  tarjetaOffline: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },

  tarjetaError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  tarjetaVerificando: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },

  estadoFila: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  puntoEstado: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 9,
  },

  puntoOnline: {
    backgroundColor: '#16A34A',
  },

  puntoOffline: {
    backgroundColor: '#EA580C',
  },

  puntoNeutral: {
    backgroundColor: '#94A3B8',
  },

  conexionTitulo: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },

  conexionDetalle: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 9,
  },

  botonRevisar: {
    alignSelf: 'flex-start',
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    marginTop: 12,
  },

  textoRevisar: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  deshabilitado: {
    opacity: 0.4,
  },

  // ACTIVIDAD LOCAL

  estadistica: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 15,
    padding: 17,
    marginBottom: 12,
    minHeight: 115,
    justifyContent: 'center',
  },

  estadisticaEtiqueta: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.7,
  },

  cifra: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 7,
  },

  cifraPendiente: {
    fontSize: 32,
    fontWeight: '900',
    color: '#D97706',
    marginTop: 7,
  },

  cifraSincronizada: {
    fontSize: 32,
    fontWeight: '900',
    color: '#16A34A',
    marginTop: 7,
  },

  estadisticaDetalle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
  },

  error: {
    color: '#B91C1C',
    fontSize: 12,
    marginTop: 8,
  },

  // PIE

  pie: {
    alignItems: 'center',
    marginTop: 30,
  },

  pieLinea: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 18,
  },

  pieTexto: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },

  pieDetalle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 5,
  },

});