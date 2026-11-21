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
import { ErrorAPI } from './api/cliente';
import {
  obtenerStock,
  registrarMovimientoStock,
  listarMovimientosStock,
  actualizarMinimoStock,
} from './api/stock';
import type {
  MaterialStock,
  TipoMovimientoStock,
  EstadoOrigenMerma,
  StockResumen,
  StockMovimiento,
  StockMovimientoCreate,
  FiltrosHistorialStock,
} from './api/stock';
// ==========================================
// PROPS
// ==========================================
type Props = {
  onVolver: () => void;
  rol: string;
};
type ModoModal =
  | 'movimiento'
  | 'minimo'
  | null;
// ==========================================
// CONSTANTES DE MATERIALES
// ==========================================
const MATERIALES: {
  valor: MaterialStock;
  texto: string;
  unidad: string;
  plural: string;
  puedeDanarse: boolean;
}[] = [
  {
    valor: 'CAJON',
    texto: 'Cajones',
    unidad: 'cajón',
    plural: 'cajones',
    puedeDanarse: true,
  },
  {
    valor: 'ALZA',
    texto: 'Alzas',
    unidad: 'alza',
    plural: 'alzas',
    puedeDanarse: true,
  },
  {
    valor: 'MARCO_VACIO',
    texto: 'Marcos vacíos',
    unidad: 'marco',
    plural: 'marcos',
    puedeDanarse: true,
  },
  {
    valor: 'MARCO_CERA_ESTIRADA',
    texto: 'Marcos con cera estirada',
    unidad: 'marco',
    plural: 'marcos',
    puedeDanarse: false,
  },
  {
    valor: 'MARCO_CERA_UNTADA',
    texto: 'Marcos con cera untada',
    unidad: 'marco',
    plural: 'marcos',
    puedeDanarse: false,
  },
  {
    valor: 'MARCO_CERA_ESTAMPADA',
    texto: 'Marcos con cera estampada',
    unidad: 'marco',
    plural: 'marcos',
    puedeDanarse: false,
  },
  {
    valor: 'MARCO_MIEL',
    texto: 'Marcos con miel',
    unidad: 'marco',
    plural: 'marcos',
    puedeDanarse: false,
  },
  {
    valor: 'TECHO',
    texto: 'Techos',
    unidad: 'techo',
    plural: 'techos',
    puedeDanarse: true,
  },
  {
    valor: 'TECHO_AMERICANO',
    texto: 'Techos americanos',
    unidad: 'techo americano',
    plural: 'techos americanos',
    puedeDanarse: true,
  },
  {
    valor: 'ENTRETAPA',
    texto: 'Entretapas',
    unidad: 'entretapa',
    plural: 'entretapas',
    puedeDanarse: true,
  },
  {
    valor: 'PISO',
    texto: 'Pisos',
    unidad: 'piso',
    plural: 'pisos',
    puedeDanarse: true,
  },
];
// ==========================================
// TIPOS DE MOVIMIENTO
// ==========================================
const TIPOS_MOVIMIENTO: {
  valor: TipoMovimientoStock;
  texto: string;
  ayuda: string;
}[] = [
  {
    valor: 'INGRESO',
    texto: 'Ingreso',
    ayuda: 'Compra o fabricación de material.',
  },
  {
    valor: 'ENVIO',
    texto: 'Salida',
    ayuda: 'Material que sale de la bodega.',
  },
  {
    valor: 'DANO',
    texto: 'Daño',
    ayuda: 'Material que deja de estar disponible.',
  },
  {
    valor: 'ENVIO_REPARACION',
    texto: 'A reparación',
    ayuda: 'Material dañado que se envía a reparar.',
  },
  {
    valor: 'REPARACION',
    texto: 'Reparado',
    ayuda: 'Material que vuelve de reparación.',
  },
  {
    valor: 'DESCARTE',
    texto: 'Merma',
    ayuda: 'Material que se elimina definitivamente.',
  },
];
const ETIQUETAS_TIPO: Record<
  TipoMovimientoStock,
  string
> = {
  INGRESO: 'Ingreso',
  ENVIO: 'Salida',
  DANO: 'Daño',
  ENVIO_REPARACION: 'A reparación',
  REPARACION: 'Reparado',
  DESCARTE: 'Merma',
};
// ==========================================
// SESION
// ==========================================
async function obtenerToken(): Promise<string> {
  const sesion = await leerSesionGuardada();
  if (
    !sesion ||
    !tokenVigente(sesion)
  ) {
    throw new Error(
      'Tu sesión ha vencido. Inicia sesión nuevamente.'
    );
  }
  return sesion.accessToken;
}
// ==========================================
// UTILIDADES
// ==========================================
function obtenerMensaje(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Ocurrió un error inesperado.';
}
function obtenerMaterial(
  material: MaterialStock
) {
  return MATERIALES.find(
    item => item.valor === material
  ) ?? {
    valor: material, texto: String(material).replace(/_/g, ' '),
    unidad: 'unidad', plural: 'unidades', puedeDanarse: false,
  };
}
function formatearFecha(fecha?: string | null): string {
  if (!fecha) return 'No disponible';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return fecha;
  const dos = (n: number) => String(n).padStart(2, '0');
  const hora24 = valor.getHours();
  const hora12 = hora24 % 12 || 12;
  const periodo = hora24 >= 12 ? 'p. m.' : 'a. m.';
  return `${dos(valor.getDate())}-${dos(valor.getMonth() + 1)}-${valor.getFullYear()}, ${dos(hora12)}:${dos(valor.getMinutes())} ${periodo}`;
}
function fechaParaApi(texto: string): string | null {
  const valor = texto.trim();
  if (!valor) return '';
  const local = /^(\d{2})-(\d{2})-(\d{4})$/.exec(valor);
  const iso = local ? `${local[3]}-${local[2]}-${local[1]}` : valor;
  return validarFecha(iso) ? iso : null;
}
function validarFecha(
  fecha: string
): boolean {
  if (!fecha) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }
  const valor = new Date(
    `${fecha}T00:00:00`
  );
  return (
    !Number.isNaN(valor.getTime()) &&
    valor.toISOString().slice(0, 10) === fecha
  );
}
function esEnteroPositivo(
  valor: string
): boolean {
  const numero = Number(valor);
  return (
    Number.isInteger(numero) &&
    numero > 0 &&
    numero <= 10000
  );
}
// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function StockLocales({
  onVolver,
  rol,
}: Props) {
  const esAdmin = rol === 'ADMIN';
  const { width: anchoPantalla } = useWindowDimensions();
  const [anchoPanelResponsive, setAnchoPanelResponsive] = useState(0);
  const anchoDisponible = anchoPanelResponsive || anchoPantalla;
  const columnas = anchoDisponible >= 900 ? 3 : anchoDisponible >= 580 ? 2 : 1;
  // Para parecerse a la web conservamos las siete columnas también en tablet.
  // Si la pantalla es angosta, las tablas se desplazan horizontalmente.
  const anchoTablaReparacion = Math.max(920, anchoDisponible - 30);
  const anchoTablaHistorial = Math.max(1120, anchoDisponible - 30);
  // ========================================
  // INVENTARIO
  // ========================================
  const [stock, setStock] = useState<StockResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // ========================================
  // HISTORIAL
  // ========================================
  const [historial, setHistorial] =
    useState<StockMovimiento[]>([]);
  const [historialCargando, setHistorialCargando] =
    useState(false);
  const [historialError, setHistorialError] =
    useState('');
  const [historialDisponible, setHistorialDisponible] =
    useState(true);
  const [pagina, setPagina] = useState(1);
  const [haySiguiente, setHaySiguiente] =
    useState(false);
  const [filtroMaterial, setFiltroMaterial] =
    useState<MaterialStock | ''>('');
  const [filtroTipo, setFiltroTipo] =
    useState<TipoMovimientoStock | ''>('');
  const [filtroDesde, setFiltroDesde] =
    useState('');
  const [filtroHasta, setFiltroHasta] =
    useState('');
  const [filtrosAplicados, setFiltrosAplicados] =
    useState<FiltrosHistorialStock>({});
  const [selectorFiltro, setSelectorFiltro] =
    useState<'material' | 'tipo' | null>(null);
  // ========================================
  // MODALES
  // ========================================
  const [modal, setModal] =
    useState<ModoModal>(null);
  const [guardando, setGuardando] =
    useState(false);
  const [materialSeleccionado, setMaterialSeleccionado] =
    useState<MaterialStock>('CAJON');
  // ========================================
  // FORMULARIO DE MOVIMIENTO
  // ========================================
  const [tipoMovimiento, setTipoMovimiento] =
    useState<TipoMovimientoStock>('INGRESO');
  const [cantidad, setCantidad] =
    useState('1');
  const [apiarioId, setApiarioId] =
    useState('');
  const [colmenaId, setColmenaId] =
    useState('');
  const [estadoOrigen, setEstadoOrigen] =
    useState<EstadoOrigenMerma | ''>('');
  const [observaciones, setObservaciones] =
    useState('');
  // ========================================
  // FORMULARIO DE MINIMOS
  // ========================================
  const [minimoTexto, setMinimoTexto] =
    useState('');
  // ========================================
  // CARGAR INVENTARIO
  // ========================================
  const cargarStock = useCallback(
    async (inicial = false) => {
      if (inicial) {
        setCargando(true);
      } else {
        setActualizando(true);
      }
      try {
        const token = await obtenerToken();
        const resultado = await obtenerStock(token);
        setStock(resultado);
        setError('');
      } catch (err) {
        setError(obtenerMensaje(err));
      } finally {
        setCargando(false);
        setActualizando(false);
      }
    },
    []
  );
  // ========================================
  // CARGAR HISTORIAL
  // ========================================
  const cargarHistorial = useCallback(
    async (
      paginaSolicitada: number,
      filtros: FiltrosHistorialStock
    ) => {
      setHistorialCargando(true);
      try {
        const token = await obtenerToken();
        const resultado = await listarMovimientosStock(
          {
            ...filtros,
            offset: (paginaSolicitada - 1) * 20,
            limit: 21,
          },
          token
        );
        setHistorial(
          resultado.slice(0, 20)
        );
        setHaySiguiente(
          resultado.length > 20
        );
        setPagina(paginaSolicitada);
        setHistorialDisponible(true);
        setHistorialError('');
      } catch (err) {
        if (
          err instanceof ErrorAPI &&
          err.estado === 404
        ) {
          setHistorialDisponible(false);
          setHistorial([]);
          setHistorialError(
            'El historial todavía no está disponible en el servidor.'
          );
        } else {
          setHistorialError(
            obtenerMensaje(err)
          );
        }
      } finally {
        setHistorialCargando(false);
      }
    },
    []
  );
  // ========================================
  // CARGA INICIAL
  // ========================================
  useEffect(() => {
    void cargarStock(true);
    void cargarHistorial(1, {});
  }, [
    cargarStock,
    cargarHistorial,
  ]);
  // ========================================
  // ACTUALIZAR PANTALLA
  // ========================================
  const recargarTodo = () => {
    void cargarStock(false);
    void cargarHistorial(
      pagina,
      filtrosAplicados
    );
  };
  // ========================================
  // FILTRAR INVENTARIO
  // ========================================
  const stockFiltrado = useMemo(() => {
    const termino = busqueda
      .trim()
      .toLowerCase();
    if (!termino) {
      return stock;
    }
    return stock.filter(item => {
      const nombre = obtenerMaterial(
        item.material
      ).texto.toLowerCase();
      return (
        nombre.includes(termino) ||
        item.material.toLowerCase().includes(termino)
      );
    });
  }, [
    stock,
    busqueda,
  ]);
  // ========================================
  // TOTALES DEL INVENTARIO
  // ========================================
  const totales = useMemo(() => {
    return stock.reduce(
      (resultado, item) => {
        resultado.disponible += item.disponible;
        resultado.danado += item.danado;
        resultado.reparacion += item.en_reparacion;
        resultado.merma += item.merma;
        return resultado;
      },
      {
        disponible: 0,
        danado: 0,
        reparacion: 0,
        merma: 0,
      }
    );
  }, [stock]);
  // ========================================
  // ALERTAS DE STOCK BAJO
  // ========================================
  const materialesBajos = stock.filter(
    item =>
      item.minimo !== null &&
      item.disponible < item.minimo
  );
  // Marcos listos: vacíos y con cera, sin contabilizar marcos con miel.
  const marcosListos = stock.reduce((total, item) => {
    if (String(item.material).startsWith('MARCO_') && item.material !== 'MARCO_MIEL') {
      return total + item.disponible;
    }
    return total;
  }, 0);

  const stockOrdenado = useMemo(() => {
    const orden = [
      'CAJON', 'ALZA', 'PISO', 'TECHO', 'TECHO_AMERICANO', 'ENTRETAPA',
      'MARCO_VACIO', 'MARCO_CERA_ESTIRADA', 'MARCO_CERA_UNTADA',
      'MARCO_CERA_ESTAMPADA', 'MARCO_MIEL',
    ];
    return [...stockFiltrado].sort((a, b) => {
      const ai = orden.indexOf(a.material);
      const bi = orden.indexOf(b.material);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    });
  }, [stockFiltrado]);

  const materialesReparacion = stock.filter(
    item => item.danado > 0 || item.en_reparacion > 0
  );

  const abrirAccionMaterial = (
    item: StockResumen,
    tipo: TipoMovimientoStock,
    origen: EstadoOrigenMerma | '' = ''
  ) => {
    if (!esAdmin) return;
    setMaterialSeleccionado(item.material);
    setTipoMovimiento(tipo);
    setCantidad('1');
    setApiarioId('');
    setColmenaId('');
    setEstadoOrigen(origen);
    setObservaciones('');
    setModal('movimiento');
  };

  const etiquetaMovimiento = (tipo: string) => {
    if (tipo === 'EXTRACCION_MIEL') return 'Extracción de miel';
    return ETIQUETAS_TIPO[tipo as TipoMovimientoStock] || tipo.replace(/_/g, ' ');
  };

  const colorMovimiento = (tipo: string) => {
    if (tipo === 'INGRESO' || tipo === 'REPARACION') return styles.movVerde;
    if (tipo === 'DANO' || tipo === 'DESCARTE') return styles.movRojo;
    if (tipo === 'EXTRACCION_MIEL') return styles.movAmarillo;
    return styles.movNeutro;
  };

  const formatoCantidadMovimiento = (item: StockMovimiento) => {
    const tipo = String(item.tipo);
    const signo = tipo === 'INGRESO' || tipo === 'REPARACION' ? '+' :
      ['DANO', 'ENVIO', 'ENVIO_REPARACION', 'DESCARTE'].includes(tipo) ? '-' : '';
    return `${signo}${item.cantidad}`;
  };

  const responsableMovimiento = (item: StockMovimiento) => {
    const registro = item as StockMovimiento & {
      usuario_nombre?: string | null;
      nombre_usuario?: string | null;
      responsable?: string | null;
      usuario?: { nombre?: string | null; nombre_completo?: string | null } | null;
    };
    return registro.usuario_nombre || registro.nombre_usuario ||
      registro.responsable || registro.usuario?.nombre_completo ||
      registro.usuario?.nombre || `Usuario ${item.usuario_id}`;
  };

  const destinoMovimiento = (item: StockMovimiento) => {
    if (item.colmena_id) return `Colmena ${item.colmena_id}${item.apiario_id ? ` · Apiario ${item.apiario_id}` : ''}`;
    if (item.apiario_id) return `Apiario ${item.apiario_id}`;
    if (item.estado_origen) return item.estado_origen === 'DANADO' ? 'Material dañado' : 'En reparación';
    return '—';
  };

  // ========================================
  // ABRIR REGISTRO DE MOVIMIENTO
  // ========================================
  const abrirMovimiento = () => {
    if (!esAdmin) {
      return;
    }
    setTipoMovimiento('INGRESO');
    setMaterialSeleccionado('CAJON');
    setCantidad('1');
    setApiarioId('');
    setColmenaId('');
    setEstadoOrigen('');
    setObservaciones('');
    setModal('movimiento');
  };
  // ========================================
  // MATERIALES DISPONIBLES SEGUN MOVIMIENTO
  // ========================================
  const materialesDisponibles = MATERIALES.filter(
    item => {
      const requiereEstados = [
        'ENVIO_REPARACION',
        'REPARACION',
        'DESCARTE',
      ].includes(tipoMovimiento);
      return (
        !requiereEstados ||
        item.puedeDanarse
      );
    }
  );
  // ========================================
  // CAMBIAR TIPO DE MOVIMIENTO
  // ========================================
  const cambiarTipoMovimiento = (
    tipo: TipoMovimientoStock
  ) => {
    setTipoMovimiento(tipo);
    setEstadoOrigen('');
    const opciones = MATERIALES.filter(item => {
      const requiereEstados = [
        'ENVIO_REPARACION',
        'REPARACION',
        'DESCARTE',
      ].includes(tipo);
      return (
        !requiereEstados ||
        item.puedeDanarse
      );
    });
    if (
      !opciones.some(
        item => item.valor === materialSeleccionado
      )
    ) {
      setMaterialSeleccionado(
        opciones[0].valor
      );
    }
  };
  // ========================================
  // VALIDAR MOVIMIENTO
  // ========================================
  const validarMovimiento = (): boolean => {
    if (!esAdmin) {
      Alert.alert(
        'Acceso restringido',
        'Solo el administrador puede registrar movimientos.'
      );
      return false;
    }
    if (!esEnteroPositivo(cantidad)) {
      Alert.alert(
        'Cantidad inválida',
        'Ingresa un número entero entre 1 y 10.000.'
      );
      return false;
    }
    if (
      tipoMovimiento === 'DESCARTE' &&
      !estadoOrigen
    ) {
      Alert.alert(
        'Estado requerido',
        'Indica si la merma proviene de material dañado o en reparación.'
      );
      return false;
    }
    if (
      tipoMovimiento === 'ENVIO' &&
      colmenaId.trim() !== '' &&
      apiarioId.trim() === ''
    ) {
      Alert.alert(
        'Destino incompleto',
        'Si ingresas una colmena, también debes ingresar el ID del apiario.'
      );
      return false;
    }
    if (
      apiarioId.trim() !== '' &&
      (
        !/^\d+$/.test(apiarioId) ||
        Number(apiarioId) <= 0
      )
    ) {
      Alert.alert(
        'Apiario inválido',
        'Ingresa un ID de apiario válido.'
      );
      return false;
    }
    if (
      colmenaId.trim() !== '' &&
      (
        !/^\d+$/.test(colmenaId) ||
        Number(colmenaId) <= 0
      )
    ) {
      Alert.alert(
        'Colmena inválida',
        'Ingresa un ID de colmena válido.'
      );
      return false;
    }
    if (observaciones.trim().length > 500) {
      Alert.alert(
        'Observaciones demasiado largas',
        'Las observaciones no pueden superar los 500 caracteres.'
      );
      return false;
    }
    const item = stock.find(
      elemento =>
        elemento.material === materialSeleccionado
    );
    if (!item) {
      Alert.alert(
        'Material no disponible',
        'No se encontró el material seleccionado.'
      );
      return false;
    }
    const numero = Number(cantidad);
    let existencia: number | null = null;
    let nombreEstado = '';
    switch (tipoMovimiento) {
      case 'ENVIO':
      case 'DANO':
        existencia = item.disponible;
        nombreEstado = 'disponibles';
        break;
      case 'ENVIO_REPARACION':
        existencia = item.danado;
        nombreEstado = 'dañados';
        break;
      case 'REPARACION':
        existencia = item.en_reparacion;
        nombreEstado = 'en reparación';
        break;
      case 'DESCARTE':
        existencia =
          estadoOrigen === 'DANADO'
            ? item.danado
            : item.en_reparacion;
        nombreEstado =
          estadoOrigen === 'DANADO'
            ? 'dañados'
            : 'en reparación';
        break;
    }
    if (
      existencia !== null &&
      numero > existencia
    ) {
      Alert.alert(
        'Stock insuficiente',
        `Solo existen ${existencia} unidades ${nombreEstado} de este material.`
      );
      return false;
    }
    return true;
  };
  // ========================================
  // GUARDAR MOVIMIENTO
  // ========================================
  const guardarMovimiento = async () => {
    if (!validarMovimiento()) {
      return;
    }
    setGuardando(true);
    try {
      const token = await obtenerToken();
      const datos: StockMovimientoCreate = {
        material: materialSeleccionado,
        tipo: tipoMovimiento,
        cantidad: Number(cantidad),
      };
      // DESTINO PARA ENVIO
      if (tipoMovimiento === 'ENVIO') {
        if (apiarioId.trim()) {
          datos.apiario_id = Number(apiarioId);
        }
        if (
          apiarioId.trim() &&
          colmenaId.trim()
        ) {
          datos.colmena_id = Number(colmenaId);
        }
      }
      // ORIGEN DE MERMA
      if (tipoMovimiento === 'DESCARTE') {
        datos.estado_origen =
          estadoOrigen as EstadoOrigenMerma;
      }
      // OBSERVACIONES
      if (observaciones.trim()) {
        datos.observaciones =
          observaciones.trim();
      }
      await registrarMovimientoStock(
        datos,
        token
      );
      setModal(null);
      await Promise.all([
        cargarStock(false),
        cargarHistorial(
          1,
          filtrosAplicados
        ),
      ]);
      Alert.alert(
        'Movimiento registrado',
        'El inventario se actualizó correctamente.'
      );
    } catch (err) {
      Alert.alert(
        'No se pudo registrar',
        obtenerMensaje(err)
      );
    } finally {
      setGuardando(false);
    }
  };
  // ========================================
  // ABRIR CONFIGURACION DE MINIMO
  // ========================================
  const abrirMinimo = (
    item: StockResumen
  ) => {
    if (!esAdmin) {
      return;
    }
    setMaterialSeleccionado(
      item.material
    );
    setMinimoTexto(
      item.minimo === null
        ? ''
        : String(item.minimo)
    );
    setModal('minimo');
  };
  // ========================================
  // GUARDAR MINIMO
  // ========================================
  const guardarMinimo = async () => {
    if (!esAdmin) {
      return;
    }
    const valor = minimoTexto.trim();
    let minimo: number | null = null;
    if (valor !== '') {
      minimo = Number(valor);
      if (
        !Number.isInteger(minimo) ||
        minimo < 0 ||
        minimo > 10000
      ) {
        Alert.alert(
          'Mínimo inválido',
          'Ingresa un número entero entre 0 y 10.000.'
        );
        return;
      }
    }
    setGuardando(true);
    try {
      const token = await obtenerToken();
      await actualizarMinimoStock(
        materialSeleccionado,
        minimo,
        token
      );
      setModal(null);
      await cargarStock(false);
      Alert.alert(
        'Mínimo actualizado',
        minimo === null
          ? 'Se eliminó la configuración del mínimo.'
          : `El nuevo mínimo es ${minimo} unidades.`
      );
    } catch (err) {
      Alert.alert(
        'No se pudo actualizar',
        obtenerMensaje(err)
      );
    } finally {
      setGuardando(false);
    }
  };
  // ========================================
  // CERRAR MODAL
  // ========================================
  const cerrarModal = () => {
    if (guardando) {
      return;
    }
    setModal(null);
  };
  // ========================================
  // FILTROS DEL HISTORIAL: DESPLEGABLES ESTILO WEB
  // ========================================
  const construirFiltros = (
    material: MaterialStock | '',
    tipo: TipoMovimientoStock | '',
    desdeTexto: string,
    hastaTexto: string,
  ): FiltrosHistorialStock | null => {
    const desde = fechaParaApi(desdeTexto);
    const hasta = fechaParaApi(hastaTexto);
    if (desde === null || hasta === null) return null;
    if (desde && hasta && desde > hasta) return null;
    return {
      material: material || undefined,
      tipo: tipo || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
    };
  };

  const aplicarFiltros = () => {
    const filtros = construirFiltros(
      filtroMaterial, filtroTipo, filtroDesde, filtroHasta,
    );
    if (!filtros) {
      Alert.alert(
        'Fechas inválidas',
        'Usa DD-MM-AAAA y comprueba que la fecha inicial no supere la final.',
      );
      return;
    }
    setFiltrosAplicados(filtros);
    void cargarHistorial(1, filtros);
  };

  const elegirFiltroMaterial = (material: MaterialStock | '') => {
    setSelectorFiltro(null);
    setFiltroMaterial(material);
    const filtros = construirFiltros(material, filtroTipo, filtroDesde, filtroHasta);
    if (filtros) {
      setFiltrosAplicados(filtros);
      void cargarHistorial(1, filtros);
    }
  };
  const elegirFiltroTipo = (tipo: TipoMovimientoStock | '') => {
    setSelectorFiltro(null);
    setFiltroTipo(tipo);
    const filtros = construirFiltros(filtroMaterial, tipo, filtroDesde, filtroHasta);
    if (filtros) {
      setFiltrosAplicados(filtros);
      void cargarHistorial(1, filtros);
    }
  };
  const limpiarFiltros = () => {
    setFiltroMaterial('');
    setFiltroTipo('');
    setFiltroDesde('');
    setFiltroHasta('');
    setFiltrosAplicados({});
    void cargarHistorial(1, {});
  };
  // ========================================
  // PANTALLA DE STOCK: DISEÑO WEB ADAPTADO
  // ========================================
  if (cargando && stock.length === 0) {
    return (
      <View style={styles.cargando}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.secundario}>Cargando inventario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.contenedor}>
      <ScrollView
        contentContainerStyle={styles.contenidoWeb}
        onLayout={(evento) => setAnchoPanelResponsive(evento.nativeEvent.layout.width)}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={actualizando} onRefresh={recargarTodo} colors={[COLORS.gold]} />
        }
      >
        {/* ENCABEZADO */}
        <View style={styles.cabeceraMovil}>
          <Pressable onPress={onVolver} style={styles.volverWeb}>
            <Text style={styles.volverWebTexto}>‹ Volver</Text>
          </Pressable>
          <Text style={styles.tituloWeb}>Stock</Text>
          <Text style={styles.marcaWeb}>Colmenares Tres Pinos</Text>
        </View>

        <View style={styles.barraIntro}>
          <Text style={styles.introTexto}>
            Material de la bodega central: lo disponible para las colmenas,
            lo dañado y lo que está en reparación.
          </Text>
          {esAdmin && (
            <Pressable style={styles.botonRegistrarWeb} onPress={abrirMovimiento}>
              <Text style={styles.botonRegistrarTexto}>＋ Registrar movimiento</Text>
            </Pressable>
          )}
        </View>

        {!!error && (
          <View style={styles.errorCaja}>
            <Text style={styles.errorTexto}>{error}</Text>
            <Pressable onPress={() => void cargarStock(false)}>
              <Text style={styles.reintentar}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {/* CUATRO RESÚMENES TAL COMO LA WEB */}
        <View style={styles.resumenWeb}>
          <View style={[styles.resumenWebCard, columnas === 1 ? styles.resumenMitad : styles.resumenCuarto]}>
            <View style={styles.resumenCabecera}>
              <Text style={styles.resumenWebEtiqueta}>Material disponible</Text>
              <Text style={styles.resumenEmoji}>⬡</Text>
            </View>
            <Text style={styles.resumenWebNumero}>{totales.disponible}</Text>
            <Text style={styles.resumenWebDetalle}>unidades listas para usar</Text>
          </View>
          <View style={[styles.resumenWebCard, columnas === 1 ? styles.resumenMitad : styles.resumenCuarto]}>
            <View style={styles.resumenCabecera}>
              <Text style={styles.resumenWebEtiqueta}>Marcos listos para usar</Text>
              <Text style={styles.resumenEmoji}>▦</Text>
            </View>
            <Text style={styles.resumenWebNumero}>{marcosListos}</Text>
            <Text style={styles.resumenWebDetalle}>vacíos y con cera (sin contar los de miel)</Text>
          </View>
          <View style={[styles.resumenWebCard, columnas === 1 ? styles.resumenMitad : styles.resumenCuarto]}>
            <View style={styles.resumenCabecera}>
              <Text style={styles.resumenWebEtiqueta}>Dañado</Text>
              <Text style={[styles.resumenEmoji, styles.rojo]}>⚠</Text>
            </View>
            <Text style={[styles.resumenWebNumero, styles.rojo]}>{totales.danado}</Text>
            <Text style={styles.resumenWebDetalle}>unidades por llevar a reparar</Text>
          </View>
          <View style={[styles.resumenWebCard, columnas === 1 ? styles.resumenMitad : styles.resumenCuarto]}>
            <View style={styles.resumenCabecera}>
              <Text style={styles.resumenWebEtiqueta}>En reparación</Text>
              <Text style={styles.resumenEmoji}>🔧</Text>
            </View>
            <Text style={styles.resumenWebNumero}>{totales.reparacion}</Text>
            <Text style={styles.resumenWebDetalle}>Merma acumulada {totales.merma}</Text>
          </View>
        </View>

        {materialesBajos.length > 0 && (
          <View style={styles.alerta}>
            <Text style={styles.alertaTitulo}>⚠ Materiales bajo el mínimo</Text>
            {materialesBajos.map(item => (
              <Text key={item.material} style={styles.alertaTexto}>
                {obtenerMaterial(item.material).texto}: {item.disponible} disponibles, mínimo {item.minimo}
              </Text>
            ))}
          </View>
        )}

        {/* INVENTARIO DE MATERIALES */}
        <View style={styles.barraBusqueda}>
          <Text style={styles.tituloSeccionWeb}>Inventario de materiales</Text>
          <TextInput
            style={styles.buscarWeb}
            placeholder="Buscar material..."
            placeholderTextColor={COLORS.textMuted}
            value={busqueda}
            onChangeText={setBusqueda}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.gridMateriales}>
          {stockOrdenado.length === 0 ? (
            <View style={styles.sinResultados}>
              <Text style={styles.vacioTitulo}>No hay materiales</Text>
              <Text style={styles.secundario}>
                {busqueda ? 'No hay coincidencias para la búsqueda.' : 'No hay inventario registrado.'}
              </Text>
            </View>
          ) : stockOrdenado.map(item => {
            const meta = obtenerMaterial(item.material);
            const bajo = item.minimo !== null && item.disponible < item.minimo;
            return (
              <View
                key={item.material}
                style={[
                  styles.materialWebCard,
                  columnas === 3 ? styles.tarjetaTresColumnas :
                    columnas === 2 ? styles.tarjetaDosColumnas : styles.tarjetaUnaColumna,
                ]}
              >
                <Text style={styles.materialNombreWeb}>{meta.texto}</Text>
                <Text style={[styles.materialCantidadWeb, bajo && styles.rojo]}>{item.disponible}</Text>
                <Text style={styles.materialDescripcionWeb}>disponibles en bodega</Text>
                <View style={styles.materialDetalleWeb}>
                  {meta.puedeDanarse ? (
                    <>
                      <View style={styles.lineaDato}>
                        <Text style={styles.lineaEtiqueta}>
                          {item.material === 'MARCO_VACIO' ? 'Rotos (por reparar)' : 'Dañados (por reparar)'}
                        </Text>
                        <Text style={[styles.lineaValor, item.danado > 0 && styles.rojo]}>{item.danado}</Text>
                      </View>
                      <View style={styles.lineaDato}>
                        <Text style={styles.lineaEtiqueta}>En reparación</Text>
                        <Text style={styles.lineaValor}>{item.en_reparacion}</Text>
                      </View>
                      <View style={styles.lineaDato}>
                        <Text style={styles.lineaEtiqueta}>Merma acumulada</Text>
                        <Text style={styles.lineaValor}>{item.merma}</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.leyendaMarco}>Si se rompe, cuenta como marco roto</Text>
                  )}
                </View>
                <View style={styles.materialPieWeb}>
                  <Text style={[styles.minimoWeb, bajo && styles.rojo]}>
                    {item.minimo === null ? 'Sin mínimo' : `Mínimo: ${item.minimo}`}
                  </Text>
                  {esAdmin ? (
                    <Pressable style={styles.minimoAccion} onPress={() => abrirMinimo(item)}>
                      <Text style={styles.minimoAccionTexto}>☷  Mínimo</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* DAÑADO Y REPARACIÓN: TABLA COMO EN LA WEB */}
        <View style={styles.panelWeb}>
          <View style={styles.panelEncabezado}>
            <Text style={styles.panelTitulo}>Dañado y en reparación</Text>
            <Text style={styles.panelSubtitulo}>
              El material dañado se lleva a reparar; si no tiene arreglo, va a merma.
            </Text>
          </View>
          {materialesReparacion.length === 0 ? (
            <Text style={styles.panelVacio}>No hay materiales dañados ni en reparación.</Text>
          ) : (
            <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator
              contentContainerStyle={styles.tablaScrollContenido}>
              <View style={{ width: anchoTablaReparacion }}>
                <View style={styles.reparacionHeader}>
                  <Text style={[styles.reparacionCeldaMaterial, styles.cabeceraTabla]}>Material</Text>
                  <Text style={[styles.reparacionCabeceraDanado, styles.cabeceraTabla]}>Dañado (por reparar)</Text>
                  <Text style={[styles.reparacionCabeceraProceso, styles.cabeceraTabla]}>En reparación</Text>
                </View>
                {materialesReparacion.map(item => {
                  const meta = obtenerMaterial(item.material);
                  return (
                    <View key={item.material} style={styles.reparacionFila}>
                      <Text style={styles.reparacionCeldaMaterial}>{meta.texto}</Text>
                      <View style={styles.reparacionCeldaDanado}>
                        <Text style={styles.reparacionDatoRojo}>
                          {item.danado} {meta.plural}
                        </Text>
                        {esAdmin && item.danado > 0 && (
                          <View style={styles.accionesEnCelda}>
                            <Pressable style={styles.botonAccionReparacion}
                              onPress={() => abrirAccionMaterial(item, 'ENVIO_REPARACION')}>
                              <Text style={styles.botonAccionTexto}>A reparación</Text>
                            </Pressable>
                            <Pressable style={styles.botonAccionSimple}
                              onPress={() => abrirAccionMaterial(item, 'DESCARTE', 'DANADO')}>
                              <Text style={styles.botonAccionSimpleTexto}>Merma</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                      <View style={styles.reparacionCeldaProceso}>
                        <Text style={styles.reparacionValor}>
                          {item.en_reparacion} {meta.plural}
                        </Text>
                        {esAdmin && item.en_reparacion > 0 && (
                          <View style={styles.accionesEnCelda}>
                            <Pressable style={styles.botonAccionReparacion}
                              onPress={() => abrirAccionMaterial(item, 'REPARACION')}>
                              <Text style={styles.botonAccionTexto}>Reparado</Text>
                            </Pressable>
                            <Pressable style={styles.botonAccionSimple}
                              onPress={() => abrirAccionMaterial(item, 'DESCARTE', 'EN_REPARACION')}>
                              <Text style={styles.botonAccionSimpleTexto}>Merma</Text>
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* HISTORIAL DE MOVIMIENTOS */}
        <View style={styles.panelWeb}>
          <View style={styles.panelEncabezado}>
            <Text style={styles.panelTitulo}>Historial de movimientos</Text>
            <Text style={styles.panelSubtitulo}>Ingresos, salidas, daños, reparaciones y merma.</Text>
          </View>
          {!historialDisponible ? (
            <Text style={styles.panelVacio}>{historialError || 'El historial no está disponible en el servidor.'}</Text>
          ) : (
            <>
              <View style={styles.filtrosHistorialWeb}>
                <View style={styles.filtrosWebFila}>
                  <Pressable style={[styles.campoFiltroWeb, styles.campoFiltroSelect, styles.campoFiltroAncho]}
                    onPress={() => setSelectorFiltro('material')}>
                    <Text style={styles.textoCampoFiltro} numberOfLines={1}>
                      {filtroMaterial ? obtenerMaterial(filtroMaterial).texto : 'Todos los materiales'}
                    </Text>
                    <Text style={styles.flechaFiltro}>⌄</Text>
                  </Pressable>
                  <Pressable style={[styles.campoFiltroWeb, styles.campoFiltroSelect, styles.campoFiltroAncho]}
                    onPress={() => setSelectorFiltro('tipo')}>
                    <Text style={styles.textoCampoFiltro} numberOfLines={1}>
                      {filtroTipo ? etiquetaMovimiento(filtroTipo) : 'Todos los movimientos'}
                    </Text>
                    <Text style={styles.flechaFiltro}>⌄</Text>
                  </Pressable>
                  <TextInput
                    style={[styles.campoFiltroWeb, styles.campoFiltroFecha]}
                    value={filtroDesde}
                    onChangeText={setFiltroDesde}
                    placeholder="dd-mm-aaaa"
                    placeholderTextColor="#637568"
                    maxLength={10}
                    keyboardType="numbers-and-punctuation"
                    onEndEditing={aplicarFiltros}
                  />
                  <TextInput
                    style={[styles.campoFiltroWeb, styles.campoFiltroFecha]}
                    value={filtroHasta}
                    onChangeText={setFiltroHasta}
                    placeholder="dd-mm-aaaa"
                    placeholderTextColor="#637568"
                    maxLength={10}
                    keyboardType="numbers-and-punctuation"
                    onEndEditing={aplicarFiltros}
                  />
                </View>
                {(filtroMaterial !== '' || filtroTipo !== '' || filtroDesde !== '' || filtroHasta !== '') && (
                  <Pressable style={styles.limpiarFiltrosEnlace} onPress={limpiarFiltros}>
                    <Text style={styles.limpiarFiltrosEnlaceTexto}>Limpiar filtros</Text>
                  </Pressable>
                )}
              </View>

              {historialCargando ? (
                <ActivityIndicator style={styles.cargandoHistorial} color={COLORS.gold} />
              ) : historialError ? (
                <View style={styles.errorCaja}>
                  <Text style={styles.errorTexto}>{historialError}</Text>
                  <Pressable onPress={() => void cargarHistorial(pagina, filtrosAplicados)}>
                    <Text style={styles.reintentar}>Reintentar</Text>
                  </Pressable>
                </View>
              ) : historial.length === 0 ? (
                <Text style={styles.panelVacio}>No hay movimientos para los filtros seleccionados.</Text>
              ) : (
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator
                  contentContainerStyle={styles.tablaScrollContenido}>
                  <View style={{ width: anchoTablaHistorial }}>
                    <View style={styles.tablaHeader}>
                      <Text style={[styles.histFecha, styles.headerText]}>Fecha</Text>
                      <Text style={[styles.histMovimiento, styles.headerText]}>Movimiento</Text>
                      <Text style={[styles.histMaterial, styles.headerText]}>Material</Text>
                      <Text style={[styles.histCantidad, styles.headerText]}>Cantidad</Text>
                      <Text style={[styles.histDestino, styles.headerText]}>Destino u origen</Text>
                      <Text style={[styles.histResponsable, styles.headerText]}>Responsable</Text>
                      <Text style={[styles.histObservaciones, styles.headerText]}>Observaciones</Text>
                    </View>
                    {historial.map(item => {
                      const cantidad = formatoCantidadMovimiento(item);
                      return (
                        <View key={item.id} style={styles.tablaFila}>
                          <Text style={styles.histFecha}>{formatearFecha(item.fecha)}</Text>
                          <View style={styles.histMovimiento}>
                            <View style={[styles.movEtiqueta, colorMovimiento(String(item.tipo))]}>
                              <Text style={styles.movEtiquetaTexto}>
                                {etiquetaMovimiento(String(item.tipo))}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.histMaterial}>{obtenerMaterial(item.material).texto}</Text>
                          <Text style={[
                            styles.histCantidad,
                            cantidad.startsWith('+') ? styles.cantidadPositiva :
                              cantidad.startsWith('-') ? styles.cantidadNegativa : styles.cantidadNeutra,
                          ]}>{cantidad}</Text>
                          <Text style={styles.histDestino}>{destinoMovimiento(item)}</Text>
                          <Text style={styles.histResponsable}>{responsableMovimiento(item)}</Text>
                          <Text style={styles.histObservaciones}>{item.observaciones || '—'}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
              {historial.length > 0 && (
                <View style={styles.paginacion}>
                  <Pressable style={[styles.botonPagina, pagina <= 1 && styles.botonPaginaDeshabilitado]} disabled={pagina <= 1 || historialCargando} onPress={() => void cargarHistorial(pagina - 1, filtrosAplicados)}>
                    <Text style={styles.textoPagina}>‹ Anterior</Text>
                  </Pressable>
                  <Text style={styles.numeroPagina}>Página {pagina}</Text>
                  <Pressable style={[styles.botonPagina, !haySiguiente && styles.botonPaginaDeshabilitado]} disabled={!haySiguiente || historialCargando} onPress={() => void cargarHistorial(pagina + 1, filtrosAplicados)}>
                    <Text style={styles.textoPagina}>Siguiente ›</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
      {/* ====================================
          MODALES
      ==================================== */}
      {/* Desplegables de filtros: selección táctil sin dependencias adicionales. */}
      <Modal
        visible={selectorFiltro !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectorFiltro(null)}
      >
        <View style={styles.selectorFondo}>
          <View style={styles.selectorCaja}>
            <View style={styles.selectorTituloFila}>
              <Text style={styles.selectorTitulo}>
                {selectorFiltro === 'material' ? 'Seleccionar material' : 'Tipo de movimiento'}
              </Text>
              <Pressable onPress={() => setSelectorFiltro(null)} style={styles.selectorCerrar}>
                <Text style={styles.selectorCerrarTexto}>✕</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator style={styles.selectorOpciones}>
              {selectorFiltro === 'material' ? (
                <>
                  <Pressable style={styles.selectorOpcion} onPress={() => elegirFiltroMaterial('')}>
                    <Text style={styles.selectorOpcionTexto}>Todos los materiales</Text>
                  </Pressable>
                  {MATERIALES.map(meta => (
                    <Pressable key={meta.valor} style={styles.selectorOpcion}
                      onPress={() => elegirFiltroMaterial(meta.valor)}>
                      <Text style={styles.selectorOpcionTexto}>{meta.texto}</Text>
                    </Pressable>
                  ))}
                </>
              ) : (
                <>
                  <Pressable style={styles.selectorOpcion} onPress={() => elegirFiltroTipo('')}>
                    <Text style={styles.selectorOpcionTexto}>Todos los movimientos</Text>
                  </Pressable>
                  {TIPOS_MOVIMIENTO.map(meta => (
                    <Pressable key={meta.valor} style={styles.selectorOpcion}
                      onPress={() => elegirFiltroTipo(meta.valor)}>
                      <Text style={styles.selectorOpcionTexto}>{meta.texto}</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={modal !== null}
        transparent
        animationType="slide"
        onRequestClose={cerrarModal}
      >
        <KeyboardAvoidingView
          style={styles.fondoModal}
          behavior={
            Platform.OS === 'ios'
              ? 'padding'
              : undefined
          }
        >
          <View style={styles.modal}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* MODAL MOVIMIENTO */}
              {modal === 'movimiento' && (
                <>
                  <Text style={styles.modalTitulo}>
                    Registrar movimiento
                  </Text>
                  <Text style={styles.label}>
                    Tipo de movimiento
                  </Text>
                  <View style={styles.opciones}>
                    {TIPOS_MOVIMIENTO.map(item => (
                      <Pressable
                        key={item.valor}
                        style={[
                          styles.opcion,
                          tipoMovimiento === item.valor &&
                            styles.opcionActiva,
                        ]}
                        onPress={() =>
                          cambiarTipoMovimiento(item.valor)
                        }
                      >
                        <Text style={[
                          styles.opcionTexto,
                          tipoMovimiento === item.valor &&
                            styles.opcionTextoActivo,
                        ]}>
                          {item.texto}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.ayuda}>
                    {
                      TIPOS_MOVIMIENTO.find(
                        item =>
                          item.valor === tipoMovimiento
                      )?.ayuda
                    }
                  </Text>
                  <Text style={styles.label}>
                    Material
                  </Text>
                  <View style={styles.opcionesMaterial}>
                    {materialesDisponibles.map(item => (
                      <Pressable
                        key={item.valor}
                        style={[
                          styles.opcionMaterial,
                          materialSeleccionado === item.valor &&
                            styles.opcionActiva,
                        ]}
                        onPress={() =>
                          setMaterialSeleccionado(item.valor)
                        }
                      >
                        <Text style={[
                          styles.opcionTexto,
                          materialSeleccionado === item.valor &&
                            styles.opcionTextoActivo,
                        ]}>
                          {item.texto}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.label}>
                    Cantidad *
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={cantidad}
                    onChangeText={setCantidad}
                    placeholder="Ej. 10"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                  {/* DESTINO PARA ENVIO */}
                  {tipoMovimiento === 'ENVIO' && (
                    <>
                      <Text style={styles.label}>
                        ID del apiario (opcional)
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={apiarioId}
                        onChangeText={setApiarioId}
                        placeholder="ID del apiario"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.label}>
                        ID de la colmena (opcional)
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={colmenaId}
                        onChangeText={setColmenaId}
                        placeholder="ID de la colmena"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.ayuda}>
                        Puedes registrar una salida general o indicar el destino.
                      </Text>
                    </>
                  )}
                  {/* ORIGEN DE MERMA */}
                  {tipoMovimiento === 'DESCARTE' && (
                    <>
                      <Text style={styles.label}>
                        Estado de origen *
                      </Text>
                      <View style={styles.opciones}>
                        <Pressable
                          style={[
                            styles.opcion,
                            estadoOrigen === 'DANADO' &&
                              styles.opcionActiva,
                          ]}
                          onPress={() =>
                            setEstadoOrigen('DANADO')
                          }
                        >
                          <Text style={[
                            styles.opcionTexto,
                            estadoOrigen === 'DANADO' &&
                              styles.opcionTextoActivo,
                          ]}>
                            Dañado
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.opcion,
                            estadoOrigen === 'EN_REPARACION' &&
                              styles.opcionActiva,
                          ]}
                          onPress={() =>
                            setEstadoOrigen('EN_REPARACION')
                          }
                        >
                          <Text style={[
                            styles.opcionTexto,
                            estadoOrigen === 'EN_REPARACION' &&
                              styles.opcionTextoActivo,
                          ]}>
                            En reparación
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                  <Text style={styles.label}>
                    Observaciones
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      styles.multilinea,
                    ]}
                    value={observaciones}
                    onChangeText={setObservaciones}
                    placeholder="Información adicional..."
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    maxLength={500}
                  />
                </>
              )}
              {/* MODAL MINIMO */}
              {modal === 'minimo' && (
                <>
                  <Text style={styles.modalTitulo}>
                    Configurar stock mínimo
                  </Text>
                  <Text style={styles.subtituloModal}>
                    {obtenerMaterial(materialSeleccionado).texto}
                  </Text>
                  <Text style={styles.label}>
                    Cantidad mínima
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={minimoTexto}
                    onChangeText={setMinimoTexto}
                    placeholder="Ej. 20"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                  <Text style={styles.ayuda}>
                    Ingresa un número igual o mayor a cero. Deja el campo vacío para quitar el mínimo.
                  </Text>
                </>
              )}
              {/* BOTONES */}
              <View style={styles.accionesModal}>
                <Pressable
                  style={styles.botonCancelar}
                  onPress={cerrarModal}
                  disabled={guardando}
                >
                  <Text style={styles.textoCancelar}>
                    Cancelar
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.botonGuardar}
                  disabled={guardando}
                  onPress={() => {
                    if (modal === 'movimiento') {
                      void guardarMovimiento();
                    }
                    if (modal === 'minimo') {
                      void guardarMinimo();
                    }
                  }}
                >
                  {guardando ? (
                    <ActivityIndicator
                      color={COLORS.forest}
                    />
                  ) : (
                    <Text style={styles.textoGuardar}>
                      Guardar
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
// ==========================================
// ESTILOS
// ==========================================
const styles = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contenido: {
    padding: 18,
    paddingBottom: 45,
  },
  cargando: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  secundario: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 7,
    textAlign: 'center',
    lineHeight: 19,
  },
  volver: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
    marginBottom: 17,
  },
  volverTexto: {
    color: COLORS.text,
    fontWeight: '700',
  },
  titulo: {
    fontSize: 27,
    fontWeight: '800',
    color: COLORS.forest,
  },
  subtitulo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 5,
  },
  resumen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    marginBottom: 8,
    gap: 8,
  },
  resumenCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  numero: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.forest,
  },
  resumenTexto: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 5,
  },
  rojo: {
    color: COLORS.danger,
  },
  naranja: {
    color: COLORS.warning,
  },
  gris: {
    color: COLORS.textSecondary,
  },
  alerta: {
    backgroundColor: COLORS.goldSoft,
    borderWidth: 1,
    borderColor: COLORS.warningBg,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  alertaTitulo: {
    color: COLORS.goldText,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 7,
  },
  alertaTexto: {
    color: COLORS.goldText,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 3,
  },
  botonNuevo: {
    backgroundColor: COLORS.gold,
    borderRadius: 11,
    padding: 15,
    alignItems: 'center',
    marginTop: 15,
  },
  botonNuevoTexto: {
    color: COLORS.forest,
    fontWeight: '800',
    fontSize: 14,
  },
  buscador: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    padding: 13,
    color: COLORS.forest,
    fontSize: 14,
    marginTop: 15,
  },
  seccion: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.forest,
    marginTop: 22,
    marginBottom: 8,
  },
  descripcionSeccion: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  tarjeta: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    padding: 15,
    marginTop: 11,
  },
  filaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconoMaterial: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconoMaterialTexto: {
    fontSize: 21,
  },
  infoMaterial: {
    flex: 1,
    minWidth: 0,
  },
  nombreMaterial: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.forest,
  },
  codigoMaterial: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  estadoBajo: {
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  estadoBajoTexto: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '800',
  },
  estadisticas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 17,
    gap: 7,
  },
  estadistica: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: COLORS.backgroundSoft,
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 5,
    alignItems: 'center',
  },
  estadisticaNumero: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.forest,
  },
  estadisticaTexto: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  pieTarjeta: {
    marginTop: 13,
  },
  minimoTexto: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  fecha: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 5,
  },
  botonMinimo: {
    backgroundColor: COLORS.goldSoft,
    padding: 11,
    borderRadius: 9,
    alignItems: 'center',
    marginTop: 12,
  },
  textoBotonMinimo: {
    color: COLORS.goldText,
    fontSize: 12,
    fontWeight: '800',
  },
  separador: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 25,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 13,
    marginBottom: 7,
  },
  filtrosFila: {
    flexDirection: 'row',
    gap: 7,
    paddingVertical: 5,
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 20,
  },
  chipActivo: {
    backgroundColor: COLORS.goldSoft,
    borderColor: COLORS.gold,
  },
  chipTexto: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  chipTextoActivo: {
    color: COLORS.goldText,
  },
  fechasFila: {
    flexDirection: 'row',
    gap: 9,
  },
  fechaCampo: {
    flex: 1,
  },
  input: {
    backgroundColor: COLORS.backgroundSoft,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 10,
    padding: 12,
    color: COLORS.forest,
    fontSize: 14,
  },
  accionesFiltros: {
    flexDirection: 'row',
    marginTop: 13,
    gap: 9,
  },
  botonAplicar: {
    flex: 1,
    backgroundColor: COLORS.forest,
    padding: 12,
    borderRadius: 9,
    alignItems: 'center',
  },
  textoBotonAplicar: {
    color: COLORS.surface,
    fontWeight: '800',
    fontSize: 12,
  },
  botonLimpiar: {
    backgroundColor: COLORS.border,
    padding: 12,
    borderRadius: 9,
    alignItems: 'center',
  },
  textoBotonLimpiar: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 12,
  },
  tarjetaHistorial: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    padding: 14,
    marginTop: 10,
  },
  cantidadMovimiento: {
    backgroundColor: COLORS.goldSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
  },
  cantidadMovimientoTexto: {
    color: COLORS.goldText,
    fontSize: 11,
    fontWeight: '800',
  },
  fechaHistorial: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 12,
  },
  detalleHistorial: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 6,
  },
  usuarioHistorial: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 9,
  },
  cargandoHistorial: {
    marginVertical: 25,
  },
  paginacion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 17,
  },
  botonPagina: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
  },
  botonPaginaDeshabilitado: {
    opacity: 0.4,
  },
  textoPagina: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '800',
  },
  numeroPagina: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  vacio: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 25,
    alignItems: 'center',
    marginTop: 12,
  },
  vacioIcono: {
    fontSize: 30,
    marginBottom: 9,
  },
  vacioTitulo: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.forest,
    marginBottom: 5,
  },
  errorCaja: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.dangerBg,
    borderRadius: 11,
    padding: 13,
    marginTop: 12,
  },
  errorTexto: {
    color: COLORS.danger,
    fontSize: 12,
  },
  reintentar: {
    color: COLORS.danger,
    fontWeight: '800',
    marginTop: 8,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    maxHeight: '92%',
  },
  modalTitulo: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.forest,
    marginBottom: 15,
  },
  subtituloModal: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  opciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  opcion: {
    backgroundColor: COLORS.backgroundSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 9,
  },
  opcionActiva: {
    backgroundColor: COLORS.goldSoft,
    borderColor: COLORS.gold,
  },
  opcionTexto: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  opcionTextoActivo: {
    color: COLORS.goldText,
  },
  opcionesMaterial: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  opcionMaterial: {
    backgroundColor: COLORS.backgroundSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 9,
  },
  ayuda: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  multilinea: {
    minHeight: 85,
    textAlignVertical: 'top',
  },
  accionesModal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 22,
    marginBottom: 5,
    gap: 9,
  },
  botonCancelar: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textoCancelar: {
    color: COLORS.text,
    fontWeight: '700',
  },
  botonGuardar: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: 110,
    alignItems: 'center',
  },
  textoGuardar: {
    color: COLORS.forest,
    fontWeight: '800',
  },
  // Paleta y distribución fieles a la web, pero responsivas para tablets.
  contenidoWeb: { padding: 14, paddingBottom: 50, backgroundColor: '#F2F0E9' },
  cabeceraMovil: { paddingHorizontal: 4, paddingTop: 3, marginBottom: 16 },
  volverWeb: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 7 },
  volverWebTexto: { color: '#214736', fontWeight: '700', fontSize: 14 },
  tituloWeb: { color: '#102D20', fontSize: 23, fontWeight: '800' },
  marcaWeb: { color: '#6E766D', fontSize: 11, marginTop: 1 },
  barraIntro: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  introTexto: { flex: 1, minWidth: 200, color: '#667168', fontSize: 12, lineHeight: 18 },
  botonRegistrarWeb: { backgroundColor: '#F6A51D', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  botonRegistrarTexto: { color: '#172C20', fontWeight: '800', fontSize: 12 },
  resumenWeb: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 13 },
  resumenWebCard: { backgroundColor: '#FFFFFF', borderColor: '#E8E5DE', borderWidth: 1, borderRadius: 11, padding: 12, minHeight: 105 },
  resumenMitad: { width: '48.5%' },
  resumenCuarto: { width: '24%' },
  resumenCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 5 },
  resumenWebEtiqueta: { color: '#3F5548', fontSize: 10, flex: 1 },
  resumenEmoji: { color: '#AE7420', fontSize: 17, backgroundColor: '#FFF3D8', borderRadius: 7, overflow: 'hidden', paddingHorizontal: 5 },
  resumenWebNumero: { color: '#092B1F', fontWeight: '900', fontSize: 23, marginTop: 3 },
  resumenWebDetalle: { color: '#7C837C', fontSize: 9, lineHeight: 13, marginTop: 1 },
  barraBusqueda: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 10, gap: 9 },
  tituloSeccionWeb: { fontSize: 16, fontWeight: '800', color: '#18382A' },
  buscarWeb: { minWidth: 160, flexGrow: 1, maxWidth: 300, backgroundColor: '#FFFFFF', color: '#15372A', borderColor: '#DEDCD5', borderWidth: 1, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12, fontSize: 12 },
  gridMateriales: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 18 },
  materialWebCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E2DA', borderRadius: 11, padding: 13, minHeight: 184 },
  tarjetaTresColumnas: { width: '32.3%' },
  tarjetaDosColumnas: { width: '49%' },
  tarjetaUnaColumna: { width: '100%' },
  materialNombreWeb: { color: '#355244', fontSize: 12, marginBottom: 7 },
  materialCantidadWeb: { color: '#0C3424', fontSize: 23, fontWeight: '900' },
  materialDescripcionWeb: { color: '#7A827C', fontSize: 10, marginBottom: 8 },
  materialDetalleWeb: { borderTopColor: '#EFEDE8', borderTopWidth: 1, paddingTop: 8, flexGrow: 1, justifyContent: 'center' },
  lineaDato: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 5, marginVertical: 3 },
  lineaEtiqueta: { color: '#53675B', fontSize: 10, flex: 1 },
  lineaValor: { color: '#274737', fontSize: 10, fontWeight: '600' },
  leyendaMarco: { color: '#8A8E88', fontSize: 10, marginVertical: 3 },
  materialPieWeb: { borderTopColor: '#EFEDE8', borderTopWidth: 1, marginTop: 8, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  minimoWeb: { fontSize: 10, color: '#668074' },
  minimoAccion: { paddingVertical: 4, paddingHorizontal: 3 },
  minimoAccionTexto: { fontSize: 10, color: '#55675E' },
  sinResultados: { backgroundColor: '#FFFFFF', padding: 20, width: '100%', borderRadius: 10, alignItems: 'center' },
  panelWeb: { backgroundColor: '#FFFFFF', borderColor: '#E4E1D9', borderWidth: 1, borderRadius: 11, marginBottom: 17, overflow: 'hidden' },
  panelEncabezado: { padding: 13, borderBottomColor: '#ECE9E2', borderBottomWidth: 1 },
  panelTitulo: { fontSize: 13, fontWeight: '800', color: '#234534' },
  panelSubtitulo: { color: '#6C796E', fontSize: 10, lineHeight: 16, marginTop: 3 },
  panelVacio: { paddingVertical: 18, paddingHorizontal: 13, fontSize: 12, color: '#6C796E' },
  tablaScrollContenido: { flexGrow: 1 },
  reparacionHeader: {
    flexDirection: 'row', backgroundColor: '#F9F7F1', paddingVertical: 15,
    paddingHorizontal: 15, borderBottomColor: '#E5E1D7', borderBottomWidth: 1,
    alignItems: 'center',
  },
  cabeceraTabla: { color: '#52675C', fontSize: 12, fontWeight: '500' },
  reparacionFila: {
    paddingVertical: 14, paddingHorizontal: 15, minHeight: 64,
    borderBottomWidth: 1, borderBottomColor: '#EDEAE3',
    flexDirection: 'row', alignItems: 'center',
  },
  reparacionCeldaMaterial: { width: '17%', color: '#153A2B', fontSize: 12, fontWeight: '500' },
  reparacionCeldaDanado: { width: '60%', flexDirection: 'row', alignItems: 'center', gap: 25 },
  reparacionCeldaProceso: { width: '23%', flexDirection: 'row', alignItems: 'center', gap: 14 },
  reparacionCabeceraDanado: { width: '60%' },
  reparacionCabeceraProceso: { width: '23%' },
  reparacionDatoRojo: { color: '#D52327', fontSize: 12, fontWeight: '700' },
  reparacionValor: { color: '#A0A9A0', fontSize: 12 },
  accionesEnCelda: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  botonAccionReparacion: {
    borderWidth: 1, borderColor: '#D6D2C6', backgroundColor: '#FFFFFF',
    paddingVertical: 9, paddingHorizontal: 13, borderRadius: 9,
  },
  botonAccionTexto: { color: '#223D30', fontSize: 11, fontWeight: '500' },
  botonAccionSimple: { paddingVertical: 10, paddingHorizontal: 10 },
  botonAccionSimpleTexto: { color: '#4F6759', fontSize: 11 },
  filtrosHistorialWeb: {
    padding: 13, borderBottomWidth: 1, borderBottomColor: '#EAE7DE',
  },
  filtrosWebFila: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    justifyContent: 'space-between', gap: 8,
  },
  campoFiltroWeb: {
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CFCFC6',
    borderRadius: 7, minHeight: 42, paddingHorizontal: 12, color: '#324E3D', fontSize: 12,
  },
  campoFiltroSelect: { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' },
  campoFiltroAncho: { width: '24%', minWidth: 145 },
  campoFiltroFecha: { width: '24%', minWidth: 145 },
  textoCampoFiltro: { flex: 1, color: '#304C3B', fontSize: 12 },
  flechaFiltro: { color: '#284F39', fontSize: 18, marginLeft: 4 },
  limpiarFiltrosEnlace: { alignSelf: 'flex-end', marginTop: 8, paddingVertical: 3 },
  limpiarFiltrosEnlaceTexto: { fontSize: 11, color: '#65796A', textDecorationLine: 'underline' },
  tablaHistorial: { width: '100%' },
  tablaHeader: {
    flexDirection: 'row', backgroundColor: '#FAF9F5', alignItems: 'center',
    minHeight: 49, paddingVertical: 12, paddingHorizontal: 15,
  },
  headerText: { color: '#51695B', fontWeight: '500', fontSize: 12 },
  tablaFila: {
    flexDirection: 'row', alignItems: 'center', borderTopWidth: 1,
    borderTopColor: '#EDEAE4', minHeight: 51, paddingVertical: 12,
    paddingHorizontal: 15, backgroundColor: '#FFFFFF',
  },
  histFecha: { width: '14.2%', color: '#455D52', fontSize: 11, paddingRight: 8, lineHeight: 17 },
  histMovimiento: { width: '12%', paddingRight: 7 },
  histMaterial: { width: '16.2%', color: '#244837', fontSize: 11, paddingRight: 8, lineHeight: 17 },
  histCantidad: { width: '6%', fontSize: 11, paddingRight: 8, textAlign: 'right' },
  histDestino: { width: '11%', color: '#335543', fontSize: 11, paddingRight: 8, lineHeight: 17 },
  histResponsable: { width: '15%', color: '#365A49', fontSize: 11, paddingRight: 8, lineHeight: 17 },
  histObservaciones: { width: '25.6%', color: '#375445', fontSize: 11, lineHeight: 17 },
  cantidadPositiva: { color: '#00A46A', fontWeight: '700' },
  cantidadNegativa: { color: '#1C4534', fontWeight: '700' },
  cantidadNeutra: { color: '#1C4534', fontWeight: '700' },
  selectorFondo: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  selectorCaja: {
    width: '100%', maxWidth: 420, maxHeight: '75%', borderRadius: 14,
    backgroundColor: '#FFFFFF', padding: 16,
  },
  selectorTituloFila: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 9,
  },
  selectorTitulo: { color: '#143824', fontSize: 15, fontWeight: '800' },
  selectorCerrar: { padding: 8 },
  selectorCerrarTexto: { color: '#274735', fontSize: 17 },
  selectorOpciones: { maxHeight: 400 },
  selectorOpcion: { paddingVertical: 12, borderBottomColor: '#EEEDE9', borderBottomWidth: 1 },
  selectorOpcionTexto: { color: '#30503E', fontSize: 13 },
  movEtiqueta: { borderWidth: 1, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 6, paddingVertical: 3 },
  movEtiquetaTexto: { fontSize: 9, color: '#365343' },
  movVerde: { backgroundColor: '#EDFFF6', borderColor: '#AAEBCF' },
  movRojo: { backgroundColor: '#FFF0F0', borderColor: '#FFB3B3' },
  movAmarillo: { backgroundColor: '#FFF6E7', borderColor: '#FFE1A6' },
  movNeutro: { backgroundColor: '#F1F3F1', borderColor: '#D8DEDA' },
  cantidadTexto: { color: '#138151', fontSize: 12, fontWeight: '800' },
  historialMovil: { padding: 10 },
  historialCardWeb: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7E7E0', borderRadius: 10, padding: 12, marginBottom: 9 },
  historialSuperior: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  historialFechaWeb: { color: '#6C7D71', fontSize: 10 },
  historialMaterialWeb: { color: '#28503A', fontWeight: '800', fontSize: 13, marginTop: 8, marginBottom: 4 },
  historialDetalleWeb: { color: '#5D7264', fontSize: 10, lineHeight: 15, marginTop: 5 },

});
