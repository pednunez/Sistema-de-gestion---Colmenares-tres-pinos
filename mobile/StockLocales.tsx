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
  )!;
}

function formatearFecha(
  fecha?: string | null
): string {

  if (!fecha) {
    return 'No disponible';
  }

  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return fecha;
  }

  return valor.toLocaleString('es-CL');
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
  // APLICAR FILTROS DEL HISTORIAL
  // ========================================

  const aplicarFiltros = () => {

    const desde = filtroDesde.trim();
    const hasta = filtroHasta.trim();

    if (
      !validarFecha(desde) ||
      !validarFecha(hasta)
    ) {

      Alert.alert(
        'Fecha inválida',
        'Utiliza el formato AAAA-MM-DD.'
      );

      return;
    }

    if (
      desde &&
      hasta &&
      desde > hasta
    ) {

      Alert.alert(
        'Rango inválido',
        'La fecha inicial no puede ser posterior a la fecha final.'
      );

      return;
    }

    const filtros: FiltrosHistorialStock = {

      material:
        filtroMaterial || undefined,

      tipo:
        filtroTipo || undefined,

      desde:
        desde || undefined,

      hasta:
        hasta || undefined,

    };

    setFiltrosAplicados(filtros);

    void cargarHistorial(1, filtros);
  };

  // ========================================
  // LIMPIAR FILTROS
  // ========================================

  const limpiarFiltros = () => {

    setFiltroMaterial('');
    setFiltroTipo('');
    setFiltroDesde('');
    setFiltroHasta('');

    setFiltrosAplicados({});

    void cargarHistorial(1, {});
  };

  // ========================================
  // CARGANDO
  // ========================================

  if (cargando && stock.length === 0) {

    return (

      <View style={styles.cargando}>

        <ActivityIndicator
          size="large"
          color={COLORS.gold}
        />

        <Text style={styles.secundario}>
          Cargando inventario...
        </Text>

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

        keyboardShouldPersistTaps="handled"

        refreshControl={

          <RefreshControl

            refreshing={actualizando}

            onRefresh={recargarTodo}

            colors={[COLORS.gold]}

          />

        }

      >

        {/* ENCABEZADO */}

        <Pressable
          onPress={onVolver}
          style={styles.volver}
        >

          <Text style={styles.volverTexto}>
            ‹ Volver
          </Text>

        </Pressable>

        <Text style={styles.titulo}>
          Stock de bodega
        </Text>

        <Text style={styles.subtitulo}>
          Control de existencias y movimientos de materiales
        </Text>

        {/* RESUMEN */}

        <View style={styles.resumen}>

          <View style={styles.resumenCard}>

            <Text style={styles.numero}>
              {totales.disponible}
            </Text>

            <Text style={styles.resumenTexto}>
              Disponibles
            </Text>

          </View>

          <View style={styles.resumenCard}>

            <Text style={[
              styles.numero,
              styles.rojo,
            ]}>
              {totales.danado}
            </Text>

            <Text style={styles.resumenTexto}>
              Dañados
            </Text>

          </View>

          <View style={styles.resumenCard}>

            <Text style={[
              styles.numero,
              styles.naranja,
            ]}>
              {totales.reparacion}
            </Text>

            <Text style={styles.resumenTexto}>
              En reparación
            </Text>

          </View>

          <View style={styles.resumenCard}>

            <Text style={[
              styles.numero,
              styles.gris,
            ]}>
              {totales.merma}
            </Text>

            <Text style={styles.resumenTexto}>
              Merma
            </Text>

          </View>

        </View>

        {/* ALERTAS */}

        {materialesBajos.length > 0 && (

          <View style={styles.alerta}>

            <Text style={styles.alertaTitulo}>
              ⚠ Stock bajo
            </Text>

            {materialesBajos.map(item => (

              <Text
                key={item.material}
                style={styles.alertaTexto}
              >
                {obtenerMaterial(item.material).texto}:
                {' '}{item.disponible}
                {' '}disponibles de un mínimo de
                {' '}{item.minimo}.
              </Text>

            ))}

          </View>

        )}

        {/* REGISTRAR MOVIMIENTO */}

        {esAdmin && (

          <Pressable
            style={styles.botonNuevo}
            onPress={abrirMovimiento}
          >

            <Text style={styles.botonNuevoTexto}>
              + Registrar movimiento
            </Text>

          </Pressable>

        )}

        {/* BUSCADOR */}

        <TextInput

          style={styles.buscador}

          placeholder="Buscar material..."

          placeholderTextColor={COLORS.textMuted}

          value={busqueda}

          onChangeText={setBusqueda}

          autoCapitalize="none"

        />

        {/* INVENTARIO */}

        <Text style={styles.seccion}>
          Inventario de materiales
        </Text>

        {!!error && (

          <View style={styles.errorCaja}>

            <Text style={styles.errorTexto}>
              {error}
            </Text>

            <Pressable
              onPress={() => {
                void cargarStock(false);
              }}
            >

              <Text style={styles.reintentar}>
                Reintentar
              </Text>

            </Pressable>

          </View>

        )}

        {stockFiltrado.length === 0 ? (

          <View style={styles.vacio}>

            <Text style={styles.vacioIcono}>
              📦
            </Text>

            <Text style={styles.vacioTitulo}>
              No hay materiales
            </Text>

            <Text style={styles.secundario}>
              {busqueda
                ? 'No encontramos coincidencias.'
                : 'No hay materiales registrados en el inventario.'}
            </Text>

          </View>

        ) : (

          stockFiltrado.map(item => {

            const meta = obtenerMaterial(
              item.material
            );

            const bajoMinimo =
              item.minimo !== null &&
              item.disponible < item.minimo;

            return (

              <View
                key={item.material}
                style={styles.tarjeta}
              >

                <View style={styles.filaTitulo}>

                  <View style={styles.iconoMaterial}>

                    <Text style={styles.iconoMaterialTexto}>
                      📦
                    </Text>

                  </View>

                  <View style={styles.infoMaterial}>

                    <Text style={styles.nombreMaterial}>
                      {meta.texto}
                    </Text>

                    <Text style={styles.codigoMaterial}>
                      {item.material}
                    </Text>

                  </View>

                  {bajoMinimo && (

                    <View style={styles.estadoBajo}>

                      <Text style={styles.estadoBajoTexto}>
                        Stock bajo
                      </Text>

                    </View>

                  )}

                </View>

                <View style={styles.estadisticas}>

                  <View style={styles.estadistica}>

                    <Text style={styles.estadisticaNumero}>
                      {item.disponible}
                    </Text>

                    <Text style={styles.estadisticaTexto}>
                      Disponibles
                    </Text>

                  </View>

                  <View style={styles.estadistica}>

                    <Text style={[
                      styles.estadisticaNumero,
                      styles.rojo,
                    ]}>
                      {item.danado}
                    </Text>

                    <Text style={styles.estadisticaTexto}>
                      Dañados
                    </Text>

                  </View>

                  <View style={styles.estadistica}>

                    <Text style={[
                      styles.estadisticaNumero,
                      styles.naranja,
                    ]}>
                      {item.en_reparacion}
                    </Text>

                    <Text style={styles.estadisticaTexto}>
                      Reparación
                    </Text>

                  </View>

                  <View style={styles.estadistica}>

                    <Text style={[
                      styles.estadisticaNumero,
                      styles.gris,
                    ]}>
                      {item.merma}
                    </Text>

                    <Text style={styles.estadisticaTexto}>
                      Merma
                    </Text>

                  </View>

                </View>

                <View style={styles.pieTarjeta}>

                  <Text style={styles.minimoTexto}>
                    Mínimo:{' '}
                    {item.minimo === null
                      ? 'Sin configurar'
                      : item.minimo}
                  </Text>

                  <Text style={styles.fecha}>
                    Actualizado:{' '}
                    {formatearFecha(item.actualizado_en)}
                  </Text>

                </View>

                {esAdmin && (

                  <Pressable
                    style={styles.botonMinimo}
                    onPress={() => abrirMinimo(item)}
                  >

                    <Text style={styles.textoBotonMinimo}>
                      Configurar mínimo
                    </Text>

                  </Pressable>

                )}

              </View>

            );
          })

        )}

        {/* ====================================
            HISTORIAL
        ==================================== */}

        <View style={styles.separador} />

        <Text style={styles.seccion}>
          Historial de movimientos
        </Text>

        <Text style={styles.descripcionSeccion}>
          Consulta los movimientos registrados en la bodega.
        </Text>

        {!historialDisponible ? (

          <View style={styles.vacio}>

            <Text style={styles.vacioTitulo}>
              Historial no disponible
            </Text>

            <Text style={styles.secundario}>
              {historialError}
            </Text>

          </View>

        ) : (

          <>

            {/* FILTRO MATERIAL */}

            <Text style={styles.label}>
              Filtrar por material
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtrosFila}
            >

              <Pressable
                style={[
                  styles.chip,
                  filtroMaterial === '' &&
                    styles.chipActivo,
                ]}
                onPress={() => setFiltroMaterial('')}
              >

                <Text style={[
                  styles.chipTexto,
                  filtroMaterial === '' &&
                    styles.chipTextoActivo,
                ]}>
                  Todos
                </Text>

              </Pressable>

              {MATERIALES.map(item => (

                <Pressable
                  key={item.valor}
                  style={[
                    styles.chip,
                    filtroMaterial === item.valor &&
                      styles.chipActivo,
                  ]}
                  onPress={() =>
                    setFiltroMaterial(item.valor)
                  }
                >

                  <Text style={[
                    styles.chipTexto,
                    filtroMaterial === item.valor &&
                      styles.chipTextoActivo,
                  ]}>
                    {item.texto}
                  </Text>

                </Pressable>

              ))}

            </ScrollView>

            {/* FILTRO TIPO */}

            <Text style={styles.label}>
              Filtrar por movimiento
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtrosFila}
            >

              <Pressable
                style={[
                  styles.chip,
                  filtroTipo === '' &&
                    styles.chipActivo,
                ]}
                onPress={() => setFiltroTipo('')}
              >

                <Text style={[
                  styles.chipTexto,
                  filtroTipo === '' &&
                    styles.chipTextoActivo,
                ]}>
                  Todos
                </Text>

              </Pressable>

              {TIPOS_MOVIMIENTO.map(item => (

                <Pressable
                  key={item.valor}
                  style={[
                    styles.chip,
                    filtroTipo === item.valor &&
                      styles.chipActivo,
                  ]}
                  onPress={() =>
                    setFiltroTipo(item.valor)
                  }
                >

                  <Text style={[
                    styles.chipTexto,
                    filtroTipo === item.valor &&
                      styles.chipTextoActivo,
                  ]}>
                    {item.texto}
                  </Text>

                </Pressable>

              ))}

            </ScrollView>

            {/* FILTRO FECHAS */}

            <View style={styles.fechasFila}>

              <View style={styles.fechaCampo}>

                <Text style={styles.label}>
                  Desde
                </Text>

                <TextInput
                  style={styles.input}
                  value={filtroDesde}
                  onChangeText={setFiltroDesde}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={10}
                  autoCapitalize="none"
                />

              </View>

              <View style={styles.fechaCampo}>

                <Text style={styles.label}>
                  Hasta
                </Text>

                <TextInput
                  style={styles.input}
                  value={filtroHasta}
                  onChangeText={setFiltroHasta}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={10}
                  autoCapitalize="none"
                />

              </View>

            </View>

            <View style={styles.accionesFiltros}>

              <Pressable
                style={styles.botonAplicar}
                onPress={aplicarFiltros}
              >

                <Text style={styles.textoBotonAplicar}>
                  Aplicar filtros
                </Text>

              </Pressable>

              <Pressable
                style={styles.botonLimpiar}
                onPress={limpiarFiltros}
              >

                <Text style={styles.textoBotonLimpiar}>
                  Limpiar
                </Text>

              </Pressable>

            </View>

            {/* LISTADO HISTORIAL */}

            {historialCargando ? (

              <ActivityIndicator
                color={COLORS.gold}
                size="small"
                style={styles.cargandoHistorial}
              />

            ) : historialError ? (

              <View style={styles.errorCaja}>

                <Text style={styles.errorTexto}>
                  {historialError}
                </Text>

                <Pressable
                  onPress={() => {
                    void cargarHistorial(
                      pagina,
                      filtrosAplicados
                    );
                  }}
                >

                  <Text style={styles.reintentar}>
                    Reintentar
                  </Text>

                </Pressable>

              </View>

            ) : historial.length === 0 ? (

              <View style={styles.vacio}>

                <Text style={styles.vacioTitulo}>
                  Sin movimientos
                </Text>

                <Text style={styles.secundario}>
                  No existen movimientos para los filtros seleccionados.
                </Text>

              </View>

            ) : (

              historial.map(item => (

                <View
                  key={item.id}
                  style={styles.tarjetaHistorial}
                >

                  <View style={styles.filaTitulo}>

                    <View style={styles.infoMaterial}>

                      <Text style={styles.nombreMaterial}>
                        {ETIQUETAS_TIPO[item.tipo]}
                      </Text>

                      <Text style={styles.codigoMaterial}>
                        {obtenerMaterial(item.material).texto}
                      </Text>

                    </View>

                    <View style={styles.cantidadMovimiento}>

                      <Text style={styles.cantidadMovimientoTexto}>
                        {item.cantidad} unidades
                      </Text>

                    </View>

                  </View>

                  <Text style={styles.fechaHistorial}>
                    {formatearFecha(item.fecha)}
                  </Text>

                  {!!item.apiario_id && (

                    <Text style={styles.detalleHistorial}>
                      Apiario ID: {item.apiario_id}
                    </Text>

                  )}

                  {!!item.colmena_id && (

                    <Text style={styles.detalleHistorial}>
                      Colmena ID: {item.colmena_id}
                    </Text>

                  )}

                  {!!item.estado_origen && (

                    <Text style={styles.detalleHistorial}>
                      Origen: {
                        item.estado_origen === 'DANADO'
                          ? 'Dañado'
                          : 'En reparación'
                      }
                    </Text>

                  )}

                  {!!item.observaciones && (

                    <Text style={styles.detalleHistorial}>
                      {item.observaciones}
                    </Text>

                  )}

                  <Text style={styles.usuarioHistorial}>
                    Usuario ID: {item.usuario_id}
                  </Text>

                </View>

              ))

            )}

            {/* PAGINACION */}

            {historial.length > 0 && (

              <View style={styles.paginacion}>

                <Pressable
                  style={[
                    styles.botonPagina,
                    pagina <= 1 &&
                      styles.botonPaginaDeshabilitado,
                  ]}
                  disabled={pagina <= 1 || historialCargando}
                  onPress={() => {
                    void cargarHistorial(
                      pagina - 1,
                      filtrosAplicados
                    );
                  }}
                >

                  <Text style={styles.textoPagina}>
                    ‹ Anterior
                  </Text>

                </Pressable>

                <Text style={styles.numeroPagina}>
                  Página {pagina}
                </Text>

                <Pressable
                  style={[
                    styles.botonPagina,
                    !haySiguiente &&
                      styles.botonPaginaDeshabilitado,
                  ]}
                  disabled={!haySiguiente || historialCargando}
                  onPress={() => {
                    void cargarHistorial(
                      pagina + 1,
                      filtrosAplicados
                    );
                  }}
                >

                  <Text style={styles.textoPagina}>
                    Siguiente ›
                  </Text>

                </Pressable>

              </View>

            )}

          </>

        )}

      </ScrollView>

      {/* ====================================
          MODALES
      ==================================== */}

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

});