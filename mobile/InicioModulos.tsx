import React, { useEffect, useMemo, useRef, useState } from 'react';

import { COLORS } from './theme';

import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  leerCatalogoLocal,
} from './database/catalogo';

import type {
  CatalogoMovil,
  ColmenaCatalogo,
} from './database/catalogo';

import {
  leerSesionGuardada,
  tokenVigente,
} from './api/auth';

import {
  listarInspeccionesServidor,
} from './api/inspecciones';

import type {
  InspeccionDashboardServidor,
} from './api/inspecciones';

import {
  listarInspeccionesDashboardLocales,
} from './database/inspeccionesAvanzadas';

import {
  guardarInspeccionesServidorDashboard,
  leerInspeccionesServidorDashboard,
} from './database/inspeccionesServidor';

import {
  obtenerStock,
} from './api/stock';

import type {
  StockResumen,
} from './api/stock';

import {
  guardarStockDashboard,
  leerStockDashboard,
} from './database/stockCache';

import {
  useConexion,
} from './sincronizacion/conectividad';

import {
  solicitarAPI,
} from './api/cliente';

// ==========================================
// COLMENARES TRES PINOS
// DASHBOARD MOBILE CON FUNCIONALIDADES WEB
// ==========================================

type ColmenaDashboard = CatalogoMovil['colmenas'][number];

type InspeccionDashboard = InspeccionDashboardServidor & {
  local_id?: number;
  estado_local?: string;
};

type Prioridad = 'alta' | 'media';

type OrigenAlerta = 'INSPECCION' | 'COLMENA' | 'SIN_INSPECCION';

type DetalleAlerta = {
  texto: string;
  prioridad: Prioridad;
  origen: OrigenAlerta;
};

type AlertaDashboard = {
  colmena: ColmenaDashboard;
  prioridad: Prioridad;
  motivos: string[];
  detalles: DetalleAlerta[];
  ultima: InspeccionDashboard | null;
};

type Props = {
  catalogoVersion: number;
  onEscanear: () => void;
  onInspecciones: () => void;
  onColmenas: () => void;
  onTratamientos: () => void;
  onRevisiones: () => void;
  onApiarios: () => void;
  onStock: () => void;
  onVerColmenas: (apiarioId?: number, colmenaIds?: number[]) => void;
  onVerColmena: (colmenaId: number) => void;
  onInspeccionar: (colmena: ColmenaDashboard) => void;
};

type EstadoServidor =
  | 'SIN_COMPROBAR'
  | 'COMPROBANDO'
  | 'DISPONIBLE'
  | 'NO_DISPONIBLE';

type RespuestaHealth = { status: string };

type ClaveDistribucion =
  | 'COMPLETA'
  | 'EN_DESARROLLO'
  | 'DONANTE'
  | 'DEBIL'
  | 'REQUIERE_REVISION'
  | 'ANTERIOR'
  | 'SIN';

type InspeccionLocalDashboard = Awaited<
  ReturnType<typeof listarInspeccionesDashboardLocales>
>[number];

type StockBajo = {
  material: string;
  disponible: number;
  minimo: number;
};

// ==========================================
// CONFIGURACIÓN Y ETIQUETAS
// ==========================================

const DIAS_SIN_INSPECCION = 30;
const MAXIMO_ALERTAS = 10;
const MAXIMO_INSPECCIONES = 12;

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
  { clave: 'COMPLETA', texto: 'Completa', color: '#10B981' },
  { clave: 'EN_DESARROLLO', texto: 'En desarrollo', color: '#0EA5E9' },
  { clave: 'DONANTE', texto: 'Donante', color: '#14B8A6' },
  { clave: 'DEBIL', texto: 'Débil', color: COLORS.gold },
  { clave: 'REQUIERE_REVISION', texto: 'Requiere revisión', color: COLORS.danger },
  { clave: 'ANTERIOR', texto: 'Escala anterior', color: COLORS.textMuted, soloSiHay: true },
  { clave: 'SIN', texto: 'Sin inspección', color: COLORS.borderStrong },
];

const ESTADOS_TEXTO: Record<string, string> = {
  COMPLETA: 'Completa',
  EN_DESARROLLO: 'En desarrollo',
  DONANTE: 'Donante',
  DEBIL: 'Débil',
  REQUIERE_REVISION: 'Requiere revisión',
  BUENO: 'Bueno',
  REGULAR: 'Regular',
  CRITICO: 'Crítico',
};

const MATERIALES_TEXTO: Record<string, string> = {
  CAJON: 'Cajones',
  ALZA: 'Alzas',
  MARCO_VACIO: 'Marcos vacíos',
  MARCO_CERA_ESTIRADA: 'Marcos con cera estirada',
  MARCO_CERA_UNTADA: 'Marcos con cera untada',
  MARCO_CERA_ESTAMPADA: 'Marcos con cera estampada',
  MARCO_MIEL: 'Marcos con miel',
  TECHO: 'Techos',
  TECHO_AMERICANO: 'Techos americanos',
  ENTRETAPA: 'Entretapas',
  PISO: 'Pisos',
};

const DIAS_MS = 86400000;

// ==========================================
// FUNCIONES DE FECHA Y ESTADO
// ==========================================

function formatearFecha(fecha?: string | null): string {
  if (!fecha) return 'Sin registro';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return 'Fecha no disponible';
  return valor.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatearFechaHora(fecha?: string | null): string {
  if (!fecha) return 'Sin registro';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return 'Fecha no disponible';
  return valor.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function diasDesde(fecha?: string | null): number | null {
  if (!fecha) return null;
  const partes = fecha.slice(0, 10).split('-').map(Number);
  let fechaInspeccion: Date;

  if (partes.length === 3 && partes.every(Number.isFinite)) {
    fechaInspeccion = new Date(partes[0], partes[1] - 1, partes[2]);
  } else {
    const parseada = new Date(fecha);
    if (!Number.isFinite(parseada.getTime())) return null;
    fechaInspeccion = new Date(
      parseada.getFullYear(),
      parseada.getMonth(),
      parseada.getDate()
    );
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaInspeccion.setHours(0, 0, 0, 0);
  return Math.floor((hoy.getTime() - fechaInspeccion.getTime()) / DIAS_MS);
}

function colmenaOperativa(colmena: ColmenaDashboard): boolean {
  return colmena.estado !== 'INACTIVA' && colmena.estado !== 'BAJA';
}

function ultimaInspeccionPorColmena(
  inspecciones: InspeccionDashboard[]
): Map<number, InspeccionDashboard> {
  const ultimas = new Map<number, InspeccionDashboard>();
  for (const inspeccion of inspecciones) {
    const actual = ultimas.get(inspeccion.colmena_id);
    if (
      !actual ||
      new Date(inspeccion.fecha_inspeccion).getTime() >
        new Date(actual.fecha_inspeccion).getTime()
    ) {
      ultimas.set(inspeccion.colmena_id, inspeccion);
    }
  }
  return ultimas;
}

// Mantiene la misma procedencia de motivos que el Dashboard Web.
function calcularAlertas(
  colmenas: ColmenaDashboard[],
  inspecciones: InspeccionDashboard[]
): AlertaDashboard[] {
  const ultimas = ultimaInspeccionPorColmena(inspecciones);
  const alertas: AlertaDashboard[] = [];

  for (const colmena of colmenas) {
    if (!colmenaOperativa(colmena)) continue;

    const ultima = ultimas.get(colmena.id) ?? null;
    const detalles: DetalleAlerta[] = [];
    const agregar = (
      texto: string,
      prioridad: Prioridad,
      origen: OrigenAlerta
    ) => detalles.push({ texto, prioridad, origen });

    if (
      ultima?.estado_general === 'REQUIERE_REVISION' ||
      ultima?.estado_general === 'CRITICO'
    ) {
      agregar(
        ultima.estado_general === 'CRITICO'
          ? 'Última inspección en estado crítico'
          : 'Última inspección: requiere revisión',
        'alta',
        'INSPECCION'
      );
    }

    const tieneSignos =
      ultima?.signos_enfermedad === true ||
      ultima?.signos_enfermedad === 1;

    if (tieneSignos && ultima) {
      agregar(
        ultima.enfermedad_observada
          ? `Signos de enfermedad: ${ultima.enfermedad_observada}`
          : 'Signos de enfermedad',
        'alta',
        'INSPECCION'
      );
    }

    if (
      ultima?.estado_general === 'DEBIL' ||
      ultima?.estado_general === 'REGULAR'
    ) {
      agregar(
        ultima.estado_general === 'REGULAR'
          ? 'Última inspección en estado regular'
          : 'Última inspección: colmena débil',
        'media',
        'INSPECCION'
      );
    }

    if (colmena.estado === 'EN_OBSERVACION') {
      agregar('Marcada en observación', 'media', 'COLMENA');
    }

    if (!ultima) {
      agregar('Sin inspecciones registradas', 'media', 'SIN_INSPECCION');
    } else {
      const dias = diasDesde(ultima.fecha_inspeccion);
      if (dias !== null && dias > DIAS_SIN_INSPECCION) {
        agregar(`Sin inspección hace ${dias} días`, 'media', 'INSPECCION');
      }
    }

    if (detalles.length > 0) {
      alertas.push({
        colmena,
        prioridad: detalles.some(item => item.prioridad === 'alta') ? 'alta' : 'media',
        motivos: detalles.map(item => item.texto),
        detalles,
        ultima,
      });
    }
  }

  return alertas.sort(
    (a, b) => (a.prioridad === 'alta' ? 0 : 1) - (b.prioridad === 'alta' ? 0 : 1)
  );
}

// Convierte inspecciones guardadas en SQLite al mismo formato que GET /inspecciones/.
function convertirInspeccionLocal(
  registro: InspeccionLocalDashboard,
  catalogo: CatalogoMovil
): InspeccionDashboard | null {
  const qr = registro.codigo_qr.trim().toLowerCase();
  const colmena = catalogo.colmenas.find(
    item => item.codigo_qr.trim().toLowerCase() === qr
  );
  if (!colmena) return null;

  return {
    id: registro.servidor_id ?? -registro.id,
    colmena_id: colmena.id,
    usuario_id: registro.usuario_id ?? undefined,
    fecha_inspeccion: registro.fecha_local,
    estado_general: registro.estado_general,
    signos_enfermedad: registro.signos_enfermedad === null
      ? false
      : Boolean(registro.signos_enfermedad),
    enfermedad_observada: registro.enfermedad_observada,
    cantidad_marcos: registro.marcos_totales,
    reina_observada: registro.reina_observada === null
      ? null
      : Boolean(registro.reina_observada),
    presencia_cria: registro.presencia_cria === null
      ? null
      : Boolean(registro.presencia_cria),
    postura: registro.postura === null ? null : Boolean(registro.postura),
    nivel_poblacion: registro.nivel_poblacion,
    reservas_alimento: registro.reservas_alimento,
    miel: registro.miel,
    alimentacion_suministrada: registro.alimentacion_suministrada,
    tiene_alza: registro.tiene_alza === null ? null : Boolean(registro.tiene_alza),
    tiras_medicamento: registro.tiras_medicamento,
    observaciones: registro.observaciones,
    local_id: registro.id,
    estado_local: registro.estado,
  };
}

function combinarInspecciones(
  servidor: InspeccionDashboardServidor[],
  locales: InspeccionLocalDashboard[],
  catalogo: CatalogoMovil | null
): InspeccionDashboard[] {
  const idsServidor = new Set(servidor.map(item => item.id));
  const localesNoSincronizados = catalogo
    ? locales
        .filter(item => !item.servidor_id || !idsServidor.has(item.servidor_id))
        .map(item => convertirInspeccionLocal(item, catalogo))
        .filter((item): item is InspeccionDashboard => item !== null)
    : [];

  return [...servidor, ...localesNoSincronizados].sort(
    (a, b) => new Date(a.fecha_inspeccion).getTime() - new Date(b.fecha_inspeccion).getTime()
  );
}

function colorEstado(estado?: string | null): string {
  return DISTRIBUCION.find(item => item.clave === estado)?.color ?? COLORS.textMuted;
}

function nombreEstado(estado?: string | null): string {
  if (!estado) return 'Sin estado';
  return ESTADOS_TEXTO[estado] ?? estado.replace(/_/g, ' ');
}

function textoMaterial(material: string): string {
  return MATERIALES_TEXTO[material] ?? material.replace(/_/g, ' ').toLowerCase();
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function InicioModulos({
  catalogoVersion,
  onEscanear,
  onInspecciones,
  onTratamientos,
  onApiarios,
  onStock,
  onVerColmenas,
  onVerColmena,
  onInspeccionar,
}: Props) {
  const { width } = useWindowDimensions();
  const esTablet = width >= 768;
  const dashboardEnFila = width >= 980;
  const anchoIndicador = width >= 1100
    ? '23.5%'
    : width >= 620
      ? '48.5%'
      : '100%';
  const anchoEstado = width >= 620 ? '48.8%' : '100%';

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const [anchoContenedor, setAnchoContenedor] = useState(0);
  const [offsetAlertas, setOffsetAlertas] = useState(0);

  const [catalogo, setCatalogo] = useState<CatalogoMovil | null>(null);
  const [inspecciones, setInspecciones] = useState<InspeccionDashboard[]>([]);
  const [cargandoDashboard, setCargandoDashboard] = useState(true);
  const [errorInspecciones, setErrorInspecciones] = useState(false);
  const [avisoCatalogo, setAvisoCatalogo] = useState('');
  const [versionDatos, setVersionDatos] = useState(0);

  const [apiarioId, setApiarioId] = useState('');
  const [colmenaId, setColmenaId] = useState('');
  const [selectorColmenaVisible, setSelectorColmenaVisible] = useState(false);
  const [busquedaColmena, setBusquedaColmena] = useState('');
  const [inspeccionAbierta, setInspeccionAbierta] = useState<InspeccionDashboard | null>(null);
  const [stockBajo, setStockBajo] = useState<StockBajo[]>([]);

  const conexion = useConexion();
  const conInternet = conexion === 'CON_INTERNET';
  const sinInternet = conexion === 'SIN_INTERNET';

  // ========================================
  // CARGA DEL CATÁLOGO Y LAS INSPECCIONES
  // ========================================

  useEffect(() => {
    let activo = true;

    const cargarDatos = async () => {
      setCargandoDashboard(true);

      let catalogoLocal: CatalogoMovil | null = null;
      let inspeccionesServidor: InspeccionDashboardServidor[] = [];
      let inspeccionesLocales: InspeccionLocalDashboard[] = [];
      let aviso = '';
      let errorLocal = false;

      try {
        const sesion = await leerSesionGuardada();

        if (sesion) {
          // Primero se recuperan las copias locales en paralelo.
          const [
            catalogoCache,
            inspeccionesCache,
            inspeccionesLocalCache,
          ] = await Promise.all([
            leerCatalogoLocal(sesion.usuario.id).catch(() => null),
            leerInspeccionesServidorDashboard(
              sesion.usuario.id
            ).catch(() => [] as InspeccionDashboardServidor[]),
            listarInspeccionesDashboardLocales().catch((error) => {
              console.error(
                'No se pudieron leer las inspecciones locales del Dashboard:',
                error
              );
              errorLocal = true;
              return [] as InspeccionLocalDashboard[];
            }),
          ]);

          if (!activo) return;

          catalogoLocal = catalogoCache;
          inspeccionesServidor = inspeccionesCache;
          inspeccionesLocales = inspeccionesLocalCache;

          if (!catalogoLocal) {
            aviso = 'No hay un catálogo oficial descargado para este dispositivo.';
          } else if (sinInternet) {
            aviso = 'Se está utilizando el catálogo y las inspecciones guardadas en el dispositivo.';
          }

          // Mostrar el Dashboard con la última copia local sin esperar
          // la descarga completa de inspecciones desde el servidor.
          setCatalogo(catalogoLocal);
          setInspecciones(
            combinarInspecciones(
              inspeccionesServidor,
              inspeccionesLocales,
              catalogoLocal
            )
          );
          setErrorInspecciones(errorLocal);

          if (
            catalogoLocal ||
            inspeccionesServidor.length > 0 ||
            inspeccionesLocales.length > 0
          ) {
            setCargandoDashboard(false);
          }

          // La actualización remota se ejecuta después de pintar la caché.
          if (conInternet && tokenVigente(sesion)) {
            try {
              const remotas = await listarInspeccionesServidor(
                sesion.accessToken
              );

              if (!activo) return;

              inspeccionesServidor = remotas;

              void guardarInspeccionesServidorDashboard(
                sesion.usuario.id,
                inspeccionesServidor
              ).catch((error) => {
                console.warn(
                  'No se pudo guardar la caché de inspecciones del Dashboard:',
                  error
                );
              });
            } catch (error) {
              console.warn(
                'No se pudieron actualizar las inspecciones del Dashboard:',
                error
              );

              aviso = inspeccionesCache.length > 0
                ? 'No se pudieron actualizar las inspecciones. Se utiliza la última copia guardada.'
                : 'No fue posible consultar las inspecciones del servidor.';
            }
          }
        } else {
          aviso = 'No se encontró una sesión para consultar el catálogo.';

          inspeccionesLocales = await listarInspeccionesDashboardLocales()
            .catch((error) => {
              console.error(
                'No se pudieron leer las inspecciones locales:',
                error
              );
              errorLocal = true;
              return [] as InspeccionLocalDashboard[];
            });
        }
      } catch (error) {
        console.error('Error cargando el Dashboard:', error);
        aviso = aviso || 'No se pudieron cargar todos los datos del Dashboard.';
        errorLocal = true;
      }

      if (!activo) return;

      // Evitar sobrescribir con una copia antigua si la descarga de
      // catálogo en segundo plano terminó mientras se actualizaba el Dashboard.
      try {
        const sesionActual = await leerSesionGuardada();

        if (sesionActual) {
          const catalogoActualizado = await leerCatalogoLocal(
            sesionActual.usuario.id
          ).catch(() => null);

          if (catalogoActualizado) {
            catalogoLocal = catalogoActualizado;
          }
        }
      } catch {
        // Se conserva la última copia local que ya estaba cargada.
      }

      if (!activo) return;

      setCatalogo(catalogoLocal);
      setInspecciones(
        combinarInspecciones(
          inspeccionesServidor,
          inspeccionesLocales,
          catalogoLocal
        )
      );
      setErrorInspecciones(errorLocal);
      setAvisoCatalogo(aviso);
      setCargandoDashboard(false);
    };

    void cargarDatos();

    return () => {
      activo = false;
    };
  }, [conexion, versionDatos]);

  // El catálogo se actualiza en AppAutenticado. El Dashboard solo
  // vuelve a leer SQLite cuando llega una nueva versión.
  useEffect(() => {
    if (catalogoVersion <= 0) return;

    let activo = true;

    const leerCatalogoActualizado = async () => {
      const sesion = await leerSesionGuardada();
      if (!sesion) return;

      const actualizado = await leerCatalogoLocal(
        sesion.usuario.id
      ).catch(() => null);

      if (activo && actualizado) {
        setCatalogo(actualizado);
      }
    };

    void leerCatalogoActualizado().catch((error) => {
      console.warn(
        'No se pudo releer el catálogo actualizado del Dashboard:',
        error
      );
    });

    return () => {
      activo = false;
    };
  }, [catalogoVersion]);

  // ========================================
  // STOCK BAJO, IGUAL QUE EL AVISO DE WEB
  // ========================================

  useEffect(() => {
    let activo = true;

    const cargarStockBajo = async () => {
      try {
        const sesion = await leerSesionGuardada();
        if (!sesion) return;

        let filas: StockResumen[] = [];
        if (conInternet && tokenVigente(sesion)) {
          try {
            filas = await obtenerStock(sesion.accessToken);
            await guardarStockDashboard(sesion.usuario.id, filas);
          } catch (error) {
            console.warn('No se pudo actualizar el stock del Dashboard:', error);
            filas = await leerStockDashboard(sesion.usuario.id).catch(() => []);
          }
        } else {
          filas = await leerStockDashboard(sesion.usuario.id).catch(() => []);
        }

        if (!activo) return;
        setStockBajo(
          filas
            .filter(item => item.minimo !== null && item.minimo !== undefined && item.disponible < item.minimo)
            .map(item => ({
              material: item.material,
              disponible: item.disponible,
              minimo: item.minimo as number,
            }))
        );
      } catch (error) {
        // El Dashboard no debe fallar si el backend todavía no expone Stock.
        console.warn('No se pudo consultar el stock desde el Dashboard:', error);
      }
    };

    void cargarStockBajo();
    return () => { activo = false; };
  }, [conInternet, versionDatos]);

  // ========================================
  // ESTADO DEL SERVIDOR
  // ========================================

  const [estadoServidor, setEstadoServidor] = useState<EstadoServidor>('SIN_COMPROBAR');
  const [reintentoServidor, setReintentoServidor] = useState(0);

  useEffect(() => {
    let activo = true;
    if (!conInternet) {
      setEstadoServidor('SIN_COMPROBAR');
      return () => { activo = false; };
    }

    setEstadoServidor('COMPROBANDO');
    void solicitarAPI<RespuestaHealth>('/health', { method: 'GET' })
      .then(respuesta => {
        if (activo) setEstadoServidor(respuesta.status === 'ok' ? 'DISPONIBLE' : 'NO_DISPONIBLE');
      })
      .catch(error => {
        console.warn('FastAPI no disponible:', error);
        if (activo) setEstadoServidor('NO_DISPONIBLE');
      });

    return () => { activo = false; };
  }, [conexion, reintentoServidor]);

  const actualizarDashboard = () => {
    setVersionDatos(actual => actual + 1);
    setReintentoServidor(actual => actual + 1);
  };

  // ========================================
  // FILTROS APIARIO Y COLMENA
  // ========================================

  const apiariosOrdenados = useMemo(
    () => [...(catalogo?.apiarios ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [catalogo]
  );

  const apiarioElegido = apiariosOrdenados.find(item => String(item.id) === apiarioId) ?? null;
  const colmenaElegida = catalogo?.colmenas.find(item => String(item.id) === colmenaId) ?? null;

  const opcionesColmena = useMemo(
    () => (catalogo?.colmenas ?? [])
      .filter(item => colmenaOperativa(item) && (!apiarioId || String(item.apiario_id) === apiarioId))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
      .map(item => ({ valor: String(item.id), texto: item.codigo })),
    [catalogo, apiarioId]
  );

  const opcionesColmenaFiltradas = useMemo(() => {
    const termino = busquedaColmena.trim().toLowerCase();
    return opcionesColmena.filter(item => !termino || item.texto.toLowerCase().includes(termino));
  }, [opcionesColmena, busquedaColmena]);

  const cambiarApiario = (id: string) => {
    setApiarioId(id);
    if (colmenaElegida && id && String(colmenaElegida.apiario_id) !== id) {
      setColmenaId('');
    }
  };

  // ========================================
  // RESUMEN DEL DASHBOARD
  // ========================================

  const resumen = useMemo(() => {
    const colmenas = catalogo?.colmenas ?? [];
    const todasOperativas = colmenas.filter(colmenaOperativa);
    const todasAlertas = calcularAlertas(colmenas, inspecciones);
    const delFiltro = (colmena: ColmenaDashboard) =>
      (!apiarioId || String(colmena.apiario_id) === apiarioId) &&
      (!colmenaId || String(colmena.id) === colmenaId);

    const operativas = todasOperativas.filter(delFiltro);
    const alertas = todasAlertas.filter(item => delFiltro(item.colmena));
    const idsColmenas = new Set(colmenas.filter(delFiltro).map(item => item.id));
    const ultimas = ultimaInspeccionPorColmena(inspecciones);

    const conteo: Record<ClaveDistribucion, number> = {
      COMPLETA: 0,
      EN_DESARROLLO: 0,
      DONANTE: 0,
      DEBIL: 0,
      REQUIERE_REVISION: 0,
      ANTERIOR: 0,
      SIN: 0,
    };

    for (const colmena of operativas) {
      const estado = ultimas.get(colmena.id)?.estado_general;
      if (!estado) conteo.SIN += 1;
      else if (ESTADOS_ACTUALES.includes(estado)) conteo[estado as ClaveDistribucion] += 1;
      else conteo.ANTERIOR += 1;
    }

    // La comparación por apiario siempre conserva todos los apiarios.
    const porApiario = apiariosOrdenados.map(apiario => ({
      apiario,
      colmenas: todasOperativas.filter(item => item.apiario_id === apiario.id).length,
      alertas: todasAlertas.filter(item => item.colmena.apiario_id === apiario.id).length,
    }));

    const inspeccionesElegida = colmenaId
      ? inspecciones
          .filter(item => String(item.colmena_id) === colmenaId)
          .sort((a, b) => new Date(a.fecha_inspeccion).getTime() - new Date(b.fecha_inspeccion).getTime())
      : [];

    const tratamientosEnCurso = (catalogo?.tratamientos_en_curso ?? [])
      .filter(item => idsColmenas.has(item.colmena_id)).length;

    return {
      operativas,
      alertas,
      conteo,
      porApiario,
      tratamientosEnCurso,
      ultimaElegida: colmenaId ? ultimas.get(Number(colmenaId)) ?? null : null,
      inspeccionesElegida,
    };
  }, [catalogo, inspecciones, apiarioId, colmenaId, apiariosOrdenados]);

  const prioridadAlta = resumen.alertas.filter(item => item.prioridad === 'alta').length;
  const totalInspecciones = inspecciones.length;
  const pendientes = inspecciones.filter(item => item.estado_local && item.estado_local !== 'SINCRONIZADO').length;
  const sincronizadas = Math.max(totalInspecciones - pendientes, 0);

  // ========================================
  // CONECTIVIDAD Y NAVEGACIÓN
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

  const textoServidor = estadoServidor === 'DISPONIBLE'
    ? 'FastAPI disponible'
    : estadoServidor === 'COMPROBANDO'
      ? 'Comprobando FastAPI'
      : estadoServidor === 'NO_DISPONIBLE'
        ? 'FastAPI no disponible'
        : 'FastAPI sin comprobar';

  const detalleServidor = estadoServidor === 'DISPONIBLE'
    ? 'El servidor respondió correctamente.'
    : estadoServidor === 'COMPROBANDO'
      ? 'Consultando la ruta /health.'
      : estadoServidor === 'NO_DISPONIBLE'
        ? 'La API configurada no respondió. Revisa el servidor.'
        : sinInternet
          ? 'Se comprobará cuando vuelva internet.'
          : 'Esperando conexión para comprobar el servidor.';

  const irAlertas = () => {
    scrollRef.current?.scrollTo({ y: Math.max(offsetAlertas - 12, 0), animated: true });
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.pantalla}
        onLayout={evento => {
          const nuevoAncho = evento.nativeEvent.layout.width;
          setAnchoContenedor(actual => Math.abs(actual - nuevoAncho) > 1 ? nuevoAncho : actual);
        }}
        contentContainerStyle={[
          styles.contenido,
          { paddingHorizontal: esTablet ? 28 : 18 },
          anchoContenedor > 0 ? { maxWidth: 1600 } : null,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* CABECERA */}
        <View style={styles.encabezadoSuperior}>
          <View style={styles.encabezadoTextos}>
            <Text style={[styles.titulo, esTablet && styles.tituloTablet]}>Dashboard</Text>
            <Text style={styles.introduccion}>Colmenares Tres Pinos</Text>
          </View>
          <View style={styles.accionesCabecera}>
            <Pressable
              onPress={onEscanear}
              style={({ pressed }) => [styles.botonSecundario, pressed && styles.elementoPresionado]}
            >
              <Text style={styles.botonSecundarioTexto}>Escanear QR</Text>
            </Pressable>
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
                ? <ActivityIndicator size="small" color={COLORS.goldText} />
                : <Text style={styles.botonActualizarTexto}>↻ Actualizar</Text>}
            </Pressable>
          </View>
        </View>

        {/* ALERTA DE STOCK BAJO */}
        {stockBajo.length > 0 && (
          <Pressable
            onPress={onStock}
            style={({ pressed }) => [styles.avisoStock, pressed && styles.elementoPresionado]}
          >
            <Text style={styles.avisoStockTitulo}>⚠️ Stock bajo en bodega</Text>
            {stockBajo.map(item => (
              <Text key={item.material} style={styles.avisoStockTexto}>
                {textoMaterial(item.material)}: {item.disponible} disponibles de un mínimo de {item.minimo}
              </Text>
            ))}
            <Text style={styles.avisoStockAccion}>Toca para revisar el inventario</Text>
          </Pressable>
        )}

        {/* AVISOS DE DATOS */}
        {Boolean(avisoCatalogo) && (
          <View style={styles.avisoCatalogo}>
            <Text style={styles.avisoCatalogoTexto}>{avisoCatalogo}</Text>
          </View>
        )}

        {/* FILTRO POR APIARIO */}
        <View style={styles.filtroSeccion}>
          <Text style={styles.filtroTitulo}>Apiario</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtroLista}>
            <Pressable
              onPress={() => cambiarApiario('')}
              style={[styles.filtroBoton, apiarioId === '' && styles.filtroBotonActivo]}
            >
              <Text style={[styles.filtroTexto, apiarioId === '' && styles.filtroTextoActivo]}>Todos los apiarios</Text>
            </Pressable>
            {apiariosOrdenados.map(apiario => {
              const activo = apiarioId === String(apiario.id);
              return (
                <Pressable
                  key={apiario.id}
                  onPress={() => cambiarApiario(String(apiario.id))}
                  style={[styles.filtroBoton, activo && styles.filtroBotonActivo]}
                >
                  <Text style={[styles.filtroTexto, activo && styles.filtroTextoActivo]}>{apiario.nombre}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* FILTRO POR COLMENA */}
        <View style={styles.filtroColmenaSeccion}>
          <Text style={styles.filtroTitulo}>Colmena</Text>
          <View style={styles.filtroColmenaFila}>
            <Pressable
              onPress={() => setSelectorColmenaVisible(true)}
              style={styles.selectorColmena}
            >
              <Text style={styles.selectorColmenaTexto} numberOfLines={1}>
                {colmenaElegida?.codigo ?? (apiarioElegido ? `Todas las de ${apiarioElegido.nombre}` : 'Todas las colmenas')}
              </Text>
              <Text style={styles.selectorColmenaFlecha}>⌄</Text>
            </Pressable>
            {Boolean(colmenaId) && (
              <Pressable onPress={() => setColmenaId('')} style={styles.limpiarColmena}>
                <Text style={styles.limpiarColmenaTexto}>Limpiar</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* INDICADORES PRINCIPALES */}
        <View style={styles.estadisticas}>
          <Pressable
            onPress={onApiarios}
            style={({ pressed }) => [styles.indicador, { width: anchoIndicador }, pressed && styles.tarjetaPresionada]}
          >
            <View style={styles.indicadorCabecera}>
              <Text style={styles.indicadorEtiqueta}>{apiarioElegido ? 'Apiario' : 'Apiarios'}</Text>
              <Text style={styles.indicadorIcono}>📍</Text>
            </View>
            <Text style={[styles.indicadorCifra, apiarioElegido && styles.indicadorNombre]} numberOfLines={2}>
              {catalogo ? (apiarioElegido?.nombre ?? catalogo.apiarios.length) : '—'}
            </Text>
            <Text style={styles.indicadorDetalle}>{apiarioElegido?.ubicacion || (apiarioElegido ? 'Sin ubicación' : 'Registrados en el sistema')}</Text>
          </Pressable>

          <Pressable
            onPress={() => colmenaElegida ? onVerColmena(colmenaElegida.id) : onVerColmenas(apiarioElegido?.id)}
            style={({ pressed }) => [styles.indicador, { width: anchoIndicador }, pressed && styles.tarjetaPresionada]}
          >
            <View style={styles.indicadorCabecera}>
              <Text style={styles.indicadorEtiqueta}>{colmenaElegida ? 'Colmena' : 'Colmenas en operación'}</Text>
              <Text style={styles.indicadorIcono}>🐝</Text>
            </View>
            <Text style={[styles.indicadorCifra, colmenaElegida && styles.indicadorNombre]} numberOfLines={2}>
              {catalogo ? (colmenaElegida?.codigo ?? resumen.operativas.length) : '—'}
            </Text>
            <Text style={styles.indicadorDetalle}>
              {colmenaElegida
                ? `Última inspección: ${resumen.ultimaElegida ? `${formatearFecha(resumen.ultimaElegida.fecha_inspeccion)} · ${nombreEstado(resumen.ultimaElegida.estado_general)}` : 'ninguna'}`
                : 'Toca para consultar las colmenas'}
            </Text>
          </Pressable>

          <Pressable
            onPress={irAlertas}
            style={({ pressed }) => [
              styles.indicador,
              styles.indicadorAlerta,
              { width: anchoIndicador },
              prioridadAlta > 0 && styles.indicadorAlertaAlta,
              pressed && styles.tarjetaPresionada,
            ]}
          >
            <View style={styles.indicadorCabecera}>
              <Text style={styles.indicadorEtiqueta}>Requieren atención</Text>
              <Text style={styles.indicadorIcono}>⚠️</Text>
            </View>
            <Text style={[styles.indicadorCifra, prioridadAlta > 0 && styles.cifraAlerta]}>
              {catalogo ? resumen.alertas.length : '—'}
            </Text>
            <Text style={styles.indicadorDetalle}>{prioridadAlta > 0 ? `${prioridadAlta} con prioridad alta` : 'Según última inspección'}</Text>
          </Pressable>

          <Pressable
            onPress={onTratamientos}
            style={({ pressed }) => [styles.indicador, { width: anchoIndicador }, pressed && styles.tarjetaPresionada]}
          >
            <View style={styles.indicadorCabecera}>
              <Text style={styles.indicadorEtiqueta}>Tratamientos en curso</Text>
              <Text style={styles.indicadorIcono}>💊</Text>
            </View>
            <Text style={styles.indicadorCifra}>{catalogo ? resumen.tratamientosEnCurso : '—'}</Text>
            <Text style={styles.indicadorDetalle}>Tratamientos activos</Text>
          </Pressable>
        </View>

        {/* ALERTAS Y ESTADOS */}
        <View
          style={[
            styles.panelesDashboard,
            { flexDirection: dashboardEnFila ? 'row' : 'column' },
          ]}
        >
          <View
            style={[styles.panel, { width: dashboardEnFila ? '64.5%' : '100%' }]}
            onLayout={evento => setOffsetAlertas(evento.nativeEvent.layout.y)}
          >
            <View style={styles.panelCabecera}>
              <Text style={styles.panelTitulo}>Colmenas que requieren atención</Text>
              <Text style={styles.panelDescripcion}>
                {colmenaElegida
                  ? `${colmenaElegida.codigo}. `
                  : apiarioElegido ? `${apiarioElegido.nombre}. ` : ''}
                Según su última inspección, su estado o más de {DIAS_SIN_INSPECCION} días sin revisar.
              </Text>
            </View>

            {cargandoDashboard ? (
              <View style={styles.estadoVacio}>
                <ActivityIndicator color={COLORS.gold} />
              </View>
            ) : !catalogo ? (
              <View style={styles.estadoVacio}>
                <Text style={styles.estadoVacioTexto}>No hay un catálogo disponible para consultar las alertas.</Text>
              </View>
            ) : resumen.alertas.length === 0 ? (
              <View style={styles.estadoVacio}>
                <Text style={styles.estadoVacioIcono}>✓</Text>
                <Text style={styles.estadoVacioTexto}>
                  {colmenaElegida ? `${colmenaElegida.codigo} está al día.` : 'Todas las colmenas están al día.'}
                </Text>
              </View>
            ) : (
              <View>
                {resumen.alertas.slice(0, MAXIMO_ALERTAS).map(({ colmena, prioridad, detalles, ultima }) => {
                  const apiario = apiariosOrdenados.find(item => item.id === colmena.apiario_id);
                  const alta = prioridad === 'alta';
                  const tieneMotivoInspeccion = detalles.some(item => item.origen === 'INSPECCION');

                  return (
                    <View key={colmena.id} style={styles.alertaFila}>
                      <View style={styles.alertaContenido}>
                        <View style={styles.alertaTituloFila}>
                          <Text style={styles.alertaCodigo}>{colmena.codigo}</Text>
                          <Text style={styles.alertaApiario}>{apiario?.nombre ?? 'Sin apiario'}</Text>
                          <View style={[styles.insignia, alta ? styles.insigniaAlta : styles.insigniaMedia]}>
                            <Text style={[styles.insigniaTexto, alta ? styles.insigniaTextoAlta : styles.insigniaTextoMedia]}>
                              {alta ? 'Prioridad alta' : 'Revisar'}
                            </Text>
                          </View>
                        </View>

                        {detalles.map((detalle, indice) => (
                          <Text key={`${colmena.id}-${indice}`} style={styles.alertaMotivos}>
                            {detalle.texto}
                            {detalle.origen === 'INSPECCION' && ultima
                              ? ` · inspección del ${formatearFecha(ultima.fecha_inspeccion)}`
                              : detalle.origen === 'COLMENA'
                                ? ' · estado de la colmena'
                                : ''}
                          </Text>
                        ))}

                        <View style={styles.alertaAcciones}>
                          <Pressable onPress={() => onVerColmena(colmena.id)} style={styles.botonAccion}>
                            <Text style={styles.botonAccionTexto}>Ver colmena</Text>
                          </Pressable>
                          {ultima && tieneMotivoInspeccion ? (
                            <Pressable onPress={() => setInspeccionAbierta(ultima)} style={styles.botonAccion}>
                              <Text style={styles.botonAccionTexto}>Ver inspección</Text>
                            </Pressable>
                          ) : !ultima ? (
                            <Pressable onPress={() => onInspeccionar(colmena)} style={styles.botonAccion}>
                              <Text style={styles.botonAccionTexto}>Inspeccionar</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}

                {resumen.alertas.length > MAXIMO_ALERTAS && (
                  <View style={styles.alertasRestantesContenedor}>
                    <Text style={styles.alertasRestantes}>Y {resumen.alertas.length - MAXIMO_ALERTAS} colmenas más.</Text>
                    <Pressable
                      onPress={() => onVerColmenas(
                        apiarioElegido?.id,
                        resumen.alertas.map(item => item.colmena.id)
                      )}
                      style={styles.botonAccion}
                    >
                      <Text style={styles.botonAccionTexto}>Ver todas en Colmenas</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* DISTRIBUCIÓN GENERAL O HISTORIAL DE LA COLMENA ELEGIDA */}
          <View style={[styles.panel, { width: dashboardEnFila ? '33.5%' : '100%' }]}>
            <View style={styles.panelCabecera}>
              <Text style={styles.panelTitulo}>
                {colmenaElegida ? `Estado de ${colmenaElegida.codigo} en sus inspecciones` : 'Estado según última inspección'}
              </Text>
              <Text style={styles.panelDescripcion}>
                {colmenaElegida
                  ? 'De la más antigua a la más reciente. Toca una para ver su detalle.'
                  : `${apiarioElegido ? `${apiarioElegido.nombre} · ` : ''}${resumen.operativas.length} colmenas en operación`}
              </Text>
            </View>

            {!catalogo ? (
              <View style={styles.estadoVacio}>
                <Text style={styles.estadoVacioTexto}>Datos no disponibles.</Text>
              </View>
            ) : colmenaElegida ? (
              resumen.inspeccionesElegida.length === 0 ? (
                <View style={styles.estadoVacio}>
                  <Text style={styles.estadoVacioTexto}>Esta colmena todavía no tiene inspecciones.</Text>
                </View>
              ) : (
                <View style={styles.distribucionContenido}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.historialBarras}>
                    {resumen.inspeccionesElegida.slice(-MAXIMO_INSPECCIONES).map(inspeccion => (
                      <Pressable
                        key={`${inspeccion.id}-${inspeccion.fecha_inspeccion}`}
                        onPress={() => setInspeccionAbierta(inspeccion)}
                        style={[styles.historialBarra, { backgroundColor: colorEstado(inspeccion.estado_general) }]}
                      />
                    ))}
                  </ScrollView>
                  <View style={styles.historialFechas}>
                    <Text style={styles.historialFecha}>{formatearFecha(resumen.inspeccionesElegida[0].fecha_inspeccion)}</Text>
                    {resumen.inspeccionesElegida.length > 1 && (
                      <Text style={styles.historialFecha}>{formatearFecha(resumen.inspeccionesElegida[resumen.inspeccionesElegida.length - 1].fecha_inspeccion)}</Text>
                    )}
                  </View>
                  <Text style={styles.historialAyuda}>Selecciona una barra para consultar la inspección.</Text>
                </View>
              )
            ) : (
              <View style={styles.distribucionContenido}>
                <View style={styles.distribucionApilada}>
                  {DISTRIBUCION
                    .filter(fila => !fila.soloSiHay || resumen.conteo[fila.clave] > 0)
                    .filter(fila => resumen.conteo[fila.clave] > 0)
                    .map(fila => (
                      <View
                        key={fila.clave}
                        style={{
                          width: `${resumen.operativas.length > 0 ? (resumen.conteo[fila.clave] * 100) / resumen.operativas.length : 0}%`,
                          backgroundColor: fila.color,
                          height: 13,
                        }}
                      />
                    ))}
                </View>
                {DISTRIBUCION
                  .filter(fila => !fila.soloSiHay || resumen.conteo[fila.clave] > 0)
                  .map(fila => {
                    const cantidad = resumen.conteo[fila.clave];
                    const porcentaje = resumen.operativas.length > 0
                      ? Math.round((cantidad * 100) / resumen.operativas.length)
                      : 0;
                    return (
                      <View key={fila.clave} style={styles.estadoBarraFila}>
                        <View style={styles.estadoBarraTitulo}>
                          <View style={styles.estadoNombreFila}>
                            <View style={[styles.estadoPunto, { backgroundColor: fila.color }]} />
                            <Text style={styles.estadoBarraNombre}>{fila.texto}</Text>
                          </View>
                          <Text style={styles.estadoBarraCantidad}>
                            {cantidad}<Text style={styles.estadoBarraPorcentaje}> ({porcentaje}%)</Text>
                          </Text>
                        </View>
                        <View style={styles.barraFondo}>
                          <View style={[styles.barraProgreso, { width: `${porcentaje}%`, backgroundColor: fila.color }]} />
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>
        </View>

        {/* RESUMEN POR APIARIO */}
        <View style={styles.panel}>
          <View style={styles.panelCabecera}>
            <Text style={styles.panelTitulo}>Resumen por apiario</Text>
            <Text style={styles.panelDescripcion}>Comparación de colmenas operativas y alertas.</Text>
          </View>

          {cargandoDashboard ? (
            <View style={styles.estadoVacio}><ActivityIndicator color={COLORS.gold} /></View>
          ) : resumen.porApiario.length === 0 ? (
            <View style={styles.estadoVacio}><Text style={styles.estadoVacioTexto}>No hay apiarios registrados en el catálogo.</Text></View>
          ) : (
            resumen.porApiario.map(({ apiario, colmenas, alertas }) => {
              const activo = apiarioId === String(apiario.id);
              return (
                <View key={apiario.id} style={[styles.apiarioFila, activo && styles.apiarioFilaActivo]}>
                  <View style={styles.apiarioDatos}>
                    <Text style={styles.apiarioNombre}>{apiario.nombre}</Text>
                    <Text style={styles.apiarioUbicacion}>{apiario.ubicacion || 'Sin registrar'}</Text>
                    <View style={styles.apiarioIndicadores}>
                      <Text style={styles.apiarioDato}>🐝 {colmenas} colmenas en operación</Text>
                      <View style={[styles.insignia, styles.insigniaMedia]}>
                        <Text style={styles.insigniaTextoMedia}>{alertas} requieren atención</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.apiarioAcciones}>
                    <Pressable
                      onPress={() => setApiarioId(String(apiario.id))}
                      style={styles.botonApiario}
                    >
                      <Text style={styles.botonApiarioTexto}>Ver en el panel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onVerColmenas(apiario.id)}
                      style={styles.botonApiario}
                    >
                      <Text style={styles.botonApiarioTexto}>Ver colmenas</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ESTADO DEL SISTEMA */}
        <Text style={styles.seccion}>Estado del sistema</Text>
        <View style={styles.estadoGrid}>
          <View style={[styles.tarjetaEstado, { width: anchoEstado }, conInternet ? styles.tarjetaOnline : sinInternet ? styles.tarjetaOffline : styles.tarjetaVerificando]}>
            <View style={styles.estadoFila}>
              <View style={[styles.puntoEstado, conInternet ? styles.puntoOnline : sinInternet ? styles.puntoOffline : styles.puntoNeutral]} />
              <Text style={styles.conexionTitulo}>{textoConexion}</Text>
            </View>
            <Text style={styles.conexionDetalle}>{detalleConexion}</Text>
          </View>

          <View style={[styles.tarjetaEstado, { width: anchoEstado }, estadoServidor === 'DISPONIBLE' ? styles.tarjetaOnline : estadoServidor === 'NO_DISPONIBLE' ? styles.tarjetaError : styles.tarjetaVerificando]}>
            <View style={styles.estadoFila}>
              <View style={[styles.puntoEstado, estadoServidor === 'DISPONIBLE' ? styles.puntoOnline : estadoServidor === 'NO_DISPONIBLE' ? styles.puntoOffline : styles.puntoNeutral]} />
              <Text style={styles.conexionTitulo}>{textoServidor}</Text>
            </View>
            <Text style={styles.conexionDetalle}>{detalleServidor}</Text>
            <Pressable
              style={[styles.botonRevisar, (!conInternet || estadoServidor === 'COMPROBANDO') && styles.deshabilitado]}
              disabled={!conInternet || estadoServidor === 'COMPROBANDO'}
              onPress={() => setReintentoServidor(actual => actual + 1)}
            >
              <Text style={styles.textoRevisar}>Comprobar servidor</Text>
            </Pressable>
          </View>
        </View>

        {/* ACTIVIDAD LOCAL */}
        <Text style={styles.seccion}>Resumen de actividad</Text>
        <Pressable onPress={onInspecciones} style={styles.actividadGrid}>
          <View style={[styles.estadistica, { width: anchoIndicador }]}>
            <Text style={styles.estadisticaEtiqueta}>TOTAL REGISTRADAS</Text>
            <Text style={styles.cifra}>{errorInspecciones ? '!' : totalInspecciones}</Text>
            <Text style={styles.estadisticaDetalle}>Inspecciones disponibles</Text>
          </View>
          <View style={[styles.estadistica, { width: anchoIndicador }]}>
            <Text style={styles.estadisticaEtiqueta}>PENDIENTES</Text>
            <Text style={styles.cifraPendiente}>{errorInspecciones ? '!' : pendientes}</Text>
            <Text style={styles.estadisticaDetalle}>Pendientes de sincronización local</Text>
          </View>
          <View style={[styles.estadistica, { width: anchoIndicador }]}>
            <Text style={styles.estadisticaEtiqueta}>SINCRONIZADAS / SERVIDOR</Text>
            <Text style={styles.cifraSincronizada}>{errorInspecciones ? '!' : sincronizadas}</Text>
            <Text style={styles.estadisticaDetalle}>Registros confirmados o descargados</Text>
          </View>
        </Pressable>

        {errorInspecciones && (
          <Text style={styles.error}>No fue posible cargar el resumen de inspecciones locales.</Text>
        )}

        <View style={styles.pie}>
          <View style={styles.pieLinea} />
          <Text style={styles.pieTexto}>Colmenares Tres Pinos</Text>
          <Text style={styles.pieDetalle}>Aplicación móvil · Expo + SQLite</Text>
        </View>
      </ScrollView>

      {/* SELECTOR DE COLMENA */}
      <Modal
        visible={selectorColmenaVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectorColmenaVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Seleccionar colmena</Text>
            <TextInput
              value={busquedaColmena}
              onChangeText={setBusquedaColmena}
              placeholder="Buscar por código"
              placeholderTextColor={COLORS.textMuted}
              style={styles.modalBuscador}
              autoCapitalize="characters"
            />
            <ScrollView style={styles.modalLista} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => {
                  setColmenaId('');
                  setSelectorColmenaVisible(false);
                  setBusquedaColmena('');
                }}
                style={styles.modalOpcion}
              >
                <Text style={styles.modalOpcionTexto}>
                  {apiarioElegido ? `Todas las de ${apiarioElegido.nombre}` : 'Todas las colmenas'}
                </Text>
              </Pressable>
              {opcionesColmenaFiltradas.map(item => (
                <Pressable
                  key={item.valor}
                  onPress={() => {
                    setColmenaId(item.valor);
                    setSelectorColmenaVisible(false);
                    setBusquedaColmena('');
                  }}
                  style={[styles.modalOpcion, colmenaId === item.valor && styles.modalOpcionActiva]}
                >
                  <Text style={[styles.modalOpcionTexto, colmenaId === item.valor && styles.modalOpcionTextoActivo]}>
                    {item.texto}
                  </Text>
                </Pressable>
              ))}
              {opcionesColmenaFiltradas.length === 0 && (
                <Text style={styles.modalSinResultados}>No hay colmenas que coincidan con la búsqueda.</Text>
              )}
            </ScrollView>
            <Pressable onPress={() => setSelectorColmenaVisible(false)} style={styles.modalCerrar}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* DETALLE DE INSPECCIÓN */}
      <Modal
        visible={Boolean(inspeccionAbierta)}
        transparent
        animationType="slide"
        onRequestClose={() => setInspeccionAbierta(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalDetalleCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitulo}>
                Inspección de {catalogo?.colmenas.find(item => item.id === inspeccionAbierta?.colmena_id)?.codigo ?? 'colmena'}
              </Text>
              <Text style={styles.modalSubtitulo}>{formatearFechaHora(inspeccionAbierta?.fecha_inspeccion)}</Text>

              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Estado de la colmena</Text>
                <Text style={styles.modalDatoValor}>{nombreEstado(inspeccionAbierta?.estado_general)}</Text>
              </View>
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Marcos presentes</Text>
                <Text style={styles.modalDatoValor}>{inspeccionAbierta?.cantidad_marcos ?? 'Sin registrar'}</Text>
              </View>
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Reina observada</Text>
                <Text style={styles.modalDatoValor}>
                  {inspeccionAbierta?.reina_observada === true ? 'Sí' : inspeccionAbierta?.reina_observada === false ? 'No' : 'Sin registrar'}
                </Text>
              </View>
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Presencia de cría</Text>
                <Text style={styles.modalDatoValor}>
                  {inspeccionAbierta?.presencia_cria === true ? 'Sí' : inspeccionAbierta?.presencia_cria === false ? 'No' : 'Sin registrar'}
                </Text>
              </View>
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Signos de enfermedad</Text>
                <Text style={styles.modalDatoValor}>
                  {inspeccionAbierta?.signos_enfermedad ? 'Sí' : 'No'}
                </Text>
              </View>
              {Boolean(inspeccionAbierta?.enfermedad_observada) && (
                <View style={styles.modalDatoFila}>
                  <Text style={styles.modalDatoEtiqueta}>Enfermedad observada</Text>
                  <Text style={styles.modalDatoValor}>{inspeccionAbierta?.enfermedad_observada}</Text>
                </View>
              )}
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Población</Text>
                <Text style={styles.modalDatoValor}>{inspeccionAbierta?.nivel_poblacion ?? 'Sin registrar'}</Text>
              </View>
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Reservas de alimento</Text>
                <Text style={styles.modalDatoValor}>{inspeccionAbierta?.reservas_alimento ?? 'Sin registrar'}</Text>
              </View>
              <View style={styles.modalDatoFila}>
                <Text style={styles.modalDatoEtiqueta}>Miel</Text>
                <Text style={styles.modalDatoValor}>{inspeccionAbierta?.miel ?? 'Sin registrar'}</Text>
              </View>
              {Boolean(inspeccionAbierta?.alimentacion_suministrada) && (
                <View style={styles.modalDatoFila}>
                  <Text style={styles.modalDatoEtiqueta}>Alimentación suministrada</Text>
                  <Text style={styles.modalDatoValor}>{inspeccionAbierta?.alimentacion_suministrada}</Text>
                </View>
              )}
              <View style={styles.modalSeccion}>
                <Text style={styles.modalDatoEtiqueta}>Observaciones</Text>
                <Text style={styles.modalObservaciones}>{inspeccionAbierta?.observaciones?.trim() || 'Sin observaciones.'}</Text>
              </View>
              {inspeccionAbierta?.estado_local && (
                <Text style={styles.modalEstadoLocal}>Estado local: {inspeccionAbierta.estado_local}</Text>
              )}
            </ScrollView>
            <Pressable onPress={() => setInspeccionAbierta(null)} style={styles.modalCerrar}>
              <Text style={styles.modalCerrarTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },
  contenido: { width: '100%', maxWidth: 1600, alignSelf: 'center', paddingTop: 22, paddingBottom: 45 },
  encabezadoSuperior: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 8, marginBottom: 22 },
  encabezadoTextos: { flex: 1, minWidth: 190, marginRight: 10 },
  titulo: { color: COLORS.forest, fontWeight: '900', fontSize: 26 },
  tituloTablet: { fontSize: 32 },
  introduccion: { color: COLORS.textSecondary, fontSize: 14, marginTop: 5 },
  accionesCabecera: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 },
  botonActualizar: { minHeight: 42, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginLeft: 7 },
  botonActualizarTexto: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  botonSecundario: { minHeight: 42, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  botonSecundarioTexto: { color: COLORS.forest, fontSize: 12, fontWeight: '800' },
  elementoPresionado: { opacity: 0.75, borderColor: COLORS.gold },
  deshabilitado: { opacity: 0.4 },
  avisoCatalogo: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: COLORS.goldBorder, backgroundColor: COLORS.goldSoft, marginBottom: 15 },
  avisoCatalogoTexto: { color: COLORS.goldText, fontSize: 12, lineHeight: 19 },
  avisoStock: { padding: 15, borderRadius: 13, borderWidth: 1, borderColor: COLORS.warningBg, backgroundColor: COLORS.goldSoft, marginBottom: 15 },
  avisoStockTitulo: { color: COLORS.goldText, fontSize: 14, fontWeight: '900', marginBottom: 7 },
  avisoStockTexto: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 19 },
  avisoStockAccion: { color: COLORS.goldText, fontSize: 11, fontWeight: '800', marginTop: 7 },
  filtroSeccion: { marginBottom: 13 },
  filtroColmenaSeccion: { marginBottom: 18 },
  filtroTitulo: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '800', marginBottom: 9 },
  filtroLista: { alignItems: 'center', paddingRight: 10 },
  filtroBoton: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 22, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, marginRight: 8 },
  filtroBotonActivo: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  filtroTexto: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  filtroTextoActivo: { color: COLORS.goldText, fontWeight: '800' },
  filtroColmenaFila: { flexDirection: 'row', alignItems: 'center' },
  selectorColmena: { flex: 1, minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectorColmenaTexto: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '700' },
  selectorColmenaFlecha: { color: COLORS.textSecondary, fontSize: 19, marginLeft: 10 },
  limpiarColmena: { paddingHorizontal: 12, paddingVertical: 10, marginLeft: 7 },
  limpiarColmenaTexto: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  estadisticas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 5 },
  indicador: { backgroundColor: COLORS.surface, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 13, minHeight: 125, justifyContent: 'center' },
  tarjetaPresionada: { opacity: 0.78, borderColor: COLORS.gold },
  indicadorAlerta: { borderColor: COLORS.border },
  indicadorAlertaAlta: { borderColor: COLORS.dangerBg },
  indicadorCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  indicadorEtiqueta: { flex: 1, fontSize: 12, color: COLORS.textSecondary, fontWeight: '700' },
  indicadorIcono: { fontSize: 21, marginLeft: 5 },
  indicadorCifra: { fontSize: 32, fontWeight: '900', color: COLORS.forest, marginTop: 7 },
  indicadorNombre: { fontSize: 19 },
  cifraAlerta: { color: COLORS.danger },
  indicadorDetalle: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 },
  panelesDashboard: { flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 5 },
  panel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, overflow: 'hidden', marginBottom: 17 },
  panelCabecera: { padding: 17, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  panelTitulo: { fontSize: 15, fontWeight: '900', color: COLORS.forest },
  panelDescripcion: { fontSize: 12, color: COLORS.textSecondary, marginTop: 5, lineHeight: 18 },
  estadoVacio: { padding: 25, minHeight: 95, alignItems: 'center', justifyContent: 'center' },
  estadoVacioIcono: { fontSize: 28, fontWeight: '900', color: COLORS.success, marginBottom: 7 },
  estadoVacioTexto: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  alertaFila: { paddingHorizontal: 15, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.background, flexDirection: 'row' },
  alertaContenido: { flex: 1 },
  alertaTituloFila: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  alertaCodigo: { color: COLORS.forest, fontSize: 13, fontWeight: '900', marginRight: 8 },
  alertaApiario: { color: COLORS.textSecondary, fontSize: 11, marginRight: 8 },
  alertaMotivos: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 7 },
  alertaAcciones: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  botonAccion: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 9, marginRight: 7, marginBottom: 5, backgroundColor: COLORS.surface },
  botonAccionTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '800' },
  alertasRestantesContenedor: { padding: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  alertasRestantes: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 8 },
  insignia: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  insigniaAlta: { backgroundColor: COLORS.dangerBg },
  insigniaMedia: { backgroundColor: COLORS.goldSoft },
  insigniaTexto: { fontSize: 10, fontWeight: '800' },
  insigniaTextoAlta: { color: COLORS.danger },
  insigniaTextoMedia: { color: COLORS.goldText },
  distribucionContenido: { padding: 17 },
  distribucionApilada: { height: 13, width: '100%', flexDirection: 'row', overflow: 'hidden', borderRadius: 8, backgroundColor: COLORS.background, marginBottom: 20 },
  estadoBarraFila: { marginBottom: 17 },
  estadoBarraTitulo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  estadoNombreFila: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  estadoPunto: { width: 9, height: 9, borderRadius: 2, marginRight: 8 },
  estadoBarraNombre: { color: COLORS.textSecondary, fontSize: 12, flex: 1 },
  estadoBarraCantidad: { color: COLORS.forest, fontSize: 12, fontWeight: '800' },
  estadoBarraPorcentaje: { color: COLORS.textMuted, fontWeight: '400' },
  barraFondo: { height: 8, width: '100%', backgroundColor: COLORS.background, borderRadius: 10, overflow: 'hidden' },
  barraProgreso: { height: '100%', borderRadius: 10 },
  historialBarras: { alignItems: 'stretch', minWidth: '100%' },
  historialBarra: { width: 18, height: 42, borderRadius: 5, marginRight: 4 },
  historialFechas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  historialFecha: { color: COLORS.textSecondary, fontSize: 10 },
  historialAyuda: { color: COLORS.textMuted, fontSize: 11, marginTop: 13, lineHeight: 17 },
  apiarioFila: { padding: 17, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  apiarioFilaActivo: { backgroundColor: COLORS.goldSoft },
  apiarioDatos: { marginBottom: 12 },
  apiarioNombre: { fontSize: 14, fontWeight: '900', color: COLORS.forest },
  apiarioUbicacion: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  apiarioIndicadores: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 11 },
  apiarioDato: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', marginRight: 10, marginBottom: 5 },
  apiarioAcciones: { flexDirection: 'row', flexWrap: 'wrap' },
  botonApiario: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 9, marginRight: 8, marginBottom: 5 },
  botonApiarioTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  seccion: { marginTop: 23, marginBottom: 13, fontSize: 18, fontWeight: '900', color: COLORS.forest },
  estadoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tarjetaEstado: { padding: 16, borderRadius: 14, borderWidth: 1, minHeight: 112, marginBottom: 12 },
  tarjetaOnline: { backgroundColor: COLORS.successBg, borderColor: COLORS.successBg },
  tarjetaOffline: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.warningBg },
  tarjetaError: { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBg },
  tarjetaVerificando: { backgroundColor: COLORS.background, borderColor: COLORS.borderStrong },
  estadoFila: { flexDirection: 'row', alignItems: 'center' },
  puntoEstado: { width: 9, height: 9, borderRadius: 5, marginRight: 9 },
  puntoOnline: { backgroundColor: COLORS.success },
  puntoOffline: { backgroundColor: COLORS.warning },
  puntoNeutral: { backgroundColor: COLORS.textMuted },
  conexionTitulo: { color: COLORS.forest, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  conexionDetalle: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 9 },
  botonRevisar: { alignSelf: 'flex-start', paddingHorizontal: 13, paddingVertical: 9, backgroundColor: COLORS.forest, borderRadius: 8, marginTop: 12 },
  textoRevisar: { color: COLORS.surface, fontSize: 11, fontWeight: '800' },
  actividadGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  estadistica: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, padding: 17, marginBottom: 12, minHeight: 115, justifyContent: 'center' },
  estadisticaEtiqueta: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5 },
  cifra: { fontSize: 32, fontWeight: '900', color: COLORS.forest, marginTop: 7 },
  cifraPendiente: { fontSize: 32, fontWeight: '900', color: COLORS.warning, marginTop: 7 },
  cifraSincronizada: { fontSize: 32, fontWeight: '900', color: COLORS.success, marginTop: 7 },
  estadisticaDetalle: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  error: { color: COLORS.danger, fontSize: 12, marginTop: 8 },
  pie: { alignItems: 'center', marginTop: 30 },
  pieLinea: { width: '100%', height: 1, backgroundColor: COLORS.border, marginBottom: 18 },
  pieTexto: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '800' },
  pieDetalle: { color: COLORS.textMuted, fontSize: 11, marginTop: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '82%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 18 },
  modalDetalleCard: { width: '100%', maxWidth: 620, maxHeight: '88%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 18 },
  modalTitulo: { color: COLORS.forest, fontSize: 18, fontWeight: '900', marginBottom: 7 },
  modalSubtitulo: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 14 },
  modalBuscador: { minHeight: 44, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, paddingHorizontal: 12, color: COLORS.text, marginVertical: 10 },
  modalLista: { maxHeight: 420 },
  modalOpcion: { paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.background, borderRadius: 8 },
  modalOpcionActiva: { backgroundColor: COLORS.goldSoft },
  modalOpcionTexto: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  modalOpcionTextoActivo: { color: COLORS.goldText, fontWeight: '900' },
  modalSinResultados: { color: COLORS.textMuted, fontSize: 12, padding: 15, textAlign: 'center' },
  modalCerrar: { alignSelf: 'flex-end', backgroundColor: COLORS.forest, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, marginTop: 14 },
  modalCerrarTexto: { color: COLORS.surface, fontSize: 12, fontWeight: '800' },
  modalDatoFila: { borderBottomWidth: 1, borderBottomColor: COLORS.background, paddingVertical: 10 },
  modalDatoEtiqueta: { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  modalDatoValor: { color: COLORS.text, fontSize: 13, lineHeight: 19 },
  modalSeccion: { paddingTop: 13, marginTop: 5 },
  modalObservaciones: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  modalEstadoLocal: { color: COLORS.textMuted, fontSize: 11, marginTop: 14 },
});
