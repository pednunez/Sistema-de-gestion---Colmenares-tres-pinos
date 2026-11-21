$ErrorActionPreference = 'Stop'

$apiariosPath = Join-Path (Get-Location) 'mobile\ApiariosLocales.tsx'
$appPath = Join-Path (Get-Location) 'mobile\App.tsx'

if (!(Test-Path $apiariosPath) -or !(Test-Path $appPath)) {
    throw 'Ejecuta este script desde la raíz del repositorio Colmenares Tres Pinos. Deben existir mobile\ApiariosLocales.tsx y mobile\App.tsx.'
}

$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
Copy-Item $apiariosPath "$apiariosPath.bak_$stamp"
Copy-Item $appPath "$appPath.bak_$stamp"

$component = @'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { COLORS } from './theme';

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  leerSesionGuardada,
  tokenVigente,
} from './api/auth';

import {
  listarApiarios,
  crearApiario,
  actualizarApiario,
  darDeBajaApiario,
} from './api/apiarios';

import type {
  Apiario,
  ApiarioCrear,
} from './api/apiarios';

import {
  leerCatalogoLocal,
  descargarCatalogo,
} from './database/catalogo';

import {
  solicitarAPI,
} from './api/cliente';

import {
  useConexion,
} from './sincronizacion/conectividad';

// ==========================================
// TIPOS
// ==========================================

type Catalogo = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

type ColmenaCatalogo = Catalogo['colmenas'][number];

type InspeccionDashboard = {
  id?: number;
  colmena_id: number;
  fecha_inspeccion: string;
  estado_general?: string | null;
  signos_enfermedad?: boolean | number | string | null;
  enfermedad_observada?: string | null;
  observaciones?: string | null;
  activo?: boolean;
};

type Prioridad = 'alta' | 'media';

type AlertaApiario = {
  colmena: ColmenaCatalogo;
  prioridad: Prioridad;
  motivos: string[];
  ultima?: InspeccionDashboard;
};

type Props = {
  onVolver: () => void;
  rol: 'ADMIN' | 'APICULTOR';
};

type ModoModal =
  | 'crear'
  | 'editar'
  | 'detalle'
  | 'colmenas'
  | 'colmena-detalle'
  | null;

const DIAS_SIN_INSPECCION = 30;

// ==========================================
// MISMAS REGLAS DE ALERTAS QUE EL DASHBOARD WEB
// ==========================================

function colmenaOperativa(colmena: ColmenaCatalogo): boolean {
  return colmena.estado !== 'INACTIVA' && colmena.estado !== 'BAJA';
}

function obtenerFecha(fecha?: string | null): number {
  if (!fecha) return 0;
  const resultado = Date.parse(fecha);
  return Number.isFinite(resultado) ? resultado : 0;
}

function diasDesde(fecha?: string | null): number | null {
  if (!fecha) return null;

  const partes = fecha.slice(0, 10).split('-').map(Number);
  let fechaInspeccion: Date;

  if (partes.length === 3 && partes.every(Number.isFinite)) {
    fechaInspeccion = new Date(partes[0], partes[1] - 1, partes[2]);
  } else {
    const fechaParseada = new Date(fecha);
    if (!Number.isFinite(fechaParseada.getTime())) return null;
    fechaInspeccion = new Date(
      fechaParseada.getFullYear(),
      fechaParseada.getMonth(),
      fechaParseada.getDate()
    );
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaInspeccion.setHours(0, 0, 0, 0);

  return Math.floor((hoy.getTime() - fechaInspeccion.getTime()) / 86400000);
}

function ultimaInspeccionPorColmena(
  inspecciones: InspeccionDashboard[]
): Map<number, InspeccionDashboard> {
  const ultimas = new Map<number, InspeccionDashboard>();

  for (const inspeccion of inspecciones) {
    const actual = ultimas.get(inspeccion.colmena_id);
    if (
      !actual ||
      obtenerFecha(inspeccion.fecha_inspeccion) >
        obtenerFecha(actual.fecha_inspeccion)
    ) {
      ultimas.set(inspeccion.colmena_id, inspeccion);
    }
  }

  return ultimas;
}

function calcularAlertas(
  colmenas: ColmenaCatalogo[],
  inspecciones: InspeccionDashboard[]
): AlertaApiario[] {
  const ultimas = ultimaInspeccionPorColmena(inspecciones);
  const alertas: AlertaApiario[] = [];

  for (const colmena of colmenas) {
    if (!colmenaOperativa(colmena)) continue;

    const ultima = ultimas.get(colmena.id);
    const motivos: string[] = [];
    let prioridad: Prioridad | null = null;

    if (
      ultima?.estado_general === 'REQUIERE_REVISION' ||
      ultima?.estado_general === 'CRITICO'
    ) {
      motivos.push(
        ultima.estado_general === 'CRITICO'
          ? 'Última inspección en estado crítico'
          : 'Última inspección: requiere revisión'
      );
      prioridad = 'alta';
    }

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

    if (colmena.estado === 'EN_OBSERVACION') {
      motivos.push('Marcada en observación');
      prioridad ??= 'media';
    }

    if (!ultima) {
      motivos.push('Sin inspecciones registradas');
      prioridad ??= 'media';
    } else {
      const dias = diasDesde(ultima.fecha_inspeccion);
      if (dias !== null && dias > DIAS_SIN_INSPECCION) {
        motivos.push(`Sin inspección hace ${dias} días`);
        prioridad ??= 'media';
      }
    }

    if (motivos.length > 0 && prioridad) {
      alertas.push({ colmena, prioridad, motivos, ultima });
    }
  }

  return alertas.sort(
    (a, b) =>
      (a.prioridad === 'alta' ? 0 : 1) -
      (b.prioridad === 'alta' ? 0 : 1)
  );
}

// ==========================================
// UTILIDADES
// ==========================================

function obtenerMensaje(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocurrió un error inesperado.';
}

function formatearFecha(fecha?: string | null): string {
  if (!fecha) return 'No disponible';

  const soloFecha = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const valor = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(fecha);

  if (Number.isNaN(valor.getTime())) return fecha;
  return valor.toLocaleDateString('es-CL');
}

function etiquetaEstado(estado?: string | null): string {
  if (!estado) return 'No informado';
  return estado.replace(/_/g, ' ').toLowerCase().replace(/^\w/, letra => letra.toUpperCase());
}

async function obtenerTokenAdmin(): Promise<string> {
  const sesion = await leerSesionGuardada();

  if (!sesion || !tokenVigente(sesion)) {
    throw new Error('Tu sesión ha vencido. Inicia sesión nuevamente.');
  }

  if (sesion.usuario.rol !== 'ADMIN') {
    throw new Error('Solo un administrador puede modificar apiarios.');
  }

  return sesion.accessToken;
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function ApiariosLocales({ onVolver, rol }: Props) {
  const { width } = useWindowDimensions();
  const conexion = useConexion();
  const conInternet = conexion === 'CON_INTERNET';
  const esAdmin = rol === 'ADMIN';

  const anchoTarjeta = width >= 1100
    ? '31.8%'
    : width >= 700
      ? '48.5%'
      : '100%';

  const [apiarios, setApiarios] = useState<Apiario[]>([]);
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [inspecciones, setInspecciones] = useState<InspeccionDashboard[]>([]);
  const [alertasDisponibles, setAlertasDisponibles] = useState(false);

  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  const [error, setError] = useState('');
  const [avisoDatos, setAvisoDatos] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaColmena, setBusquedaColmena] = useState('');
  const [soloAtencion, setSoloAtencion] = useState(false);

  const [modal, setModal] = useState<ModoModal>(null);
  const [seleccionado, setSeleccionado] = useState<Apiario | null>(null);
  const [colmenaSeleccionada, setColmenaSeleccionada] = useState<ColmenaCatalogo | null>(null);

  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [descripcion, setDescripcion] = useState('');

  // ========================================
  // CARGA DE APIARIOS, CATÁLOGO E INSPECCIONES
  // ========================================

  const cargarDatos = useCallback(async (inicial = false) => {
    if (inicial) setCargando(true);
    else setActualizando(true);

    setError('');

    try {
      const sesion = await leerSesionGuardada();
      if (!sesion || !tokenVigente(sesion)) {
        throw new Error('Tu sesión ha vencido. Inicia sesión nuevamente.');
      }

      let catalogoLocal = await leerCatalogoLocal(sesion.usuario.id).catch(() => null);
      let aviso = '';

      if (conInternet) {
        try {
          await descargarCatalogo(sesion);
          catalogoLocal = await leerCatalogoLocal(sesion.usuario.id);
        } catch {
          aviso = catalogoLocal
            ? 'No se pudo actualizar el catálogo. Se utiliza la última versión guardada en el dispositivo.'
            : 'No se pudo descargar el catálogo oficial de colmenas.';
        }
      } else if (catalogoLocal) {
        aviso = 'Sin conexión: se muestran las colmenas guardadas en el dispositivo.';
      }

      setCatalogo(catalogoLocal);

      if (conInternet) {
        try {
          const resultadoApiarios = await listarApiarios(sesion.accessToken);
          setApiarios(resultadoApiarios);
        } catch (err) {
          if (catalogoLocal) {
            setApiarios(catalogoLocal.apiarios as unknown as Apiario[]);
            aviso = [aviso, 'No se pudo actualizar el listado de apiarios; se muestra la última versión local.']
              .filter(Boolean)
              .join(' ');
          } else {
            throw err;
          }
        }

        try {
          const resultadoInspecciones = await solicitarAPI<InspeccionDashboard[]>(
            '/inspecciones/',
            { method: 'GET', token: sesion.accessToken }
          );
          setInspecciones(resultadoInspecciones.filter(item => item.activo !== false));
          setAlertasDisponibles(true);
        } catch {
          setInspecciones([]);
          setAlertasDisponibles(false);
          aviso = [aviso, 'No se pudieron actualizar las alertas de inspección.']
            .filter(Boolean)
            .join(' ');
        }
      } else {
        setApiarios(catalogoLocal
          ? catalogoLocal.apiarios as unknown as Apiario[]
          : []);
        setInspecciones([]);
        setAlertasDisponibles(false);
      }

      if (!catalogoLocal) {
        aviso = [aviso, 'No hay un catálogo de colmenas disponible en este dispositivo.']
          .filter(Boolean)
          .join(' ');
      }

      if (!conInternet) {
        setInspecciones([]);
        setAlertasDisponibles(false);
      }

      setAvisoDatos(aviso);
    } catch (err) {
      setError(obtenerMensaje(err));
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, [conInternet]);

  useEffect(() => {
    void cargarDatos(true);
  }, [cargarDatos]);

  // ========================================
  // RESÚMENES Y FILTROS
  // ========================================

  const colmenas = catalogo?.colmenas ?? [];

  const alertas = useMemo(
    () => alertasDisponibles ? calcularAlertas(colmenas, inspecciones) : [],
    [alertasDisponibles, colmenas, inspecciones]
  );

  const alertasPorColmena = useMemo(
    () => new Map<number, AlertaApiario>(alertas.map(item => [item.colmena.id, item] as const)),
    [alertas]
  );

  const ultimasInspecciones = useMemo(
    () => ultimaInspeccionPorColmena(inspecciones),
    [inspecciones]
  );

  const resumenPorApiario = useMemo(() => {
    const resumen = new Map<number, { colmenas: number; alertas: number }>();

    for (const apiario of apiarios) {
      const asociadas = colmenas.filter(item => item.apiario_id === apiario.id);
      const alertasAsociadas = alertas.filter(
        item => item.colmena.apiario_id === apiario.id
      );

      resumen.set(apiario.id, {
        colmenas: asociadas.length,
        alertas: alertasAsociadas.length,
      });
    }

    return resumen;
  }, [apiarios, colmenas, alertas]);

  const apiariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return apiarios;

    return apiarios.filter(item =>
      `${item.nombre} ${item.ubicacion ?? ''}`.toLowerCase().includes(termino)
    );
  }, [apiarios, busqueda]);

  const activos = apiarios.filter(item => item.activo).length;
  const inactivos = apiarios.length - activos;

  const colmenasDelApiario = seleccionado
    ? colmenas
        .filter(item => item.apiario_id === seleccionado.id)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    : [];

  const colmenasFiltradas = colmenasDelApiario.filter(item => {
    const coincideCodigo = item.codigo.toLowerCase().includes(busquedaColmena.trim().toLowerCase());
    const coincideAtencion = !soloAtencion || alertasPorColmena.has(item.id);
    return coincideCodigo && coincideAtencion;
  });

  const ultimaInspeccionSeleccionada = colmenaSeleccionada
    ? ultimasInspecciones.get(colmenaSeleccionada.id)
    : undefined;

  // ========================================
  // APERTURA Y CIERRE DE VISTAS
  // ========================================

  const abrirCrear = () => {
    if (!esAdmin) return;
    setSeleccionado(null);
    setNombre('');
    setUbicacion('');
    setDescripcion('');
    setModal('crear');
  };

  const abrirEditar = (item: Apiario) => {
    if (!esAdmin) return;
    setSeleccionado(item);
    setNombre(item.nombre);
    setUbicacion(item.ubicacion ?? '');
    setDescripcion(item.descripcion ?? '');
    setModal('editar');
  };

  const abrirDetalle = (item: Apiario) => {
    setSeleccionado(item);
    setModal('detalle');
  };

  const abrirColmenas = (item: Apiario) => {
    if (!catalogo) {
      Alert.alert('Catálogo no disponible', 'No se pudo cargar la información oficial de colmenas. Actualiza cuando tengas conexión.');
      return;
    }
    setSeleccionado(item);
    setBusquedaColmena('');
    setSoloAtencion(false);
    setColmenaSeleccionada(null);
    setModal('colmenas');
  };

  const abrirDetalleColmena = (item: ColmenaCatalogo) => {
    setColmenaSeleccionada(item);
    setModal('colmena-detalle');
  };

  const cerrarModal = () => {
    if (guardando) return;
    setModal(null);
    setSeleccionado(null);
    setColmenaSeleccionada(null);
    setBusquedaColmena('');
    setSoloAtencion(false);
  };

  // ========================================
  // CREAR Y EDITAR APIARIOS
  // ========================================

  const guardarApiario = async () => {
    if (!esAdmin) {
      Alert.alert('Acceso restringido', 'Solo un administrador puede modificar apiarios.');
      return;
    }

    const nombreLimpio = nombre.trim();
    const ubicacionLimpia = ubicacion.trim();
    const descripcionLimpia = descripcion.trim();

    if (nombreLimpio.length < 2) {
      Alert.alert('Nombre inválido', 'El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (nombreLimpio.length > 100) {
      Alert.alert('Nombre inválido', 'El nombre no puede superar los 100 caracteres.');
      return;
    }
    if (ubicacionLimpia.length > 255) {
      Alert.alert('Ubicación inválida', 'La ubicación no puede superar los 255 caracteres.');
      return;
    }

    setGuardando(true);

    try {
      const token = await obtenerTokenAdmin();
      const datos: ApiarioCrear = {
        nombre: nombreLimpio,
        ubicacion: ubicacionLimpia || null,
        descripcion: descripcionLimpia || null,
      };

      if (modal === 'editar' && seleccionado) {
        await actualizarApiario(seleccionado.id, datos, token);
      } else {
        await crearApiario(datos, token);
      }

      const fueEdicion = modal === 'editar';
      setModal(null);
      setSeleccionado(null);
      await cargarDatos(false);
      Alert.alert(
        'Operación exitosa',
        fueEdicion ? 'El apiario se actualizó correctamente.' : 'El apiario se creó correctamente.'
      );
    } catch (err) {
      Alert.alert('Error', obtenerMensaje(err));
    } finally {
      setGuardando(false);
    }
  };

  // ========================================
  // BAJA LÓGICA CON VALIDACIÓN DE COLMENAS
  // ========================================

  const ejecutarBaja = async (item: Apiario) => {
    if (!esAdmin) return;
    setProcesandoId(item.id);

    try {
      const token = await obtenerTokenAdmin();
      await darDeBajaApiario(item.id, token);
      await cargarDatos(false);
      Alert.alert('Apiario dado de baja', 'El registro histórico se ha conservado.');
    } catch (err) {
      Alert.alert('No se pudo dar de baja', obtenerMensaje(err));
    } finally {
      setProcesandoId(null);
    }
  };

  const confirmarBaja = (item: Apiario) => {
    if (!esAdmin) return;

    if (!catalogo) {
      Alert.alert(
        'No se puede validar',
        'Primero actualiza el catálogo de colmenas. No se realizará la baja sin comprobar las asociaciones.'
      );
      return;
    }

    const cantidad = colmenas.filter(colmena => colmena.apiario_id === item.id).length;

    if (cantidad > 0) {
      Alert.alert(
        'No se puede dar de baja todavía',
        `${item.nombre} tiene ${cantidad} colmenas asociadas. Muévelas a otro apiario o dales de baja antes de continuar.`,
        [
          { text: 'Cerrar', style: 'cancel' },
          { text: 'Ver colmenas', onPress: () => abrirColmenas(item) },
        ]
      );
      return;
    }

    Alert.alert(
      'Dar de baja apiario',
      `¿Estás seguro de dar de baja "${item.nombre}"? Su historial se conservará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: () => { void ejecutarBaja(item); },
        },
      ]
    );
  };

  // ========================================
  // CARGANDO
  // ========================================

  if (cargando) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.secundario}>Cargando apiarios...</Text>
      </View>
    );
  }

  // ========================================
  // PANTALLA PRINCIPAL
  // ========================================

  return (
    <View style={styles.contenedor}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={() => { void cargarDatos(false); }}
            colors={[COLORS.gold]}
          />
        }
      >
        <Pressable onPress={onVolver} style={styles.volver}>
          <Text style={styles.volverTexto}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.titulo}>Apiarios</Text>
        <Text style={styles.subtitulo}>Sectores donde se agrupan las colmenas.</Text>

        <View style={styles.resumen}>
          <View style={styles.resumenCard}>
            <Text style={styles.numero}>{apiarios.length}</Text>
            <Text style={styles.resumenTexto}>Registrados</Text>
          </View>
          <View style={styles.resumenCard}>
            <Text style={[styles.numero, styles.verde]}>{activos}</Text>
            <Text style={styles.resumenTexto}>Activos</Text>
          </View>
          <View style={[styles.resumenCard, styles.resumenCardUltimo]}>
            <Text style={[styles.numero, styles.naranja]}>{inactivos}</Text>
            <Text style={styles.resumenTexto}>Inactivos</Text>
          </View>
        </View>

        {esAdmin && (
          <Pressable style={styles.botonNuevo} onPress={abrirCrear}>
            <Text style={styles.botonNuevoTexto}>+ Nuevo apiario</Text>
          </Pressable>
        )}

        <TextInput
          style={styles.buscador}
          placeholder="Buscar por nombre o ubicación..."
          placeholderTextColor={COLORS.textMuted}
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
        />

        {!!error && (
          <View style={styles.errorCaja}>
            <Text style={styles.errorTexto}>{error}</Text>
            <Pressable onPress={() => { void cargarDatos(false); }}>
              <Text style={styles.reintentar}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {!!avisoDatos && (
          <View style={styles.avisoDatosCaja}>
            <Text style={styles.avisoDatos}>{avisoDatos}</Text>
          </View>
        )}

        <Text style={styles.seccion}>Apiarios registrados</Text>

        {apiariosFiltrados.length === 0 ? (
          <View style={styles.vacio}>
            <Text style={styles.vacioIcono}>🌿</Text>
            <Text style={styles.vacioTitulo}>No hay apiarios</Text>
            <Text style={styles.secundario}>
              {busqueda ? 'No encontramos coincidencias.' : 'Todavía no existen apiarios registrados.'}
            </Text>
          </View>
        ) : (
          <View style={styles.listaTarjetas}>
            {apiariosFiltrados.map(item => {
              const resumenItem = resumenPorApiario.get(item.id);
              const cantidadColmenas = resumenItem?.colmenas ?? 0;
              const cantidadAlertas = resumenItem?.alertas ?? 0;

              return (
                <View key={item.id} style={[styles.tarjeta, { width: anchoTarjeta }]}>
                  <View style={styles.fila}>
                    <View style={styles.icono}>
                      <Text style={styles.iconoTexto}>🌿</Text>
                    </View>
                    <View style={styles.info}>
                      <Text style={styles.nombre}>{item.nombre}</Text>
                      <Text style={styles.ubicacion}>
                        {item.ubicacion || 'Ubicación sin registrar'}
                      </Text>
                    </View>
                    <View style={[styles.estado, item.activo ? styles.estadoActivo : styles.estadoInactivo]}>
                      <Text style={[styles.estadoTexto, item.activo ? styles.textoActivo : styles.textoInactivo]}>
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </Text>
                    </View>
                  </View>

                  {!!item.descripcion && (
                    <Text style={styles.descripcion}>{item.descripcion}</Text>
                  )}

                  <Text style={styles.fecha}>
                    Registrado: {formatearFecha(item.fecha_creacion)}
                  </Text>

                  <View style={styles.insigniasApiario}>
                    <View style={styles.insigniaColmenas}>
                      <Text style={styles.insigniaColmenasTexto}>
                        {catalogo ? `${cantidadColmenas} ${cantidadColmenas === 1 ? 'colmena' : 'colmenas'}` : 'Colmenas: —'}
                      </Text>
                    </View>
                    {alertasDisponibles && cantidadAlertas > 0 && (
                      <View style={styles.insigniaAtencion}>
                        <Text style={styles.insigniaAtencionTexto}>
                          {cantidadAlertas} requieren atención
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.acciones}>
                    <Pressable style={styles.botonDetalle} onPress={() => abrirColmenas(item)}>
                      <Text style={styles.textoDetalle}>Ver colmenas</Text>
                    </Pressable>
                    <Pressable style={styles.botonSecundario} onPress={() => abrirDetalle(item)}>
                      <Text style={styles.textoSecundarioBoton}>Detalle</Text>
                    </Pressable>
                    {esAdmin && item.activo && (
                      <>
                        <Pressable style={styles.botonEditar} onPress={() => abrirEditar(item)}>
                          <Text style={styles.textoEditar}>Editar</Text>
                        </Pressable>
                        <Pressable
                          style={styles.botonBaja}
                          disabled={procesandoId === item.id}
                          onPress={() => confirmarBaja(item)}
                        >
                          {procesandoId === item.id
                            ? <ActivityIndicator color={COLORS.danger} />
                            : <Text style={styles.textoBaja}>Dar de baja</Text>}
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modal !== null}
        transparent
        animationType="slide"
        onRequestClose={cerrarModal}
      >
        <KeyboardAvoidingView
          style={styles.fondoModal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modal}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitulo}>
                {modal === 'crear'
                  ? 'Nuevo apiario'
                  : modal === 'editar'
                    ? `Editar ${seleccionado?.nombre ?? 'apiario'}`
                    : modal === 'detalle'
                      ? 'Detalle del apiario'
                      : modal === 'colmenas'
                        ? `Colmenas de ${seleccionado?.nombre ?? 'apiario'}`
                        : 'Detalle de la colmena'}
              </Text>

              {modal === 'detalle' && seleccionado ? (
                <>
                  <Text style={styles.label}>Nombre</Text>
                  <Text style={styles.valor}>{seleccionado.nombre}</Text>
                  <Text style={styles.label}>Ubicación</Text>
                  <Text style={styles.valor}>{seleccionado.ubicacion || 'No registrada'}</Text>
                  <Text style={styles.label}>Descripción</Text>
                  <Text style={styles.valor}>{seleccionado.descripcion || 'Sin descripción'}</Text>
                  <Text style={styles.label}>Estado</Text>
                  <Text style={styles.valor}>{seleccionado.activo ? 'Activo' : 'Inactivo'}</Text>
                  <Text style={styles.label}>Fecha de creación</Text>
                  <Text style={styles.valor}>{formatearFecha(seleccionado.fecha_creacion)}</Text>
                  <Text style={styles.label}>Última actualización</Text>
                  <Text style={styles.valor}>{formatearFecha(seleccionado.fecha_actualizacion)}</Text>
                  {!!seleccionado.fecha_eliminacion && (
                    <>
                      <Text style={styles.label}>Fecha de baja</Text>
                      <Text style={styles.valor}>{formatearFecha(seleccionado.fecha_eliminacion)}</Text>
                    </>
                  )}
                  <View style={styles.resumenDetalleApiario}>
                    <View style={styles.resumenDetalleDato}>
                      <Text style={styles.resumenDetalleNumero}>
                        {catalogo ? resumenPorApiario.get(seleccionado.id)?.colmenas ?? 0 : '—'}
                      </Text>
                      <Text style={styles.resumenDetalleEtiqueta}>Colmenas asociadas</Text>
                    </View>
                    <View style={styles.resumenDetalleDato}>
                      <Text style={[styles.resumenDetalleNumero, styles.naranja]}>
                        {alertasDisponibles ? resumenPorApiario.get(seleccionado.id)?.alertas ?? 0 : '—'}
                      </Text>
                      <Text style={styles.resumenDetalleEtiqueta}>Requieren atención</Text>
                    </View>
                  </View>
                  <Pressable style={styles.botonVerColmenas} onPress={() => abrirColmenas(seleccionado)}>
                    <Text style={styles.botonVerColmenasTexto}>Ver colmenas del apiario</Text>
                  </Pressable>
                </>
              ) : modal === 'colmenas' && seleccionado ? (
                <>
                  <Pressable style={styles.volverModal} onPress={() => setModal('detalle')}>
                    <Text style={styles.volverModalTexto}>‹ Volver al apiario</Text>
                  </Pressable>
                  <Text style={styles.subtituloModal}>
                    {catalogo ? `${colmenasDelApiario.length} colmenas asociadas a este apiario` : 'Catálogo de colmenas no disponible.'}
                  </Text>
                  <TextInput
                    style={styles.buscadorColmenas}
                    placeholder="Buscar por código de colmena..."
                    placeholderTextColor={COLORS.textMuted}
                    value={busquedaColmena}
                    onChangeText={setBusquedaColmena}
                    autoCapitalize="characters"
                  />
                  {alertasDisponibles && (
                    <Pressable
                      style={[styles.filtroAtencion, soloAtencion && styles.filtroAtencionActivo]}
                      onPress={() => setSoloAtencion(valor => !valor)}
                    >
                      <Text style={[styles.filtroAtencionTexto, soloAtencion && styles.filtroAtencionTextoActivo]}>
                        {soloAtencion ? '✓ ' : ''}Solo las que requieren atención
                      </Text>
                    </Pressable>
                  )}
                  {!catalogo ? (
                    <View style={styles.listaColmenasVacia}>
                      <Text style={styles.secundario}>Actualiza el catálogo cuando tengas conexión para consultar las colmenas.</Text>
                    </View>
                  ) : colmenasFiltradas.length === 0 ? (
                    <View style={styles.listaColmenasVacia}>
                      <Text style={styles.vacioTitulo}>
                        {colmenasDelApiario.length === 0 ? 'Este apiario todavía no tiene colmenas' : 'No hay colmenas que coincidan'}
                      </Text>
                      <Text style={styles.secundario}>
                        {soloAtencion ? 'Prueba desactivando el filtro de atención.' : 'Prueba con otro código de colmena.'}
                      </Text>
                    </View>
                  ) : (
                    colmenasFiltradas.map(item => {
                      const ultima = ultimasInspecciones.get(item.id);
                      const alerta = alertasPorColmena.get(item.id);
                      return (
                        <Pressable key={item.id} style={styles.tarjetaColmena} onPress={() => abrirDetalleColmena(item)}>
                          <View style={styles.filaColmena}>
                            <View style={styles.infoColmena}>
                              <Text style={styles.codigoColmena}>{item.codigo}</Text>
                              <Text style={styles.detalleColmenaTexto}>Estado: {etiquetaEstado(item.estado)}</Text>
                              <Text style={styles.detalleColmenaTexto}>Marcos registrados: {item.cantidad_marcos ?? 'No informado'}</Text>
                              <Text style={styles.detalleColmenaTexto}>
                                Última inspección: {ultima ? formatearFecha(ultima.fecha_inspeccion) : alertasDisponibles ? 'Sin inspecciones' : 'No disponible sin conexión'}
                              </Text>
                              {!!ultima?.estado_general && (
                                <Text style={styles.detalleColmenaTexto}>Resultado: {etiquetaEstado(ultima.estado_general)}</Text>
                              )}
                            </View>
                            {!!alerta && (
                              <View style={styles.insigniaAtencion}>
                                <Text style={styles.insigniaAtencionTexto}>Atención</Text>
                              </View>
                            )}
                          </View>
                          {!!alerta && <Text style={styles.avisoAlerta}>{alerta.motivos.join(' · ')}</Text>}
                          <Text style={styles.abrirDetalleColmena}>Ver información ›</Text>
                        </Pressable>
                      );
                    })
                  )}
                  {!alertasDisponibles && catalogo && (
                    <Text style={styles.avisoDatos}>Las colmenas están disponibles, pero las alertas requieren conexión con FastAPI.</Text>
                  )}
                </>
              ) : modal === 'colmena-detalle' && colmenaSeleccionada ? (
                <>
                  <Pressable style={styles.volverModal} onPress={() => setModal('colmenas')}>
                    <Text style={styles.volverModalTexto}>‹ Volver a colmenas</Text>
                  </Pressable>
                  <Text style={styles.codigoColmenaDetalle}>{colmenaSeleccionada.codigo}</Text>
                  <Text style={styles.label}>Estado</Text>
                  <Text style={styles.valor}>{etiquetaEstado(colmenaSeleccionada.estado)}</Text>
                  <Text style={styles.label}>Cantidad de marcos</Text>
                  <Text style={styles.valor}>{colmenaSeleccionada.cantidad_marcos ?? 'No registrada'}</Text>
                  <Text style={styles.label}>Última inspección</Text>
                  <Text style={styles.valor}>
                    {ultimaInspeccionSeleccionada
                      ? formatearFecha(ultimaInspeccionSeleccionada.fecha_inspeccion)
                      : (alertasDisponibles ? 'Sin inspecciones registradas' : 'No disponible sin conexión')}
                  </Text>
                  {!!ultimaInspeccionSeleccionada?.estado_general && (
                    <>
                      <Text style={styles.label}>Estado de la última inspección</Text>
                      <Text style={styles.valor}>{etiquetaEstado(ultimaInspeccionSeleccionada.estado_general)}</Text>
                    </>
                  )}
                  {!!ultimaInspeccionSeleccionada?.signos_enfermedad && (
                    <>
                      <Text style={styles.label}>Signos de enfermedad</Text>
                      <Text style={styles.valor}>{ultimaInspeccionSeleccionada.enfermedad_observada || 'Se registraron signos de enfermedad'}</Text>
                    </>
                  )}
                  {!!ultimaInspeccionSeleccionada?.observaciones && (
                    <>
                      <Text style={styles.label}>Observaciones de la última inspección</Text>
                      <Text style={styles.valor}>{ultimaInspeccionSeleccionada.observaciones}</Text>
                    </>
                  )}
                  {alertasPorColmena.has(colmenaSeleccionada.id) && (
                    <View style={styles.alertaDetalle}>
                      <Text style={styles.insigniaAtencionTexto}>Requiere atención</Text>
                      <Text style={styles.avisoAlerta}>
                        {alertasPorColmena.get(colmenaSeleccionada.id)?.motivos.join(' · ')}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.label}>Nombre del apiario *</Text>
                  <TextInput
                    style={styles.input}
                    value={nombre}
                    onChangeText={setNombre}
                    placeholder="Ej. Apiario Melipilla"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={100}
                  />
                  <Text style={styles.label}>Ubicación</Text>
                  <TextInput
                    style={styles.input}
                    value={ubicacion}
                    onChangeText={setUbicacion}
                    placeholder="Comuna, sector o dirección"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={255}
                  />
                  <Text style={styles.label}>Descripción</Text>
                  <TextInput
                    style={[styles.input, styles.multilinea]}
                    value={descripcion}
                    onChangeText={setDescripcion}
                    placeholder="Información adicional"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    numberOfLines={4}
                  />
                  <Text style={styles.ayuda}>Los campos marcados con * son obligatorios.</Text>
                </>
              )}

              <View style={styles.accionesModal}>
                <Pressable style={styles.botonCancelar} onPress={cerrarModal} disabled={guardando}>
                  <Text style={styles.textoCancelar}>Cerrar</Text>
                </Pressable>
                {(modal === 'crear' || modal === 'editar') && (
                  <Pressable
                    style={styles.botonGuardar}
                    onPress={() => { void guardarApiario(); }}
                    disabled={guardando}
                  >
                    {guardando
                      ? <ActivityIndicator color={COLORS.forest} />
                      : <Text style={styles.textoGuardar}>{modal === 'editar' ? 'Guardar cambios' : 'Crear apiario'}</Text>}
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ==========================================
// ESTILOS RESPONSIVE
// ==========================================

const styles = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: COLORS.background },
  contenido: { padding: 18, paddingBottom: 40 },
  cargando: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  volver: { alignSelf: 'flex-start', backgroundColor: COLORS.surface, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, marginBottom: 17 },
  volverTexto: { color: COLORS.text, fontWeight: '700' },
  titulo: { fontSize: 27, fontWeight: '800', color: COLORS.forest },
  subtitulo: { fontSize: 14, color: COLORS.textSecondary, marginTop: 5 },
  resumen: { flexDirection: 'row', marginVertical: 18 },
  resumenCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 13, padding: 13, marginRight: 7, borderWidth: 1, borderColor: COLORS.borderStrong },
  resumenCardUltimo: { marginRight: 0 },
  numero: { fontSize: 24, fontWeight: '800', color: COLORS.forest },
  resumenTexto: { fontSize: 11, color: COLORS.textSecondary, marginTop: 5 },
  verde: { color: COLORS.successDeep },
  naranja: { color: COLORS.warning },
  botonNuevo: { backgroundColor: COLORS.gold, borderRadius: 11, padding: 15, alignItems: 'center' },
  botonNuevoTexto: { color: COLORS.forest, fontWeight: '800', fontSize: 14 },
  buscador: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 11, padding: 13, color: COLORS.forest, fontSize: 14, marginTop: 15 },
  seccion: { fontSize: 18, fontWeight: '800', color: COLORS.forest, marginVertical: 17 },
  listaTarjetas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tarjeta: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 15, padding: 15, marginBottom: 13 },
  fila: { flexDirection: 'row', alignItems: 'center' },
  icono: { width: 42, height: 42, borderRadius: 11, backgroundColor: COLORS.goldSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  iconoTexto: { fontSize: 21 },
  info: { flex: 1, minWidth: 0 },
  nombre: { fontSize: 16, fontWeight: '800', color: COLORS.forest },
  ubicacion: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  estado: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 6 },
  estadoActivo: { backgroundColor: COLORS.successBg },
  estadoInactivo: { backgroundColor: COLORS.background },
  estadoTexto: { fontSize: 10, fontWeight: '800' },
  textoActivo: { color: COLORS.successDeep },
  textoInactivo: { color: COLORS.textSecondary },
  descripcion: { color: COLORS.textSecondary, fontSize: 13, marginTop: 12 },
  fecha: { color: COLORS.textMuted, fontSize: 11, marginTop: 12 },
  insigniasApiario: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 14, marginBottom: 2 },
  insigniaColmenas: { backgroundColor: COLORS.background, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginRight: 7, marginBottom: 5, borderWidth: 1, borderColor: COLORS.borderStrong },
  insigniaColmenasTexto: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  insigniaAtencion: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.warning, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 5 },
  insigniaAtencionTexto: { color: COLORS.goldText, fontSize: 11, fontWeight: '800' },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, borderTopWidth: 1, borderTopColor: COLORS.borderStrong, paddingTop: 12 },
  botonDetalle: { backgroundColor: COLORS.infoBg, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, marginRight: 7, marginBottom: 5 },
  textoDetalle: { color: COLORS.info, fontSize: 12, fontWeight: '700' },
  botonSecundario: { backgroundColor: COLORS.background, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, marginRight: 7, marginBottom: 5, borderWidth: 1, borderColor: COLORS.borderStrong },
  textoSecundarioBoton: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  botonEditar: { backgroundColor: COLORS.goldSoft, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, marginRight: 7, marginBottom: 5 },
  textoEditar: { color: COLORS.goldText, fontSize: 12, fontWeight: '700' },
  botonBaja: { backgroundColor: COLORS.dangerBg, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 9, marginBottom: 5 },
  textoBaja: { color: COLORS.danger, fontSize: 12, fontWeight: '700' },
  vacio: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 28, alignItems: 'center' },
  vacioIcono: { fontSize: 32, marginBottom: 10 },
  vacioTitulo: { fontSize: 16, fontWeight: '800', color: COLORS.forest, marginBottom: 6 },
  secundario: { color: COLORS.textSecondary, fontSize: 13, marginTop: 7, textAlign: 'center' },
  errorCaja: { backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: COLORS.danger, borderRadius: 11, padding: 13, marginTop: 12 },
  errorTexto: { color: COLORS.danger, fontSize: 13 },
  reintentar: { color: COLORS.danger, fontWeight: '800', marginTop: 8 },
  avisoDatosCaja: { backgroundColor: COLORS.goldSoft, borderRadius: 10, padding: 11, marginTop: 12 },
  avisoDatos: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8 },
  fondoModal: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 18 },
  modal: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, maxHeight: '92%' },
  modalTitulo: { fontSize: 19, fontWeight: '900', color: COLORS.forest, marginBottom: 16 },
  label: { color: COLORS.forest, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  valor: { backgroundColor: COLORS.background, borderRadius: 9, padding: 12, color: COLORS.text, fontSize: 13 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, padding: 12, color: COLORS.forest, fontSize: 14 },
  multilinea: { minHeight: 95, textAlignVertical: 'top' },
  ayuda: { color: COLORS.textMuted, fontSize: 11, marginTop: 8 },
  accionesModal: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20 },
  botonCancelar: { backgroundColor: COLORS.background, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 12, marginRight: 8, marginBottom: 5 },
  textoCancelar: { color: COLORS.text, fontWeight: '700' },
  botonGuardar: { backgroundColor: COLORS.gold, borderRadius: 9, paddingHorizontal: 16, paddingVertical: 12, minWidth: 125, alignItems: 'center', marginBottom: 5 },
  textoGuardar: { color: COLORS.forest, fontWeight: '800' },
  subtituloModal: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 12 },
  volverModal: { alignSelf: 'flex-start', backgroundColor: COLORS.background, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, marginBottom: 12 },
  volverModalTexto: { color: COLORS.forest, fontWeight: '700', fontSize: 12 },
  buscadorColmenas: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, padding: 12, color: COLORS.forest, fontSize: 14, marginTop: 5, marginBottom: 10 },
  filtroAtencion: { alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  filtroAtencionActivo: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.warning },
  filtroAtencionTexto: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  filtroAtencionTextoActivo: { color: COLORS.goldText },
  tarjetaColmena: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, padding: 13, marginBottom: 10 },
  filaColmena: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  infoColmena: { flex: 1, minWidth: 0 },
  codigoColmena: { color: COLORS.forest, fontSize: 16, fontWeight: '800', marginBottom: 5 },
  codigoColmenaDetalle: { color: COLORS.forest, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  detalleColmenaTexto: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  abrirDetalleColmena: { color: COLORS.info, fontSize: 12, fontWeight: '800', marginTop: 11 },
  listaColmenasVacia: { backgroundColor: COLORS.background, borderRadius: 12, padding: 18, alignItems: 'center', marginTop: 6 },
  resumenDetalleApiario: { flexDirection: 'row', marginTop: 18 },
  resumenDetalleDato: { flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, padding: 13, marginRight: 8 },
  resumenDetalleNumero: { fontSize: 22, fontWeight: '800', color: COLORS.forest },
  resumenDetalleEtiqueta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 5 },
  botonVerColmenas: { backgroundColor: COLORS.gold, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 15, alignItems: 'center', marginTop: 17 },
  botonVerColmenasTexto: { color: COLORS.forest, fontWeight: '800', fontSize: 13 },
  avisoAlerta: { color: COLORS.goldText, fontSize: 11, lineHeight: 16, marginTop: 8 },
  alertaDetalle: { backgroundColor: COLORS.goldSoft, borderRadius: 10, padding: 12, marginTop: 14 },
});
'@

[System.IO.File]::WriteAllText($apiariosPath, $component, [System.Text.UTF8Encoding]::new($false))

# Habilitar la consulta de Apiarios para ambos roles.
$app = [System.IO.File]::ReadAllText($appPath)
$menuRegex = [regex]::new("(?s)(id:\s*'apiarios'.{0,220}?roles:\s*)SOLO_ADMIN")
if ($menuRegex.IsMatch($app)) {
    $app = $menuRegex.Replace($app, '${1}TODOS', 1)
} elseif ($app -notmatch "(?s)id:\s*'apiarios'.{0,220}?roles:\s*TODOS") {
    throw 'No pude localizar la configuración del menú Apiarios en App.tsx. Se conservó el respaldo y no se modificó App.tsx.'
}

# Pasar el rol actual a ApiariosLocales para mantener protegidas las acciones administrativas.
$screenRegex = [regex]::new('(?s)<ApiariosLocales\s+onVolver=\{volverInicio\}\s*/>')
if ($screenRegex.IsMatch($app)) {
    $app = $screenRegex.Replace(
        $app,
        "<ApiariosLocales`r`n        onVolver={volverInicio}`r`n        rol={usuario.rol}`r`n      />",
        1
    )
} elseif ($app -notmatch '(?s)<ApiariosLocales\s+onVolver=\{volverInicio\}\s+rol=\{usuario\.rol\}') {
    throw 'No pude localizar la pantalla ApiariosLocales en App.tsx. Se conservó el respaldo.'
}

[System.IO.File]::WriteAllText($appPath, $app, [System.Text.UTF8Encoding]::new($false))

Write-Host "`nCAMBIOS APLICADOS EN LOCAL" -ForegroundColor Green
Write-Host ' - mobile/ApiariosLocales.tsx: tarjetas, conteos, alertas, detalle y listado de colmenas.' -ForegroundColor Green
Write-Host ' - mobile/App.tsx: Apiarios visible para ADMIN y APICULTOR; rol enviado al módulo.' -ForegroundColor Green
Write-Host "`nRespaldos creados:" -ForegroundColor Cyan
Write-Host " - $apiariosPath.bak_$stamp"
Write-Host " - $appPath.bak_$stamp"
Write-Host "`nNo se ejecutó Git, no se creó ningún commit ni se hizo push." -ForegroundColor Yellow
