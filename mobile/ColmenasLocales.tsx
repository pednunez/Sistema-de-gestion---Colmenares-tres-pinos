import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import DateTimePicker from '@react-native-community/datetimepicker';

import { COLORS } from './theme';
import FormularioInspeccion from './FormularioInspeccion';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  actualizarColmena,
  asociarQrColmena,
  crearColmena,
  darDeBajaColmena,
  listarColmenas,
  obtenerColmenaPorQr,
} from './api/colmenas';
import type {
  ColmenaActualizar,
  ColmenaApi,
  ColmenaCrear,
  EstadoColmenaApi,
} from './api/colmenas';
import { API_BASE_URL } from './api/config';
import { solicitarAPI } from './api/cliente';
import { leerSesionGuardada, tokenVigente } from './api/auth';
import type { SesionMovil } from './api/auth';
import { listarTransferencias } from './api/transferencias';
import type { TransferenciaMarco } from './api/transferencias';
import { descargarCatalogo, leerCatalogoLocal } from './database/catalogo';
import type { CatalogoMovil } from './database/catalogo';
import {
  listarTransferenciasPreparadas,
  listarInspeccionesDashboardLocales,
  listarMarcosInspeccionLocal,
} from './database/inspeccionesAvanzadas';
import type {
  InspeccionDashboardLocal,
  MarcoInspeccionDetalleLocal,
} from './database/inspeccionesAvanzadas';
import { listarTratamientosLocales } from './database/tratamientos';
import type { TratamientoGuardado } from './database/tratamientos';

type Props = {
  onVolver: () => void;
  onEscanear: () => void;
  onVerInspecciones: () => void;
  onInspeccionar?: (colmenaId: number) => void;
  onAbrirTratamientos?: (colmenaId: number) => void;
  apiarioIdInicial?: number;
  colmenaIdsIniciales?: number[];
  colmenaIdInicial?: number;
  catalogoVersion?: number;
  rol?: string;
};

type FiltroEstado = 'TODAS' | EstadoColmenaApi;
type TipoEvento = 'INSPECCION' | 'TRATAMIENTO' | 'TRANSFERENCIA' | 'OTRO';
type FiltroEvento = 'TODOS' | TipoEvento;

type InspeccionServidor = {
  id: number;
  colmena_id: number;
  usuario_id?: number;
  fecha_inspeccion: string;
  estado_general?: string | null;
  reina_observada?: boolean | null;
  presencia_cria?: boolean | null;
  postura?: boolean | null;
  nivel_poblacion?: string | null;
  reservas_alimento?: string | null;
  cantidad_marcos?: number | null;
  tiene_alza?: boolean | null;
  miel?: string | null;
  alimentacion_suministrada?: string | null;
  signos_enfermedad?: boolean | null;
  enfermedad_observada?: string | null;
  tiras_medicamento?: number | null;
  observaciones?: string | null;
  marcos?: Array<{
    ubicacion?: string;
    numero?: number;
    contenido?: string;
    transferido_a_colmena_id?: number | null;
    ubicacion_destino?: string | null;
    marco_desplazado_numero?: number | null;
    retirar_a_bodega?: boolean;
  }>;
};

type TratamientoServidor = {
  id: number;
  colmena_id: number;
  usuario_id?: number;
  inspeccion_id?: number | null;
  tipo_tratamiento: string;
  producto?: string | null;
  dosis?: string | null;
  motivo?: string | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
  estado?: string | null;
  observaciones?: string | null;
};

type EventoServidor = {
  colmena_id: number;
  fecha: string;
  tipo_evento: string;
  evento_id: number;
  detalle?: string | null;
};

type TransferenciaLocal = Awaited<ReturnType<typeof listarTransferenciasPreparadas>>[number];

type PaqueteHistorial = {
  eventos: EventoServidor[];
  inspecciones: InspeccionServidor[];
  tratamientos: TratamientoServidor[];
  transferencias: TransferenciaMarco[];
};

type EventoHistorial = {
  key: string;
  tipo: TipoEvento;
  fecha: string | null;
  titulo: string;
  lineas: string[];
  estado?: string;
  inspeccionServidor?: InspeccionServidor;
  inspeccionLocal?: InspeccionDashboardLocal;
};

type FormularioColmena = {
  apiario_id: string;
  codigo: string;
  estado: Exclude<EstadoColmenaApi, 'BAJA'>;
  fecha_instalacion: string;
  cantidad_marcos: string;
  observaciones: string;
};

type FormularioLote = {
  apiario_id: string;
  prefijo: string;
  desde_numero: string;
  cantidad: string;
  cantidad_marcos: string;
  fecha_instalacion: string;
};

const ESTADOS: Array<{ valor: Exclude<EstadoColmenaApi, 'BAJA'>; texto: string }> = [
  { valor: 'ACTIVA', texto: 'Activa' },
  { valor: 'EN_OBSERVACION', texto: 'En observación' },
  { valor: 'INACTIVA', texto: 'Inactiva' },
];

let conexionCache: Promise<SQLite.SQLiteDatabase> | null = null;

async function obtenerBDCache(): Promise<SQLite.SQLiteDatabase> {
  if (!conexionCache) {
    conexionCache = SQLite.openDatabaseAsync('colmenas.db').catch((error) => {
      conexionCache = null;
      throw error;
    });
  }
  const db = await conexionCache;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS colmenas_cache_mobile (
      usuario_id INTEGER PRIMARY KEY,
      contenido TEXT NOT NULL,
      actualizado_en TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS colmenas_historial_cache_mobile (
      usuario_id INTEGER NOT NULL,
      colmena_id INTEGER NOT NULL,
      contenido TEXT NOT NULL,
      actualizado_en TEXT NOT NULL,
      PRIMARY KEY (usuario_id, colmena_id)
    );
    CREATE TABLE IF NOT EXISTS colmenas_inspecciones_cache_mobile (
      usuario_id INTEGER PRIMARY KEY,
      contenido TEXT NOT NULL,
      actualizado_en TEXT NOT NULL
    );
  `);
  return db;
}

async function guardarColmenasCache(usuarioId: number, colmenas: ColmenaApi[]): Promise<void> {
  const db = await obtenerBDCache();
  await db.runAsync(
    `INSERT INTO colmenas_cache_mobile (usuario_id, contenido, actualizado_en)
     VALUES (?, ?, ?)
     ON CONFLICT(usuario_id) DO UPDATE SET
       contenido = excluded.contenido,
       actualizado_en = excluded.actualizado_en`,
    [usuarioId, JSON.stringify(colmenas), new Date().toISOString()]
  );
}

async function leerColmenasCache(usuarioId: number): Promise<ColmenaApi[] | null> {
  const db = await obtenerBDCache();
  const fila = await db.getFirstAsync<{ contenido: string }>(
    'SELECT contenido FROM colmenas_cache_mobile WHERE usuario_id = ?',
    [usuarioId]
  );
  if (!fila) return null;
  try {
    const valor = JSON.parse(fila.contenido) as ColmenaApi[];
    return Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

async function guardarInspeccionesServidorCache(usuarioId: number, inspecciones: InspeccionServidor[]): Promise<void> {
  const db = await obtenerBDCache();
  await db.runAsync(
    `INSERT INTO colmenas_inspecciones_cache_mobile (usuario_id, contenido, actualizado_en)
     VALUES (?, ?, ?)
     ON CONFLICT(usuario_id) DO UPDATE SET
       contenido = excluded.contenido,
       actualizado_en = excluded.actualizado_en`,
    [usuarioId, JSON.stringify(inspecciones), new Date().toISOString()]
  );
}

async function leerInspeccionesServidorCache(usuarioId: number): Promise<InspeccionServidor[]> {
  const db = await obtenerBDCache();
  const fila = await db.getFirstAsync<{ contenido: string }>(
    'SELECT contenido FROM colmenas_inspecciones_cache_mobile WHERE usuario_id = ?',
    [usuarioId]
  );
  if (!fila) return [];
  try {
    const valor = JSON.parse(fila.contenido) as InspeccionServidor[];
    return Array.isArray(valor) ? valor : [];
  } catch {
    return [];
  }
}

async function guardarHistorialCache(usuarioId: number, colmenaId: number, datos: PaqueteHistorial): Promise<void> {
  const db = await obtenerBDCache();
  await db.runAsync(
    `INSERT INTO colmenas_historial_cache_mobile
       (usuario_id, colmena_id, contenido, actualizado_en)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(usuario_id, colmena_id) DO UPDATE SET
       contenido = excluded.contenido,
       actualizado_en = excluded.actualizado_en`,
    [usuarioId, colmenaId, JSON.stringify(datos), new Date().toISOString()]
  );
}

async function leerHistorialCache(usuarioId: number, colmenaId: number): Promise<PaqueteHistorial | null> {
  const db = await obtenerBDCache();
  const fila = await db.getFirstAsync<{ contenido: string }>(
    `SELECT contenido FROM colmenas_historial_cache_mobile
     WHERE usuario_id = ? AND colmena_id = ?`,
    [usuarioId, colmenaId]
  );
  if (!fila) return null;
  try {
    const valor = JSON.parse(fila.contenido) as PaqueteHistorial;
    return {
      eventos: Array.isArray(valor.eventos) ? valor.eventos : [],
      inspecciones: Array.isArray(valor.inspecciones) ? valor.inspecciones : [],
      tratamientos: Array.isArray(valor.tratamientos) ? valor.tratamientos : [],
      transferencias: Array.isArray(valor.transferencias) ? valor.transferencias : [],
    };
  } catch {
    return null;
  }
}

function fechaHoy(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function fechaValidaISO(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() + 1 === mes && fecha.getUTCDate() === dia;
}

function formatearFecha(valor?: string | null): string {
  if (!valor) return 'Sin registro';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00:00`)
    : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatearFechaHora(valor?: string | null): string {
  if (!valor) return 'Fecha no disponible';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return formatearFecha(valor);
  return fecha.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fechaDatePicker(valor?: string): Date {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return new Date();
  const [anio, mes, dia] = valor.split('-').map(Number);
  return new Date(anio, mes - 1, dia, 12, 0, 0);
}

function fechaISODatePicker(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function fechaHistorialTexto(valor: string): string {
  if (!valor) return 'dd-mm-aaaa';
  const [anio, mes, dia] = valor.split('-');
  return `${dia}-${mes}-${anio}`;
}

function humanizar(valor?: string | null): string {
  if (!valor) return 'Sin información';
  return valor.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letra) => letra.toUpperCase());
}

function estadoColmenaTexto(estado: string): string {
  const nombres: Record<string, string> = {
    ACTIVA: 'Activa', EN_OBSERVACION: 'En observación', INACTIVA: 'Inactiva', BAJA: 'Dada de baja',
  };
  return nombres[estado] ?? humanizar(estado);
}

function estadoGeneralTexto(estado?: string | null): string {
  const nombres: Record<string, string> = {
    COMPLETA: 'Completa', EN_DESARROLLO: 'En desarrollo', DONANTE: 'Donante',
    DEBIL: 'Débil', REQUIERE_REVISION: 'Requiere revisión', BUENO: 'Bueno',
    REGULAR: 'Regular', CRITICO: 'Crítico',
  };
  return estado ? (nombres[estado] ?? humanizar(estado)) : 'Sin estado';
}

const DIAS_SIN_INSPECCION = 30;

function diasDesdeInspeccion(valor?: string | null): number | null {
  if (!valor) return null;
  const fecha = /^\\d{4}-\\d{2}-\\d{2}$/.test(valor)
    ? new Date(`${valor}T00:00:00`)
    : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
}

/**
 * Replica las reglas de frontend/src/utils/alertas.js:
 * solo colmenas operativas; alerta por estado de inspección, enfermedad,
 * estado débil/regular, observación, ausencia de inspecciones o más de 30 días.
 */
function calcularColmenasConAtencion(
  colmenas: ColmenaApi[],
  inspecciones: InspeccionServidor[]
): Set<number> {
  const ultimas = new Map<number, InspeccionServidor>();

  for (const inspeccion of inspecciones) {
    const actual = ultimas.get(inspeccion.colmena_id);
    const fechaNueva = new Date(inspeccion.fecha_inspeccion).getTime();
    const fechaActual = actual ? new Date(actual.fecha_inspeccion).getTime() : Number.NEGATIVE_INFINITY;
    if (!actual || (Number.isFinite(fechaNueva) && fechaNueva > fechaActual)) {
      ultimas.set(inspeccion.colmena_id, inspeccion);
    }
  }

  const conAtencion = new Set<number>();
  for (const colmena of colmenas) {
    if (colmena.estado === 'INACTIVA' || colmena.estado === 'BAJA') continue;

    const ultima = ultimas.get(colmena.id);
    let requiereAtencion = false;

    if (
      ultima?.estado_general === 'REQUIERE_REVISION' ||
      ultima?.estado_general === 'CRITICO' ||
      Boolean(ultima?.signos_enfermedad) ||
      ultima?.estado_general === 'DEBIL' ||
      ultima?.estado_general === 'REGULAR' ||
      colmena.estado === 'EN_OBSERVACION'
    ) {
      requiereAtencion = true;
    }

    if (!ultima) {
      requiereAtencion = true;
    } else {
      const dias = diasDesdeInspeccion(ultima.fecha_inspeccion);
      if (dias !== null && dias > DIAS_SIN_INSPECCION) requiereAtencion = true;
    }

    if (requiereAtencion) conAtencion.add(colmena.id);
  }

  return conAtencion;
}

function tipoEventoServidor(valor: string): TipoEvento {
  const tipo = valor.toUpperCase();
  if (tipo.includes('INSPEC')) return 'INSPECCION';
  if (tipo.includes('TRAT')) return 'TRATAMIENTO';
  if (tipo.includes('TRANSF')) return 'TRANSFERENCIA';
  return 'OTRO';
}

function crearFormulario(colmena?: ColmenaApi, apiarioInicial?: number): FormularioColmena {
  return {
    apiario_id: String(colmena?.apiario_id ?? apiarioInicial ?? ''),
    codigo: colmena?.codigo ?? '',
    estado: (colmena?.estado === 'BAJA' ? 'ACTIVA' : colmena?.estado ?? 'ACTIVA') as Exclude<EstadoColmenaApi, 'BAJA'>,
    fecha_instalacion: colmena?.fecha_instalacion ?? '',
    cantidad_marcos: String(colmena?.cantidad_marcos ?? 0),
    observaciones: colmena?.observaciones ?? '',
  };
}

function crearFormularioLote(apiarioInicial?: number): FormularioLote {
  return {
    apiario_id: apiarioInicial ? String(apiarioInicial) : '',
    prefijo: '',
    desde_numero: '1',
    cantidad: '',
    cantidad_marcos: '10',
    fecha_instalacion: '',
  };
}

function codigoColmenaLote(prefijo: string, numero: number): string {
  const base = prefijo.trim().toUpperCase().replace(/\s+/g, '-').replace(/-+$/g, '');
  return `${base}-${String(numero).padStart(3, '0')}`;
}

function construirEventos(
  colmena: ColmenaApi,
  paquete: PaqueteHistorial,
  inspeccionesLocales: InspeccionDashboardLocal[],
  tratamientosLocales: TratamientoGuardado[],
  transferenciasLocales: TransferenciaLocal[],
  colmenas: ColmenaApi[],
  inspeccionesLocalesTodas: InspeccionDashboardLocal[],
  incluirTransferenciasLocales: boolean,
): EventoHistorial[] {
  const eventos = new Map<string, EventoHistorial>();
  const agregar = (evento: EventoHistorial) => {
    const anterior = eventos.get(evento.key);
    if (!anterior) {
      eventos.set(evento.key, evento);
      return;
    }
    eventos.set(evento.key, {
      ...anterior,
      ...evento,
      lineas: [...new Set([...anterior.lineas, ...evento.lineas].filter(Boolean))],
    });
  };

  for (const item of paquete.eventos) {
    const tipo = tipoEventoServidor(item.tipo_evento);
    agregar({
      key: `${tipo}-${item.evento_id}`,
      tipo,
      fecha: item.fecha,
      titulo: tipo === 'OTRO' ? humanizar(item.tipo_evento) : humanizar(tipo),
      lineas: item.detalle ? [humanizar(item.detalle)] : [],
    });
  }

  for (const item of paquete.inspecciones) {
    if (Number(item.colmena_id) !== colmena.id) continue;
    const transferidos = (item.marcos ?? []).filter((marco) => marco.transferido_a_colmena_id != null).length;
    agregar({
      key: `INSPECCION-${item.id}`,
      tipo: 'INSPECCION',
      fecha: item.fecha_inspeccion,
      titulo: 'Inspección',
      estado: estadoGeneralTexto(item.estado_general),
      inspeccionServidor: item,
      lineas: [
        item.cantidad_marcos != null ? `${item.cantidad_marcos} marcos registrados` : '',
        item.tiene_alza ? 'Con alza' : '',
        transferidos ? `${transferidos} marcos transferidos` : '',
        item.observaciones ?? '',
      ].filter(Boolean),
    });
  }

  for (const item of inspeccionesLocales) {
    if (item.codigo_qr.trim().toLowerCase() !== colmena.codigo_qr.trim().toLowerCase()) continue;
    const idEvento = item.servidor_id ? String(item.servidor_id) : `LOCAL-${item.id}`;
    agregar({
      key: `INSPECCION-${idEvento}`,
      tipo: 'INSPECCION',
      fecha: item.fecha_local,
      titulo: item.servidor_id ? 'Inspección sincronizada' : `Inspección local N.º ${item.id}`,
      estado: item.estado === 'SINCRONIZADO' ? 'Sincronizada' : 'Pendiente de sincronización',
      inspeccionLocal: item,
      lineas: [
        `${item.marcos_totales} marcos totales`,
        `${item.marcos_cria} marcos con cría`,
        `${item.marcos_miel} marcos con miel`,
        `Reina: ${item.reina}`,
        item.observaciones,
      ].filter(Boolean),
    });
  }

  for (const item of paquete.tratamientos) {
    if (Number(item.colmena_id) !== colmena.id) continue;
    agregar({
      key: `TRATAMIENTO-${item.id}`,
      tipo: 'TRATAMIENTO',
      fecha: item.fecha_inicio,
      titulo: `Tratamiento: ${humanizar(item.tipo_tratamiento)}`,
      estado: humanizar(item.estado),
      lineas: [
        [item.producto, item.dosis].filter(Boolean).join(' · '),
        `Desde ${formatearFecha(item.fecha_inicio)}${item.fecha_fin ? ` hasta ${formatearFecha(item.fecha_fin)}` : ''}`,
        item.motivo ?? '',
        item.observaciones ?? '',
      ].filter(Boolean),
    });
  }

  for (const item of tratamientosLocales) {
    if (item.codigo_qr.trim().toLowerCase() !== colmena.codigo_qr.trim().toLowerCase()) continue;
    const idEvento = item.servidor_id ? String(item.servidor_id) : `LOCAL-${item.id}`;
    agregar({
      key: `TRATAMIENTO-${idEvento}`,
      tipo: 'TRATAMIENTO',
      fecha: item.fecha_inicio,
      titulo: `Tratamiento: ${humanizar(item.tipo_tratamiento)}`,
      estado: item.sincronizacion === 'SINCRONIZADO' ? humanizar(item.estado) : 'Pendiente de sincronización',
      lineas: [
        [item.producto, item.dosis].filter(Boolean).join(' · '),
        `Desde ${formatearFecha(item.fecha_inicio)}${item.fecha_fin ? ` hasta ${formatearFecha(item.fecha_fin)}` : ''}`,
        item.motivo,
        item.observaciones,
      ].filter(Boolean),
    });
  }

  for (const item of paquete.transferencias) {
    const sale = Number(item.colmena_origen_id) === colmena.id;
    const llega = Number(item.colmena_destino_id) === colmena.id;
    if (!sale && !llega) continue;
    const otraId = sale ? item.colmena_destino_id : item.colmena_origen_id;
    const otra = colmenas.find((c) => c.id === otraId)?.codigo ?? `Colmena #${otraId}`;
    agregar({
      key: `TRANSFERENCIA-${item.id}`,
      tipo: 'TRANSFERENCIA',
      fecha: item.fecha_transferencia ?? item.fecha_creacion,
      titulo: sale
        ? `Salida de ${item.cantidad_marcos} ${item.cantidad_marcos === 1 ? 'marco' : 'marcos'} hacia ${otra}`
        : `Llegada de ${item.cantidad_marcos} ${item.cantidad_marcos === 1 ? 'marco' : 'marcos'} desde ${otra}`,
      lineas: [
        [item.contenido && humanizar(item.contenido), item.ubicacion && humanizar(item.ubicacion), item.numero_marco ? `Marco ${item.numero_marco}` : ''].filter(Boolean).join(' · '),
        item.motivo ?? '',
        item.observaciones ?? '',
      ].filter(Boolean),
    });
  }

  {
    const inspeccionesPorId = new Map(inspeccionesLocalesTodas.map((item) => [item.id, item]));
    const porQR = new Map(colmenas.map((item) => [item.codigo_qr.trim().toLowerCase(), item]));
    for (const item of transferenciasLocales) {
      const inspeccion = inspeccionesPorId.get(item.inspeccion_local_id);
      if (!inspeccion) continue;
      const origen = porQR.get(item.origen.trim().toLowerCase());
      const destino = porQR.get(item.destino.trim().toLowerCase());
      const sale = origen?.id === colmena.id;
      const llega = destino?.id === colmena.id;
      if (!sale && !llega) continue;
      if (!incluirTransferenciasLocales && item.estado.toUpperCase() === 'SINCRONIZADO') continue;
      const otra = sale ? destino?.codigo ?? 'otra colmena' : origen?.codigo ?? 'otra colmena';
      const fecha = inspeccion.fecha_local;
      agregar({
        key: `TRANSFERENCIA-LOCAL-${item.inspeccion_local_id}-${item.ubicacion}-${item.numero}-${item.destino}`,
        tipo: 'TRANSFERENCIA',
        fecha,
        titulo: sale ? `Salida de marco hacia ${otra}` : `Llegada de marco desde ${otra}`,
        estado: inspeccion.estado === 'SINCRONIZADO' ? 'Registrada' : 'Pendiente de sincronización',
        lineas: [
          `${humanizar(item.contenido)} · ${humanizar(item.ubicacion)} · Marco ${item.numero}`,
        ],
      });
    }
  }

  return [...eventos.values()].sort((a, b) => {
    const fa = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fb = b.fecha ? new Date(b.fecha).getTime() : 0;
    return fb - fa;
  });
}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, activo && styles.chipActivo]}>
      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{texto}</Text>
    </Pressable>
  );
}

export default function ColmenasLocales({
  onEscanear,
  onInspeccionar,
  onAbrirTratamientos,
  apiarioIdInicial,
  colmenaIdsIniciales,
  colmenaIdInicial,
  catalogoVersion = 0,
  rol,
}: Props) {
  const [sesion, setSesion] = useState<SesionMovil | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoMovil | null>(null);
  const [colmenas, setColmenas] = useState<ColmenaApi[]>([]);
  const [inspeccionesServidor, setInspeccionesServidor] = useState<InspeccionServidor[]>([]);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<InspeccionDashboardLocal[]>([]);
  const [tratamientosLocales, setTratamientosLocales] = useState<TratamientoGuardado[]>([]);
  const [transferenciasLocales, setTransferenciasLocales] = useState<TransferenciaLocal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('TODAS');
  const [apiarioFiltro, setApiarioFiltro] = useState(apiarioIdInicial ? String(apiarioIdInicial) : '');
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [apiarioFiltroPickerVisible, setApiarioFiltroPickerVisible] = useState(false);
  const [estadoFiltroPickerVisible, setEstadoFiltroPickerVisible] = useState(false);
  const [idsFiltroDashboard, setIdsFiltroDashboard] = useState<number[] | null>(
    colmenaIdsIniciales?.length ? colmenaIdsIniciales : null
  );

  const [fichaId, setFichaId] = useState<number | null>(null);
  const [historial, setHistorial] = useState<PaqueteHistorial>({ eventos: [], inspecciones: [], tratamientos: [], transferencias: [] });
  const [historialCargando, setHistorialCargando] = useState(false);
  const [historialError, setHistorialError] = useState('');
  const [filtroEvento, setFiltroEvento] = useState<FiltroEvento>('TODOS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [fechaPickerVisible, setFechaPickerVisible] = useState<'desde' | 'hasta' | null>(null);
  const [inspeccionFichaVisible, setInspeccionFichaVisible] = useState(false);

  const [formularioVisible, setFormularioVisible] = useState(false);
  const [apiarioPickerVisible, setApiarioPickerVisible] = useState(false);
  const [estadoFormularioPickerVisible, setEstadoFormularioPickerVisible] = useState(false);
  const [fechaFormularioPickerVisible, setFechaFormularioPickerVisible] = useState(false);
  const [editando, setEditando] = useState<ColmenaApi | null>(null);
  const [formulario, setFormulario] = useState<FormularioColmena>(crearFormulario());
  const [guardando, setGuardando] = useState(false);
  const [colmenaABaja, setColmenaABaja] = useState<ColmenaApi | null>(null);
  const [bajaProcesando, setBajaProcesando] = useState(false);

  const [loteVisible, setLoteVisible] = useState(false);
  const [loteApiarioPickerVisible, setLoteApiarioPickerVisible] = useState(false);
  const [fechaLotePickerVisible, setFechaLotePickerVisible] = useState(false);
  const [loteFormulario, setLoteFormulario] = useState<FormularioLote>(crearFormularioLote());
  const [loteCreando, setLoteCreando] = useState(false);
  const [loteProgreso, setLoteProgreso] = useState(0);

  const [escaneoListadoVisible, setEscaneoListadoVisible] = useState(false);
  const qrListadoBloqueado = useRef(false);

  const [qrVisible, setQrVisible] = useState(false);
  const [qrModo, setQrModo] = useState<'IMPRESA' | 'NUEVA'>('IMPRESA');
  const [qrEscaneandoVisible, setQrEscaneandoVisible] = useState(false);
  const [qrManual, setQrManual] = useState('');
  const [qrManualError, setQrManualError] = useState('');
  const [guardandoQr, setGuardandoQr] = useState(false);
  const [descargandoQr, setDescargandoQr] = useState(false);
  const [qrImagenUri, setQrImagenUri] = useState<string | null>(null);
  const [qrImagenCargando, setQrImagenCargando] = useState(false);
  const [qrImagenError, setQrImagenError] = useState('');
  const qrEscaneoBloqueado = useRef(false);
  const [inspeccionDetalle, setInspeccionDetalle] = useState<EventoHistorial | null>(null);
  const [detalleMarcosLocales, setDetalleMarcosLocales] = useState<MarcoInspeccionDetalleLocal[]>([]);
  const [cargandoDetalleLocal, setCargandoDetalleLocal] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const solicitudCargaRef = useRef(0);

  const esAdmin = sesion?.usuario.rol === 'ADMIN' || rol === 'ADMIN';

  const cargarDatos = useCallback(async (manual = false) => {
    const solicitud = ++solicitudCargaRef.current;
    const sigueVigente = () => solicitudCargaRef.current === solicitud;

    if (manual) setActualizando(true);
    else setCargando(true);

    setError('');
    if (manual) setAviso('');

    try {
      const sesionActual = await leerSesionGuardada();
      if (!sigueVigente()) return;

      setSesion(sesionActual);

      const [
        catalogoLocal,
        inspecciones,
        tratamientos,
        transferencias,
        inspeccionesCache,
        colmenasCache,
      ] = await Promise.all([
        sesionActual
          ? leerCatalogoLocal(sesionActual.usuario.id).catch(() => null)
          : Promise.resolve(null),
        listarInspeccionesDashboardLocales().catch(
          () => [] as InspeccionDashboardLocal[]
        ),
        listarTratamientosLocales().catch(
          () => [] as TratamientoGuardado[]
        ),
        listarTransferenciasPreparadas().catch(
          () => [] as TransferenciaLocal[]
        ),
        sesionActual
          ? leerInspeccionesServidorCache(sesionActual.usuario.id).catch(
              () => [] as InspeccionServidor[]
            )
          : Promise.resolve([] as InspeccionServidor[]),
        sesionActual
          ? leerColmenasCache(sesionActual.usuario.id).catch(
              () => null
            )
          : Promise.resolve(null),
      ]);

      if (!sigueVigente()) return;

      const usuarioId = sesionActual?.usuario.id ?? null;
      const inspeccionesPropias = inspecciones.filter((item) =>
        usuarioId == null
          ? item.usuario_id == null
          : item.usuario_id === usuarioId || item.usuario_id == null
      );

      const idsInspeccionesPropias = new Set(
        inspeccionesPropias.map((item) => item.id)
      );

      const tratamientosPropios = tratamientos.filter((item) =>
        usuarioId == null
          ? item.usuario_local_id == null
          : item.usuario_local_id === usuarioId || item.usuario_local_id == null
      );

      const transferenciasPropias = transferencias.filter((item) =>
        idsInspeccionesPropias.has(item.inspeccion_local_id)
      );

      let lista: ColmenaApi[] = Array.isArray(colmenasCache)
        ? colmenasCache
        : [];

      if (lista.length === 0 && catalogoLocal) {
        lista = catalogoLocal.colmenas.map((item) => ({
          id: item.id,
          apiario_id: item.apiario_id,
          codigo: item.codigo,
          codigo_qr: item.codigo_qr,
          estado: item.estado as EstadoColmenaApi,
          fecha_instalacion: null,
          cantidad_marcos: item.cantidad_marcos ?? 0,
          observaciones: null,
          activo: true,
          fecha_creacion: '',
          fecha_actualizacion: '',
          fecha_eliminacion: null,
        }));
      }

      // PRIMERO se muestran los datos locales. No se espera a FastAPI
      // para pintar la lista de trabajo en terreno.
      setCatalogo(catalogoLocal);
      setInspeccionesLocales(inspeccionesPropias);
      setTratamientosLocales(tratamientosPropios);
      setTransferenciasLocales(transferenciasPropias);
      setColmenas(lista);
      setInspeccionesServidor(inspeccionesCache);

      if (lista.length > 0) {
        setCargando(false);
      }

      let online = false;
      let inspeccionesActuales = inspeccionesCache;
      const mensajesAviso: string[] = [];

      if (sesionActual && tokenVigente(sesionActual)) {
        // Las dos consultas remotas son independientes: ejecutarlas
        // en paralelo evita sumar innecesariamente sus latencias.
        const [resultadoColmenas, resultadoInspecciones] =
          await Promise.allSettled([
            listarColmenas(sesionActual.accessToken, {
              orden: 'codigo',
            }),
            solicitarAPI<InspeccionServidor[]>(
              '/movil/inspecciones-resumen?ultimas_por_colmena=true',
              {
                method: 'GET',
                token: sesionActual.accessToken,
              }
            ),
          ] as const);

        if (!sigueVigente()) return;

        if (resultadoColmenas.status === 'fulfilled') {
          lista = resultadoColmenas.value.filter(
            (item) =>
              item.activo !== false &&
              item.estado !== 'BAJA'
          );

          setColmenas(lista);
          online = true;

          // La escritura de caché no bloquea el refresco visual.
          void guardarColmenasCache(
            sesionActual.usuario.id,
            lista
          ).catch((error) => {
            console.warn(
              '[Colmenares] No se pudo guardar la caché de colmenas:',
              error
            );
          });
        } else {
          const mensaje =
            resultadoColmenas.reason instanceof Error
              ? resultadoColmenas.reason.message
              : 'No se pudo consultar FastAPI.';

          mensajesAviso.push(
            lista.length
              ? `Sin conexión con el servidor. Se muestra la última copia guardada. ${mensaje}`
              : mensaje
          );
        }

        if (resultadoInspecciones.status === 'fulfilled') {
          inspeccionesActuales = Array.isArray(
            resultadoInspecciones.value
          )
            ? resultadoInspecciones.value
            : [];

          setInspeccionesServidor(inspeccionesActuales);

          void guardarInspeccionesServidorCache(
            sesionActual.usuario.id,
            inspeccionesActuales
          ).catch((error) => {
            console.warn(
              '[Colmenares] No se pudo guardar la caché de inspecciones:',
              error
            );
          });
        } else {
          const mensaje =
            resultadoInspecciones.reason instanceof Error
              ? resultadoInspecciones.reason.message
              : 'No se pudieron actualizar las inspecciones.';

          mensajesAviso.push(
            inspeccionesActuales.length
              ? `Se conserva la última copia de inspecciones. ${mensaje}`
              : `No se pudieron cargar las alertas del servidor. ${mensaje}`
          );
        }
      } else if (sesionActual) {
        mensajesAviso.push(
          'La sesión venció. Se muestran las últimas copias guardadas en el dispositivo.'
        );
      } else {
        mensajesAviso.push(
          'No hay una sesión activa. Se muestran los datos locales disponibles.'
        );
      }

      if (!sigueVigente()) return;

      // Si el catálogo se terminó de descargar mientras se consultaba
      // FastAPI, usar la versión recién guardada y no la copia anterior.
      let catalogoFinal = catalogoLocal;

      if (sesionActual) {
        const catalogoActualizado = await leerCatalogoLocal(
          sesionActual.usuario.id
        ).catch(() => null);

        if (catalogoActualizado) {
          catalogoFinal = catalogoActualizado;
        }
      }

      if (!sigueVigente()) return;

      if (!catalogoFinal) {
        mensajesAviso.push(
          'No hay un catálogo oficial guardado en este dispositivo.'
        );
      } else if (!online) {
        mensajesAviso.push(
          'Se está utilizando la última información guardada en el dispositivo.'
        );
      }

      setCatalogo(catalogoFinal);
      setInspeccionesServidor(inspeccionesActuales);
      setAviso(mensajesAviso.join(' '));
      setConectado(online);
      setColmenas(lista);

      if (lista.length === 0 && !catalogoFinal) {
        setError(
          'No hay colmenas guardadas en el dispositivo. Conéctate al servidor para descargar el catálogo oficial.'
        );
      }
    } catch (error) {
      if (!sigueVigente()) return;

      console.error(
        '[Colmenares] Error cargando módulo Colmenas:',
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar las colmenas.'
      );
    } finally {
      if (sigueVigente()) {
        setCargando(false);
        setActualizando(false);
      }
    }
  }, []);

  useEffect(() => {
    void cargarDatos(false);

    return () => {
      solicitudCargaRef.current += 1;
    };
  }, [cargarDatos]);

  // Cuando el catálogo se actualiza en segundo plano, refrescar solo
  // la copia local del catálogo sin repetir todas las consultas remotas.
  useEffect(() => {
    if (catalogoVersion <= 0) return;

    let activo = true;

    const actualizarCatalogoLocal = async () => {
      const sesionActual = await leerSesionGuardada();
      if (!sesionActual) return;

      const catalogoActual = await leerCatalogoLocal(
        sesionActual.usuario.id
      ).catch(() => null);

      if (activo && catalogoActual) {
        setCatalogo(catalogoActual);
      }
    };

    void actualizarCatalogoLocal().catch((error) => {
      console.warn(
        '[Colmenares] No se pudo releer el catálogo actualizado:',
        error
      );
    });

    return () => {
      activo = false;
    };
  }, [catalogoVersion]);

  useEffect(() => {
    if (apiarioIdInicial) setApiarioFiltro(String(apiarioIdInicial));
    if (colmenaIdsIniciales?.length) setIdsFiltroDashboard(colmenaIdsIniciales);
  }, [apiarioIdInicial, colmenaIdsIniciales]);

  useEffect(() => {
    if (!colmenaIdInicial || colmenas.length === 0) return;
    const existe = colmenas.find((item) => item.id === colmenaIdInicial);
    if (existe) setFichaId(existe.id);
  }, [colmenaIdInicial, colmenas]);

  const apiarios = catalogo?.apiarios ?? [];
  const nombreApiario = useCallback((id: number) => {
    return apiarios.find((item) => item.id === id)?.nombre ?? `Apiario #${id}`;
  }, [apiarios]);

  const inspeccionesParaAlertas = useMemo(() => {
    const idsRemotos = new Set(inspeccionesServidor.map((item) => Number(item.id)));
    const colmenasPorQr = new Map(
      colmenas.map((item) => [item.codigo_qr.trim().toLowerCase(), item])
    );

    const locales = inspeccionesLocales.flatMap((item) => {
      const colmena = colmenasPorQr.get(item.codigo_qr.trim().toLowerCase());
      if (!colmena) return [];
      if (item.servidor_id && idsRemotos.has(Number(item.servidor_id))) return [];

      return [{
        id: item.servidor_id ?? -Math.abs(Number(item.id)),
        colmena_id: colmena.id,
        usuario_id: item.usuario_id ?? undefined,
        fecha_inspeccion: item.fecha_local,
        estado_general: item.estado_general,
        reina_observada: item.reina_observada == null ? null : Boolean(item.reina_observada),
        presencia_cria: item.presencia_cria == null ? null : Boolean(item.presencia_cria),
        postura: item.postura == null ? null : Boolean(item.postura),
        nivel_poblacion: item.nivel_poblacion,
        reservas_alimento: item.reservas_alimento,
        cantidad_marcos: item.marcos_totales,
        tiene_alza: item.tiene_alza == null ? null : Boolean(item.tiene_alza),
        miel: item.miel,
        alimentacion_suministrada: item.alimentacion_suministrada,
        signos_enfermedad: item.signos_enfermedad == null ? false : Boolean(item.signos_enfermedad),
        enfermedad_observada: item.enfermedad_observada,
        tiras_medicamento: item.tiras_medicamento,
        observaciones: item.observaciones,
      } as InspeccionServidor];
    });

    return [...inspeccionesServidor, ...locales];
  }, [inspeccionesServidor, inspeccionesLocales, colmenas]);

  const colmenasConAtencion = useMemo(
    () => calcularColmenasConAtencion(colmenas, inspeccionesParaAlertas),
    [colmenas, inspeccionesParaAlertas]
  );

  // Un solo recorrido para encontrar la última inspección por colmena.
  // Evita filtrar y ordenar toda la colección una vez por cada tarjeta.
  const ultimasInspeccionesPorColmena = useMemo(() => {
    const ultimas = new Map<number, InspeccionServidor>();

    for (const inspeccion of inspeccionesParaAlertas) {
      const actual = ultimas.get(inspeccion.colmena_id);
      const fechaNueva = Date.parse(inspeccion.fecha_inspeccion);
      const fechaActual = actual
        ? Date.parse(actual.fecha_inspeccion)
        : Number.NEGATIVE_INFINITY;

      if (
        !actual ||
        (
          Number.isFinite(fechaNueva) &&
          (
            !Number.isFinite(fechaActual) ||
            fechaNueva > fechaActual
          )
        )
      ) {
        ultimas.set(inspeccion.colmena_id, inspeccion);
      }
    }

    return ultimas;
  }, [inspeccionesParaAlertas]);

  const colmenasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return colmenas.filter((item) => {
      const coincideTexto = !termino || item.codigo.toLowerCase().includes(termino) || item.codigo_qr.toLowerCase().includes(termino);
      const coincideEstado = filtroEstado === 'TODAS' || item.estado === filtroEstado;
      const coincideApiario = !apiarioFiltro || String(item.apiario_id) === apiarioFiltro;
      const coincideDashboard = !idsFiltroDashboard || idsFiltroDashboard.includes(item.id);
      const coincideAtencion = !soloAtencion || colmenasConAtencion.has(item.id);
      return coincideTexto && coincideEstado && coincideApiario && coincideDashboard && coincideAtencion;
    });
  }, [colmenas, busqueda, filtroEstado, apiarioFiltro, idsFiltroDashboard, soloAtencion, colmenasConAtencion]);

  const ficha = useMemo(() => colmenas.find((item) => item.id === fichaId) ?? null, [colmenas, fichaId]);

  const eventosHistorial = useMemo(() => {
    if (!ficha) return [];
    return construirEventos(
      ficha,
      historial,
      inspeccionesLocales.filter((item) => item.codigo_qr.trim().toLowerCase() === ficha.codigo_qr.trim().toLowerCase()),
      tratamientosLocales.filter((item) => item.codigo_qr.trim().toLowerCase() === ficha.codigo_qr.trim().toLowerCase()),
      transferenciasLocales,
      colmenas,
      inspeccionesLocales,
      !conectado,
    );
  }, [ficha, historial, inspeccionesLocales, tratamientosLocales, transferenciasLocales, colmenas, conectado]);

  const conteosEventos = useMemo(() => {
    const conteo: Record<string, number> = { TODOS: eventosHistorial.length };
    for (const evento of eventosHistorial) conteo[evento.tipo] = (conteo[evento.tipo] ?? 0) + 1;
    return conteo;
  }, [eventosHistorial]);

  const eventosVisibles = useMemo(() => eventosHistorial.filter((evento) => {
    if (filtroEvento !== 'TODOS' && evento.tipo !== filtroEvento) return false;
    const dia = String(evento.fecha ?? '').slice(0, 10);
    if (desde && (!dia || dia < desde)) return false;
    if (hasta && (!dia || dia > hasta)) return false;
    return true;
  }), [eventosHistorial, filtroEvento, desde, hasta]);

  const ultimaInspeccion = useMemo(() => {
    if (!ficha) return null;

    const ultima = ultimasInspeccionesPorColmena.get(ficha.id);

    return ultima
      ? {
          fecha: ultima.fecha_inspeccion,
          estado: ultima.estado_general ?? null,
        }
      : null;
  }, [ficha, ultimasInspeccionesPorColmena]);

  const cargarHistorial = useCallback(async (colmena: ColmenaApi) => {
    setHistorialCargando(true);
    setHistorialError('');
    setFiltroEvento('TODOS');
    setDesde('');
    setHasta('');

    const usuarioId = sesion?.usuario.id;
    let paquete: PaqueteHistorial = { eventos: [], inspecciones: [], tratamientos: [], transferencias: [] };
    let hayCache = false;
    if (usuarioId) {
      const cache = await leerHistorialCache(usuarioId, colmena.id).catch(() => null);
      if (cache) {
        paquete = cache;
        hayCache = true;
        setHistorial(cache);
      }
    }

    if (sesion && tokenVigente(sesion)) {
      const token = sesion.accessToken;
      const [eventos, inspecciones, tratamientos, transferencias] = await Promise.all([
        solicitarAPI<EventoServidor[]>(`/historial/colmenas/${colmena.id}`, { method: 'GET', token }).catch(() => null),
        solicitarAPI<InspeccionServidor[]>(`/inspecciones/?colmena_id=${colmena.id}`, { method: 'GET', token }).catch(() => null),
        solicitarAPI<TratamientoServidor[]>(`/tratamientos/?colmena_id=${colmena.id}`, { method: 'GET', token }).catch(() => null),
        listarTransferencias(sesion, colmena.id).catch(() => null),
      ]);

      const actualizado: PaqueteHistorial = {
        eventos: eventos ?? paquete.eventos,
        inspecciones: inspecciones ? inspecciones.filter((item) => item.colmena_id === colmena.id) : paquete.inspecciones,
        tratamientos: tratamientos ? tratamientos.filter((item) => item.colmena_id === colmena.id) : paquete.tratamientos,
        transferencias: transferencias
          ? transferencias.filter((item) => item.colmena_origen_id === colmena.id || item.colmena_destino_id === colmena.id)
          : paquete.transferencias,
      };
      const huboRespuesta = eventos !== null || inspecciones !== null || tratamientos !== null || transferencias !== null;
      if (huboRespuesta) {
        paquete = actualizado;
        setHistorial(actualizado);
        if (usuarioId) await guardarHistorialCache(usuarioId, colmena.id, actualizado).catch(() => undefined);
      } else if (!hayCache) {
        setHistorialError('No se pudo consultar el historial del servidor. Se muestran los registros locales disponibles.');
      }
    } else if (!hayCache) {
      setHistorialError('Sin conexión o sesión vencida. Se muestran los registros guardados en este dispositivo.');
    }

    setHistorial(paquete);
    setHistorialCargando(false);
  }, [sesion]);

  useEffect(() => {
    if (!ficha) return;
    void cargarHistorial(ficha);
  }, [ficha, cargarHistorial]);

  // En Android, mostrar directamente una imagen protegida por Bearer puede
  // fallar aunque la descarga autenticada funcione. Descargamos el PNG al
  // caché de la app y mostramos el archivo local.
  useEffect(() => {
    let cancelado = false;

    setQrImagenUri(null);
    setQrImagenError('');

    if (!ficha || !sesion || !tokenVigente(sesion) || !conectado) {
      setQrImagenCargando(false);
      return () => {
        cancelado = true;
      };
    }

    const cargarQrParaVista = async () => {
      setQrImagenCargando(true);
      try {
        const directorioCache = FileSystem.cacheDirectory;
        if (!directorioCache) {
          throw new Error('El dispositivo no habilitó el caché de imágenes.');
        }

        const codigoSeguro = String(ficha.codigo_qr || ficha.codigo)
          .replace(/[^A-Za-z0-9_-]/g, '_');
        const destino = `${directorioCache}qr-colmena-${ficha.id}-${codigoSeguro}.png`;

        await FileSystem.deleteAsync(destino, { idempotent: true }).catch(() => undefined);

        const descarga = await FileSystem.downloadAsync(
          `${API_BASE_URL}/colmenas/${ficha.id}/qr`,
          destino,
          {
            headers: {
              Accept: 'image/png',
              Authorization: `Bearer ${sesion.accessToken}`,
            },
          }
        );

        if (descarga.status < 200 || descarga.status >= 300) {
          throw new Error(`No se pudo cargar el QR (HTTP ${descarga.status}).`);
        }

        const informacion = await FileSystem.getInfoAsync(descarga.uri);
        if (!informacion.exists || !informacion.size) {
          throw new Error('El servidor entregó una imagen QR vacía.');
        }

        if (!cancelado) {
          setQrImagenUri(descarga.uri);
        }
      } catch (error) {
        console.warn('[Colmenares] No se pudo mostrar el QR de la colmena:', error);
        if (!cancelado) {
          setQrImagenError(
            error instanceof Error ? error.message : 'No se pudo cargar la imagen QR.'
          );
        }
      } finally {
        if (!cancelado) {
          setQrImagenCargando(false);
        }
      }
    };

    void cargarQrParaVista();

    return () => {
      cancelado = true;
    };
  }, [ficha?.id, ficha?.codigo, ficha?.codigo_qr, sesion?.accessToken, conectado]);

  const abrirNueva = () => {
    if (!esAdmin) return;
    setEditando(null);
    setFormulario(crearFormulario(undefined, apiarioIdInicial));
    setFormularioVisible(true);
  };

  const abrirEdicion = (colmena: ColmenaApi) => {
    setEditando(colmena);
    setFormulario(crearFormulario(colmena));
    setFormularioVisible(true);
  };

  const guardarFormulario = async () => {
    if (!esAdmin) {
      Alert.alert('Acceso restringido', 'Solo un administrador puede crear o modificar colmenas.');
      return;
    }
    if (!sesion || !tokenVigente(sesion)) {
      Alert.alert('Sin sesión vigente', 'Debes iniciar sesión nuevamente y tener conexión para guardar cambios.');
      return;
    }

    const codigo = formulario.codigo.trim().toUpperCase();
    const apiarioId = Number(formulario.apiario_id);
    if (!apiarioId || !apiarios.some((item) => item.id === apiarioId)) {
      Alert.alert('Dato obligatorio', 'Selecciona el apiario de la colmena.');
      return;
    }
    if (!codigo || codigo.length > 50) {
      Alert.alert('Código inválido', 'Ingresa un código de entre 1 y 50 caracteres.');
      return;
    }
    if (colmenas.some((item) => item.id !== editando?.id && item.codigo.trim().toLowerCase() === codigo.toLowerCase())) {
      Alert.alert('Código duplicado', 'Ya existe una colmena con ese código.');
      return;
    }
    if (formulario.fecha_instalacion && (!fechaValidaISO(formulario.fecha_instalacion) || formulario.fecha_instalacion > fechaHoy())) {
      Alert.alert('Fecha inválida', 'La fecha de instalación debe ser válida y no puede ser futura.');
      return;
    }

    const datos: ColmenaCrear = {
      apiario_id: apiarioId,
      codigo,
      estado: formulario.estado,
      fecha_instalacion: formulario.fecha_instalacion || null,
      observaciones: formulario.observaciones.trim() || null,
      ...(editando ? { cantidad_marcos: editando.cantidad_marcos } : {}),
    };

    setGuardando(true);
    try {
      if (editando) {
        const cambios: ColmenaActualizar = datos;
        await actualizarColmena(editando.id, cambios, sesion.accessToken);
      } else {
        await crearColmena(datos, sesion.accessToken);
      }
      await descargarCatalogo(sesion).catch(() => undefined);
      setFormularioVisible(false);
      await cargarDatos(true);
      Alert.alert('Guardado', editando ? 'La colmena se actualizó correctamente.' : 'La colmena se registró correctamente.');
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Ocurrió un error al guardar la colmena.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarBaja = (colmena: ColmenaApi) => {
    if (!esAdmin) return;
    if (!sesion || !tokenVigente(sesion)) {
      Alert.alert('Sin conexión', 'Necesitas una sesión vigente para dar de baja una colmena.');
      return;
    }
    setColmenaABaja(colmena);
  };

  const ejecutarBaja = async () => {
    if (!colmenaABaja || !sesion || !tokenVigente(sesion) || bajaProcesando) return;
    setBajaProcesando(true);
    try {
      await darDeBajaColmena(colmenaABaja.id, sesion.accessToken);
      const codigo = colmenaABaja.codigo;
      setColmenaABaja(null);
      setFichaId(null);
      await descargarCatalogo(sesion).catch(() => undefined);
      await cargarDatos(true);
      Alert.alert('Colmena dada de baja', `${codigo} dejó de aparecer en los listados operativos. Su historial se conserva.`);
    } catch (e) {
      Alert.alert('No se pudo dar de baja', e instanceof Error ? e.message : 'Ocurrió un error.');
    } finally {
      setBajaProcesando(false);
    }
  };

  const abrirCrearLote = () => {
    if (!esAdmin) return;
    setLoteFormulario(crearFormularioLote(apiarioFiltro ? Number(apiarioFiltro) : apiarioIdInicial));
    setLoteProgreso(0);
    setLoteVisible(true);
  };

  const crearColmenasEnLote = async () => {
    if (!esAdmin) return;
    if (!sesion || !tokenVigente(sesion)) {
      Alert.alert('Sin sesión vigente', 'Debes iniciar sesión nuevamente y tener conexión para crear colmenas.');
      return;
    }

    const apiarioId = Number(loteFormulario.apiario_id);
    const prefijo = loteFormulario.prefijo.trim().toUpperCase().replace(/\s+/g, '-').replace(/-+$/g, '');
    const desdeNumero = Number(loteFormulario.desde_numero);
    const cantidad = Number(loteFormulario.cantidad);
    const marcos = Number(loteFormulario.cantidad_marcos);

    if (!apiarioId || !apiarios.some((item) => item.id === apiarioId)) {
      Alert.alert('Dato obligatorio', 'Selecciona el apiario donde se crearán las colmenas.');
      return;
    }
    if (!prefijo || prefijo.length > 35 || !/^[A-Z0-9_-]+$/.test(prefijo)) {
      Alert.alert('Prefijo inválido', 'Ingresa un prefijo válido, por ejemplo CUL o MAN.');
      return;
    }
    if (!Number.isInteger(desdeNumero) || desdeNumero < 1) {
      Alert.alert('Número inicial inválido', 'El número inicial debe ser un entero mayor que cero.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) {
      Alert.alert('Cantidad inválida', 'Puedes crear entre 1 y 500 colmenas por lote.');
      return;
    }
    if (!Number.isInteger(marcos) || marcos < 0) {
      Alert.alert('Marcos inválidos', 'Los marcos por colmena deben ser un entero igual o mayor que cero.');
      return;
    }
    if (loteFormulario.fecha_instalacion && (!fechaValidaISO(loteFormulario.fecha_instalacion) || loteFormulario.fecha_instalacion > fechaHoy())) {
      Alert.alert('Fecha inválida', 'La fecha de instalación debe ser válida y no puede ser futura.');
      return;
    }

    const codigos = Array.from({ length: cantidad }, (_, indice) => codigoColmenaLote(prefijo, desdeNumero + indice));
    const existentes = new Set(colmenas.map((item) => item.codigo.trim().toLowerCase()));
    const duplicados = codigos.filter((codigo) => existentes.has(codigo.toLowerCase()));
    if (duplicados.length > 0) {
      Alert.alert(
        'Códigos ya registrados',
        `El lote contiene códigos que ya existen: ${duplicados.slice(0, 5).join(', ')}${duplicados.length > 5 ? '…' : ''}. Ajusta el número inicial o el prefijo.`
      );
      return;
    }

    setLoteCreando(true);
    setLoteProgreso(0);
    let creadas = 0;
    let fallo: string | null = null;

    try {
      for (let indice = 0; indice < codigos.length; indice += 1) {
        const codigo = codigos[indice];
        try {
          await crearColmena({
            apiario_id: apiarioId,
            codigo,
            estado: 'ACTIVA',
            fecha_instalacion: loteFormulario.fecha_instalacion || null,
            cantidad_marcos: marcos,
          }, sesion.accessToken);
          creadas += 1;
          setLoteProgreso(creadas);
        } catch (errorLote) {
          fallo = `${codigo}: ${errorLote instanceof Error ? errorLote.message : 'No se pudo crear la colmena.'}`;
          break;
        }
      }

      await descargarCatalogo(sesion).catch(() => undefined);
      await cargarDatos(true);
      setLoteVisible(false);

      if (fallo) {
        Alert.alert(
          'Lote creado parcialmente',
          `Se crearon ${creadas} de ${cantidad} colmenas. El proceso se detuvo en ${fallo}. Las colmenas creadas se conservaron.`
        );
      } else {
        Alert.alert('Colmenas creadas', `Se registraron correctamente ${creadas} colmenas en ${nombreApiario(apiarioId)}.`);
      }
    } catch (errorLote) {
      Alert.alert('No se pudo completar el lote', errorLote instanceof Error ? errorLote.message : 'Ocurrió un error al crear las colmenas.');
    } finally {
      setLoteCreando(false);
    }
  };

  const iniciarEscaneoListado = async () => {
    try {
      const permiso = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!permiso.granted) {
        Alert.alert(
          'Permiso de cámara necesario',
          'Para buscar una colmena mediante su etiqueta QR debes permitir el acceso a la cámara del teléfono.',
          permiso.canAskAgain
            ? [{ text: 'Entendido', style: 'cancel' }]
            : [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
              ]
        );
        return;
      }
      qrListadoBloqueado.current = false;
      setEscaneoListadoVisible(true);
    } catch (errorCamara) {
      Alert.alert('No se pudo abrir la cámara', errorCamara instanceof Error ? errorCamara.message : 'Revisa los permisos del teléfono.');
    }
  };

  const manejarQrListado = async (texto: string) => {
    if (qrListadoBloqueado.current) return;
    const coincidencia = String(texto ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const codigoQr = coincidencia?.[0]?.toLowerCase();
    if (!codigoQr) {
      qrListadoBloqueado.current = true;
      Alert.alert('QR no reconocido', 'La etiqueta no contiene un identificador de colmena válido.', [
        { text: 'Intentar nuevamente', onPress: () => { qrListadoBloqueado.current = false; } },
      ]);
      return;
    }

    qrListadoBloqueado.current = true;
    const local = colmenas.find((item) => item.codigo_qr.trim().toLowerCase() === codigoQr);
    if (local) {
      setEscaneoListadoVisible(false);
      setFichaId(local.id);
      return;
    }

    if (!sesion || !tokenVigente(sesion)) {
      setEscaneoListadoVisible(false);
      qrListadoBloqueado.current = false;
      Alert.alert('Colmena no disponible sin conexión', 'La etiqueta no pertenece a una colmena guardada en este dispositivo.');
      return;
    }

    try {
      const encontrada = await obtenerColmenaPorQr(codigoQr, sesion.accessToken);
      if (encontrada.activo === false || encontrada.estado === 'BAJA') {
        throw new Error('La colmena asociada a esta etiqueta fue dada de baja.');
      }
      const actualizadas = [...colmenas.filter((item) => item.id !== encontrada.id), encontrada];
      setColmenas(actualizadas);
      await guardarColmenasCache(sesion.usuario.id, actualizadas).catch(() => undefined);
      setEscaneoListadoVisible(false);
      setFichaId(encontrada.id);
    } catch (errorQr) {
      setEscaneoListadoVisible(false);
      Alert.alert('No se encontró la colmena', errorQr instanceof Error ? errorQr.message : 'No se pudo consultar esta etiqueta.');
    }
  };

  const abrirCambioQr = () => {
    qrEscaneoBloqueado.current = false;
    setQrModo('IMPRESA');
    setQrManual('');
    setQrManualError('');
    setQrEscaneandoVisible(false);
    setQrVisible(true);
  };

  // Solicita el permiso desde una acción explícita del usuario y abre
  // un lector de cámara independiente a la ficha/modal de QR.
  const iniciarEscaneoEtiqueta = async () => {
    if (guardandoQr) return;

    try {
      const permiso = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission();

      if (!permiso.granted) {
        const botones = permiso.canAskAgain
          ? [{ text: 'Entendido', style: 'cancel' as const }]
          : [
              { text: 'Cancelar', style: 'cancel' as const },
              { text: 'Abrir ajustes', onPress: () => { void Linking.openSettings(); } },
            ];

        Alert.alert(
          'Permiso de cámara necesario',
          'Para cambiar la etiqueta debes permitir que Colmenares Tres Pinos use la cámara del teléfono.',
          botones
        );
        return;
      }

      qrEscaneoBloqueado.current = false;
      setQrVisible(true);
      setQrEscaneandoVisible(true);
    } catch (error) {
      Alert.alert(
        'No se pudo abrir la cámara',
        error instanceof Error ? error.message : 'Revisa los permisos de cámara del teléfono.'
      );
    }
  };

  const guardarCambioQr = async (codigoQr: string | null) => {
    if (!ficha || !sesion || !tokenVigente(sesion)) {
      Alert.alert('Sin sesión vigente', 'Debes conectarte nuevamente para cambiar la etiqueta QR.');
      qrEscaneoBloqueado.current = false;
      return;
    }

    const qrActual = ficha.codigo_qr.trim().toLowerCase();
    const inspeccionesPendientes = inspeccionesLocales.filter(
      (item) =>
        item.codigo_qr.trim().toLowerCase() === qrActual &&
        item.estado !== 'SINCRONIZADO'
    ).length;
    const tratamientosPendientes = tratamientosLocales.filter(
      (item) =>
        item.codigo_qr.trim().toLowerCase() === qrActual &&
        item.sincronizacion !== 'SINCRONIZADO'
    ).length;

    if (inspeccionesPendientes > 0 || tratamientosPendientes > 0) {
      Alert.alert(
        'Sincroniza antes de cambiar la etiqueta',
        `Esta colmena tiene ${inspeccionesPendientes} inspección(es) y ${tratamientosPendientes} tratamiento(s) pendientes vinculados al QR actual. Sincronízalos primero para no perder su asociación con la colmena.`
      );
      qrEscaneoBloqueado.current = false;
      return;
    }

    setGuardandoQr(true);
    try {
      await asociarQrColmena(ficha.id, codigoQr, sesion.accessToken);
      await descargarCatalogo(sesion).catch(() => undefined);
      setQrVisible(false);
      setQrEscaneandoVisible(false);
      await cargarDatos(true);
      Alert.alert(
        'Etiqueta actualizada',
        codigoQr
          ? 'La etiqueta impresa quedó asociada a esta colmena. El código anterior deja de funcionar.'
          : 'Se generó un código QR nuevo. Descarga e imprime la nueva etiqueta.'
      );
    } catch (e) {
      setQrEscaneandoVisible(false);
      setQrVisible(true);
      Alert.alert(
        'No se pudo cambiar el QR',
        e instanceof Error ? e.message : 'Ocurrió un error al cambiar la etiqueta.'
      );
    } finally {
      setGuardandoQr(false);
      qrEscaneoBloqueado.current = false;
    }
  };

  const manejarQrEscaneado = (texto: string) => {
    if (qrEscaneoBloqueado.current || guardandoQr) return;

    const coincidencia = String(texto ?? '').match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    const codigoQr = coincidencia?.[0]?.toLowerCase();

    if (!codigoQr) {
      qrEscaneoBloqueado.current = true;
      Alert.alert(
        'Código QR no válido',
        'La etiqueta no contiene un identificador de colmena reconocido.',
        [{ text: 'Intentar nuevamente', onPress: () => { qrEscaneoBloqueado.current = false; } }]
      );
      return;
    }

    qrEscaneoBloqueado.current = true;
    void guardarCambioQr(codigoQr);
  };

  const buscarEtiquetaManual = () => {
    if (qrEscaneoBloqueado.current || guardandoQr) return;
    const coincidencia = qrManual.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    const codigoQr = coincidencia?.[0]?.toLowerCase();

    if (!codigoQr) {
      setQrManualError('No parece un código QR del sistema. Pega la dirección completa o el UUID de la etiqueta.');
      return;
    }

    setQrManualError('');
    qrEscaneoBloqueado.current = true;
    void guardarCambioQr(codigoQr);
  };

  const descargarImagenQr = async () => {
    if (!ficha || !sesion || !tokenVigente(sesion) || !conectado) {
      Alert.alert('Sin conexión', 'Conéctate al servidor para descargar la imagen QR oficial.');
      return;
    }

    setDescargandoQr(true);
    try {
      const urlQr = `${API_BASE_URL}/colmenas/${ficha.id}/qr`;
      if (Platform.OS === 'web') {
        await Linking.openURL(urlQr);
        return;
      }

      const directorio = FileSystem.documentDirectory;
      if (!directorio) {
        throw new Error('El dispositivo no habilitó el almacenamiento de documentos.');
      }

      const codigoSeguro = ficha.codigo.replace(/[^A-Za-z0-9_-]/g, '_');
      const nombreArchivo = `QR_${codigoSeguro}`;
      const destino = `${directorio}${nombreArchivo}.png`;

      await FileSystem.deleteAsync(destino, { idempotent: true }).catch(() => undefined);

      const descarga = await FileSystem.downloadAsync(
        urlQr,
        destino,
        {
          headers: {
            Accept: 'image/png',
            Authorization: `Bearer ${sesion.accessToken}`,
          },
        }
      );

      if (descarga.status < 200 || descarga.status >= 300) {
        throw new Error(`El servidor no pudo generar el QR (HTTP ${descarga.status}).`);
      }

      const informacion = await FileSystem.getInfoAsync(descarga.uri);
      if (!informacion.exists || !informacion.size) {
        throw new Error('El archivo QR llegó vacío o no se pudo guardar.');
      }

      if (Platform.OS === 'android') {
        try {
          const carpetaDescargas = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Download');
          const permiso = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(carpetaDescargas);

          if (permiso.granted) {
            const archivoDestino = await FileSystem.StorageAccessFramework.createFileAsync(
              permiso.directoryUri,
              nombreArchivo,
              'image/png'
            );
            const contenidoBase64 = await FileSystem.readAsStringAsync(
              descarga.uri,
              { encoding: FileSystem.EncodingType.Base64 }
            );
            await FileSystem.writeAsStringAsync(
              archivoDestino,
              contenidoBase64,
              { encoding: FileSystem.EncodingType.Base64 }
            );

            Alert.alert('QR descargado', `La imagen ${nombreArchivo}.png quedó guardada en la carpeta seleccionada.`);
            return;
          }
        } catch (errorAlGuardar) {
          console.warn('No se pudo guardar directamente en Descargas:', errorAlGuardar);
        }
      }

      const compartirDisponible = await Sharing.isAvailableAsync();
      if (!compartirDisponible) {
        throw new Error('El QR quedó descargado dentro de la aplicación, pero el dispositivo no ofrece una opción para exportarlo.');
      }

      await Sharing.shareAsync(descarga.uri, {
        mimeType: 'image/png',
        dialogTitle: `Guardar QR ${ficha.codigo}`,
      });
    } catch (e) {
      Alert.alert(
        'No se pudo descargar el QR',
        e instanceof Error ? e.message : 'Ocurrió un error al descargar la imagen.'
      );
    } finally {
      setDescargandoQr(false);
    }
  };

  const abrirDetalleInspeccion = async (evento: EventoHistorial) => {
    setInspeccionDetalle(evento);
    setDetalleMarcosLocales([]);
    if (!evento.inspeccionLocal) return;

    setCargandoDetalleLocal(true);
    try {
      const marcos = await listarMarcosInspeccionLocal(evento.inspeccionLocal.id);
      setDetalleMarcosLocales(marcos);
    } catch (errorDetalle) {
      console.warn('No se pudo cargar el detalle local de marcos:', errorDetalle);
    } finally {
      setCargandoDetalleLocal(false);
    }
  };

  const cerrarDetalleInspeccion = () => {
    setInspeccionDetalle(null);
    setDetalleMarcosLocales([]);
    setCargandoDetalleLocal(false);
  };

  const inspeccionar = (colmena: ColmenaApi) => {
    // Desde la ficha abrimos el mismo flujo de registro que la web, sin
    // abandonar el contexto de la colmena ni navegar a la pantalla QR.
    if (ficha && ficha.id === colmena.id) {
      setInspeccionFichaVisible(true);
      return;
    }

    setFichaId(null);
    if (onInspeccionar) onInspeccionar(colmena.id);
    else onEscanear();
  };

  const irATratamientos = () => {
    setFichaId(null);
    if (onAbrirTratamientos && ficha) onAbrirTratamientos(ficha.id);
    else Alert.alert('Tratamientos', 'Abre el módulo Tratamientos desde el menú lateral.');
  };

  const filtrosEvento: Array<{ valor: FiltroEvento; texto: string }> = [
    { valor: 'TODOS', texto: 'Todos' },
    { valor: 'INSPECCION', texto: 'Inspecciones' },
    { valor: 'TRATAMIENTO', texto: 'Tratamientos' },
    { valor: 'TRANSFERENCIA', texto: 'Transferencias' },
  ];

  return (
    <View style={styles.pantalla}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        style={{ flex: 1 }}
        data={colmenasFiltradas}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={() => void cargarDatos(true)}
            tintColor={COLORS.goldText}
          />
        }
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View>
            <View style={styles.barraSuperiorListado}>
              <Text style={styles.descripcionListado}>
                {busqueda.trim() || apiarioFiltro || filtroEstado !== 'TODAS' || soloAtencion
                  ? `${colmenasFiltradas.length} de ${colmenas.length} colmenas registradas.`
                  : `${colmenas.length} colmenas registradas.`}
              </Text>
              <View style={styles.accionesEncabezado}>
                <Pressable
                  style={styles.botonAccionSecundario}
                  onPress={() => void iniciarEscaneoListado()}
                >
                  <Text style={styles.botonAccionTexto}>▦ Escanear QR</Text>
                </Pressable>
                {esAdmin && (
                  <>
                    <Pressable
                      style={styles.botonAccionSecundario}
                      onPress={abrirCrearLote}
                    >
                      <Text style={styles.botonAccionTexto}>▤ Crear en lote</Text>
                    </Pressable>
                    <Pressable
                      style={styles.botonAccionPrincipal}
                      onPress={abrirNueva}
                    >
                      <Text style={styles.botonAccionPrincipalTexto}>＋ Nueva colmena</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>

            {!!aviso && (
              <View style={styles.aviso}>
                <Text style={styles.avisoTexto}>{aviso}</Text>
              </View>
            )}
            {!!error && (
              <View style={styles.errorCaja}>
                <Text style={styles.errorTexto}>{error}</Text>
              </View>
            )}

            {(apiarioFiltro || idsFiltroDashboard) && (
              <View style={styles.filtroDashboard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.filtroDashboardTitulo}>
                    Filtro aplicado desde Dashboard
                  </Text>
                  <Text style={styles.filtroDashboardTexto}>
                    {idsFiltroDashboard
                      ? `${idsFiltroDashboard.length} colmenas seleccionadas`
                      : 'Colmenas del apiario seleccionado'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setApiarioFiltro('');
                    setIdsFiltroDashboard(null);
                  }}
                  style={styles.quitarFiltro}
                >
                  <Text style={styles.quitarFiltroTexto}>Quitar</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.filtrosListado}>
              <Text style={styles.labelFiltro}>Buscar por código</Text>
              <TextInput
                style={styles.inputFiltro}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Buscar por código"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.filaSelectoresFiltro}>
                <View style={styles.controlFiltro}>
                  <Text style={styles.labelFiltro}>Apiario</Text>
                  <Pressable
                    style={styles.selectorFiltro}
                    onPress={() => setApiarioFiltroPickerVisible(true)}
                  >
                    <Text
                      style={styles.selectorFiltroTexto}
                      numberOfLines={1}
                    >
                      {apiarioFiltro
                        ? nombreApiario(Number(apiarioFiltro))
                        : 'Todos los apiarios'}
                    </Text>
                    <Text style={styles.selectorFiltroFlecha}>⌄</Text>
                  </Pressable>
                </View>

                <View style={styles.controlFiltro}>
                  <Text style={styles.labelFiltro}>Estado</Text>
                  <Pressable
                    style={styles.selectorFiltro}
                    onPress={() => setEstadoFiltroPickerVisible(true)}
                  >
                    <Text
                      style={styles.selectorFiltroTexto}
                      numberOfLines={1}
                    >
                      {filtroEstado === 'TODAS'
                        ? 'Todos los estados'
                        : ESTADOS.find((item) => item.valor === filtroEstado)?.texto ??
                          'Todos los estados'}
                    </Text>
                    <Text style={styles.selectorFiltroFlecha}>⌄</Text>
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={styles.checkboxFiltro}
                onPress={() => setSoloAtencion((actual) => !actual)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: soloAtencion }}
              >
                <View
                  style={[
                    styles.checkboxCuadro,
                    soloAtencion && styles.checkboxCuadroActivo,
                  ]}
                >
                  {soloAtencion && (
                    <Text style={styles.checkboxMarca}>✓</Text>
                  )}
                </View>
                <Text style={styles.checkboxTexto}>
                  Solo las que requieren atención
                </Text>
              </Pressable>
            </View>

            <View style={styles.barraAcciones}>
              <Text style={styles.resultados}>
                {colmenasFiltradas.length} resultado(s)
              </Text>
              <Pressable
                onPress={() => void cargarDatos(true)}
                disabled={actualizando}
                style={styles.botonTexto}
              >
                <Text style={styles.botonTextoLabel}>
                  {actualizando ? 'Actualizando…' : '⟳ Actualizar'}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          cargando ? (
            <ActivityIndicator
              size="large"
              color={COLORS.gold}
              style={{ marginTop: 28 }}
            />
          ) : (
            <View style={styles.tarjetaVacia}>
              <Text style={styles.tarjetaTitulo}>
                No hay colmenas con estos filtros
              </Text>
              <Text style={styles.textoSecundario}>
                Ajusta o limpia los filtros para ver el inventario disponible.
              </Text>
            </View>
          )
        }
        renderItem={({ item: colmena }) => {
          const ultima =
            ultimasInspeccionesPorColmena.get(colmena.id);

          return (
            <View style={styles.tarjetaColmena}>
              <View style={styles.tarjetaColmenaTop}>
                <View style={{ flex: 1 }}>
                  <View style={styles.codigoConAlerta}>
                    <Pressable
                      onPress={() => {
                        setInspeccionFichaVisible(false);
                        setFichaId(colmena.id);
                      }}
                    >
                      <Text style={styles.codigoColmena}>
                        {colmena.codigo}
                      </Text>
                    </Pressable>
                    {colmenasConAtencion.has(colmena.id) && (
                      <View style={styles.puntoAtencion} />
                    )}
                  </View>
                  <Text style={styles.apiarioTexto}>
                    {nombreApiario(colmena.apiario_id)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.insigniaEstado,
                    colmena.estado === 'ACTIVA'
                      ? styles.estadoActiva
                      : colmena.estado === 'EN_OBSERVACION'
                        ? styles.estadoObservacion
                        : styles.estadoInactiva,
                  ]}
                >
                  <Text style={styles.insigniaEstadoTexto}>
                    {estadoColmenaTexto(colmena.estado)}
                  </Text>
                </View>
              </View>

              <View style={styles.datosFila}>
                <View style={styles.datoTarjeta}>
                  <Text style={styles.datoTarjetaEtiqueta}>
                    Última inspección
                  </Text>
                  <Text style={styles.datoTarjetaValor}>
                    {ultima
                      ? formatearFecha(ultima.fecha_inspeccion)
                      : 'Sin inspecciones'}
                  </Text>
                  {ultima?.estado_general && (
                    <Text style={styles.datoTarjetaEstado}>
                      {estadoGeneralTexto(ultima.estado_general)}
                    </Text>
                  )}
                </View>
                <View style={styles.datoTarjeta}>
                  <Text style={styles.datoTarjetaEtiqueta}>
                    Instalación
                  </Text>
                  <Text style={styles.datoTarjetaValor}>
                    {formatearFecha(colmena.fecha_instalacion)}
                  </Text>
                </View>
              </View>

              <View style={styles.tarjetaColmenaBottom}>
                <Pressable
                  onPress={() => {
                    setInspeccionFichaVisible(false);
                    setFichaId(colmena.id);
                  }}
                  style={styles.accionVerFicha}
                >
                  <Text style={styles.verFicha}>◉  Ver ficha</Text>
                </Pressable>
                {esAdmin && (
                  <View style={styles.accionesTarjeta}>
                    <Pressable
                      onPress={() => abrirEdicion(colmena)}
                      style={styles.accionTarjeta}
                    >
                      <Text style={styles.accionTarjetaTexto}>✎ Editar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmarBaja(colmena)}
                      style={styles.accionTarjeta}
                    >
                      <Text style={styles.accionTarjetaPeligro}>
                        ▣ Dar de baja
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* FICHA COMPLETA */}
      <Modal
        visible={Boolean(ficha)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (guardandoQr) return;
          if (qrEscaneandoVisible) {
            qrEscaneoBloqueado.current = false;
            setQrEscaneandoVisible(false);
            setQrVisible(true);
          } else if (qrVisible) {
            setQrVisible(false);
          } else if (inspeccionFichaVisible) {
            setInspeccionFichaVisible(false);
          } else {
            setFichaId(null);
          }
        }}
      >
        {qrEscaneandoVisible ? (
        <View style={styles.camaraPantalla}>
          {cameraPermission?.granted ? (
            <CameraView
              key="lector-qr-colmenas"
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={guardandoQr ? undefined : ({ data }) => manejarQrEscaneado(data)}
            />
          ) : (
            <View style={styles.camaraSinPermiso}>
              <Text style={styles.camaraTitulo}>Permiso de cámara requerido</Text>
              <Text style={styles.camaraAyuda}>Activa el permiso de cámara en los ajustes del teléfono y vuelve a intentarlo.</Text>
              <Pressable style={styles.botonPrincipal} onPress={() => void Linking.openSettings()}>
                <Text style={styles.botonPrincipalTexto}>Abrir ajustes</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.camaraCabecera} pointerEvents="none">
            <Text style={styles.camaraTitulo}>Escanear etiqueta nueva</Text>
            <Text style={styles.camaraAyuda}>Centra el código QR impreso dentro del recuadro.</Text>
          </View>

          <View pointerEvents="none" style={styles.marcoEscaneo} />

          {guardandoQr && (
            <View style={styles.camaraProcesando}>
              <ActivityIndicator size="large" color={COLORS.surface} />
              <Text style={styles.camaraAyuda}>Asociando etiqueta...</Text>
            </View>
          )}

          <Pressable
            style={styles.cerrarCamara}
            onPress={() => {
              if (!guardandoQr) {
                qrEscaneoBloqueado.current = false;
                setQrEscaneandoVisible(false);
                setQrVisible(true);
              }
            }}
            disabled={guardandoQr}
          >
            <Text style={styles.cerrarCamaraTexto}>Cancelar escaneo</Text>
          </Pressable>
        </View>
        ) : (
        <View style={styles.fondoModal}>
          <View style={qrVisible ? styles.modalQrFicha : styles.modalFicha}>
            <View style={styles.modalEncabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>
                  {qrVisible ? `Etiqueta QR de ${ficha?.codigo ?? 'la colmena'}` : inspeccionFichaVisible ? 'Registrar inspección' : ficha ? `Colmena ${ficha.codigo}` : 'Ficha de colmena'}
                </Text>
                {ficha && (
                  <Text style={styles.modalSubtitulo}>
                    {qrVisible
                      ? 'Cambiar la etiqueta de esta colmena'
                      : inspeccionFichaVisible
                      ? `${nombreApiario(ficha.apiario_id)} · ${ficha.codigo}`
                      : nombreApiario(ficha.apiario_id)}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => {
                  if (guardandoQr) return;
                  if (qrVisible) setQrVisible(false);
                  else if (inspeccionFichaVisible) setInspeccionFichaVisible(false);
                  else setFichaId(null);
                }}
                disabled={guardandoQr}
                style={styles.cerrarModal}
                accessibilityLabel={qrVisible ? 'Volver a la ficha' : inspeccionFichaVisible ? 'Cerrar registro de inspección' : 'Cerrar ficha de colmena'}
              >
                <Text style={styles.cerrarModalTexto}>✕</Text>
              </Pressable>
            </View>

            {ficha && qrVisible ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 17, paddingBottom: 24 }}>
              <Text style={styles.qrEtiquetaCampo}>¿Qué quieres hacer?</Text>
              <View style={styles.qrModosFila}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: qrModo === 'IMPRESA' }}
                  disabled={guardandoQr}
                  onPress={() => {
                    setQrModo('IMPRESA');
                    setQrManualError('');
                  }}
                  style={[styles.qrModoBoton, qrModo === 'IMPRESA' && styles.qrModoBotonActivo]}
                >
                  <Text style={[styles.qrModoTexto, qrModo === 'IMPRESA' && styles.qrModoTextoActivo]}>
                    Etiqueta ya impresa
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: qrModo === 'NUEVA' }}
                  disabled={guardandoQr}
                  onPress={() => {
                    setQrModo('NUEVA');
                    setQrManualError('');
                  }}
                  style={[styles.qrModoBoton, qrModo === 'NUEVA' && styles.qrModoBotonActivo]}
                >
                  <Text style={[styles.qrModoTexto, qrModo === 'NUEVA' && styles.qrModoTextoActivo]}>
                    Código nuevo
                  </Text>
                </Pressable>
              </View>

              {qrModo === 'IMPRESA' ? (
                <View style={styles.qrModoContenido}>
                  <Text style={styles.qrExplicacion}>
                    Lee la etiqueta que ya está pegada en la caja. La etiqueta anterior de {ficha?.codigo ?? 'esta colmena'} deja de funcionar.
                  </Text>

                  <Pressable
                    style={[styles.botonPrincipal, guardandoQr && styles.botonDeshabilitado]}
                    disabled={guardandoQr}
                    onPress={() => void iniciarEscaneoEtiqueta()}
                  >
                    <Text style={styles.botonPrincipalTexto}>Usar la cámara</Text>
                  </Pressable>

                  <Text style={[styles.qrEtiquetaCampo, { marginTop: 18 }]}>Código de la etiqueta</Text>
                  <TextInput
                    value={qrManual}
                    onChangeText={(valor) => {
                      setQrManual(valor);
                      if (qrManualError) setQrManualError('');
                    }}
                    style={styles.input}
                    placeholder="Pega la dirección o el código del QR"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!guardandoQr}
                    accessibilityLabel="Código de la etiqueta"
                  />
                  {!!qrManualError && <Text style={styles.errorTexto}>{qrManualError}</Text>}

                  <Pressable
                    style={[styles.botonSecundario, guardandoQr && styles.botonDeshabilitado]}
                    onPress={buscarEtiquetaManual}
                    disabled={guardandoQr}
                  >
                    {guardandoQr ? (
                      <ActivityIndicator color={COLORS.goldText} />
                    ) : (
                      <Text style={styles.botonSecundarioTexto}>Buscar</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.qrModoContenido}>
                  <Text style={styles.qrExplicacion}>
                    Úsalo si la etiqueta se perdió o se dañó. La etiqueta anterior deja de funcionar y hay que imprimir una nueva.
                  </Text>
                  <Pressable
                    style={[styles.botonPrincipal, guardandoQr && styles.botonDeshabilitado]}
                    disabled={guardandoQr}
                    onPress={() => {
                      Alert.alert(
                        'Generar un código QR nuevo',
                        `La etiqueta anterior de ${ficha?.codigo ?? 'esta colmena'} dejará de funcionar. ¿Deseas continuar?`,
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Generar código',
                            onPress: () => {
                              qrEscaneoBloqueado.current = true;
                              void guardarCambioQr(null);
                            },
                          },
                        ]
                      );
                    }}
                  >
                    {guardandoQr ? (
                      <ActivityIndicator color={COLORS.surface} />
                    ) : (
                      <Text style={styles.botonPrincipalTexto}>Generar código nuevo</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </ScrollView>
            ) : ficha && inspeccionFichaVisible ? (
              <FormularioInspeccion
                codigoQR={ficha.codigo_qr}
                modoModal
                apiarioNombre={nombreApiario(ficha.apiario_id)}
                codigoColmena={ficha.codigo}
                onVolver={() => setInspeccionFichaVisible(false)}
                onGuardado={() => {
                  setInspeccionFichaVisible(false);
                  void cargarDatos(true).then(() => cargarHistorial(ficha));
                }}
              />
            ) : ficha && (
              <ScrollView
                style={styles.scrollFicha}
                contentContainerStyle={styles.contenidoFicha}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.fichaDatos}>
                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Estado</Text>
                    <View style={[styles.insigniaEstado, ficha.estado === 'ACTIVA' ? styles.estadoActiva : ficha.estado === 'EN_OBSERVACION' ? styles.estadoObservacion : styles.estadoInactiva, { alignSelf: 'flex-start', marginLeft: 0 }]}>
                      <Text style={styles.insigniaEstadoTexto}>{estadoColmenaTexto(ficha.estado)}</Text>
                    </View>
                  </View>

                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Instalación</Text>
                    <Text style={styles.datoValor}>{formatearFecha(ficha.fecha_instalacion)}</Text>
                  </View>

                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Última inspección</Text>
                    {ultimaInspeccion ? (
                      <View style={styles.ultimaInspeccionFicha}>
                        <Text style={styles.datoValor}>{formatearFecha(ultimaInspeccion.fecha)}</Text>
                        {!!ultimaInspeccion.estado && <Text style={styles.estadoInspeccionFicha}>{estadoGeneralTexto(ultimaInspeccion.estado)}</Text>}
                      </View>
                    ) : (
                      <Text style={styles.datoValor}>Sin inspecciones</Text>
                    )}
                  </View>

                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Observaciones</Text>
                    <Text style={styles.datoValor}>{ficha.observaciones?.trim() || 'Sin observaciones'}</Text>
                  </View>
                </View>

                <View style={styles.qrCaja}>
                  {qrImagenUri ? (
                    <Image
                      key={`${ficha.id}-${ficha.codigo_qr}`}
                      source={{ uri: qrImagenUri }}
                      style={styles.imagenQr}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.qrSinConexion}>
                      {qrImagenCargando ? (
                        <>
                          <ActivityIndicator size="small" color={COLORS.forest} />
                          <Text style={styles.textoSecundario}>
                            Cargando código QR…
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.qrIcono}>▦</Text>
                          <Text style={styles.textoSecundario}>
                            {qrImagenError || (
                              conectado
                                ? 'No se pudo mostrar el código QR. Puedes descargar la imagen.'
                                : 'Imagen QR disponible al conectarse al servidor'
                            )}
                          </Text>
                        </>
                      )}
                    </View>
                  )}

                  <Pressable
                    style={[
                      styles.botonQr,
                      (!conectado || descargandoQr) && styles.botonDeshabilitado,
                    ]}
                    onPress={() => void descargarImagenQr()}
                    disabled={!conectado || descargandoQr}
                  >
                    {descargandoQr ? (
                      <ActivityIndicator
                        size="small"
                        color={COLORS.goldText}
                      />
                    ) : (
                      <Text style={styles.botonQrTexto}>
                        Descargar imagen
                      </Text>
                    )}
                  </Pressable>

                  {esAdmin && (
                    <Pressable
                      style={styles.botonQr}
                      onPress={abrirCambioQr}
                    >
                      <Text style={styles.botonQrTexto}>
                        Cambiar etiqueta
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.historialEncabezado}>
                  <Text style={styles.tituloHistorial}>Historial</Text>
                  {historialCargando && (
                    <ActivityIndicator
                      size="small"
                      color={COLORS.goldText}
                    />
                  )}
                </View>

                {!!historialError && (
                  <View style={styles.aviso}>
                    <Text style={styles.avisoTexto}>
                      {historialError}
                    </Text>
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filaChips}
                >
                  {filtrosEvento.map((item) => {
                    const etiqueta = `${item.texto} (${conteosEventos[item.valor] ?? 0})`;

                    return (
                      <Chip
                        key={item.valor}
                        texto={etiqueta}
                        activo={filtroEvento === item.valor}
                        onPress={() => setFiltroEvento(item.valor)}
                      />
                    );
                  })}
                </ScrollView>

                <View style={styles.fechasHistorial}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.datoEtiqueta}>Desde</Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Seleccionar fecha desde ${desde ? fechaHistorialTexto(desde) : ''}`}
                      onPress={() => setFechaPickerVisible('desde')}
                      style={styles.inputFecha}
                    >
                      <Text
                        style={[
                          styles.fechaHistorialTexto,
                          !desde && styles.fechaHistorialPlaceholder,
                        ]}
                      >
                        {fechaHistorialTexto(desde)}
                      </Text>

                      <Text style={styles.iconoCalendario}>▦</Text>
                    </Pressable>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.datoEtiqueta}>Hasta</Text>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Seleccionar fecha hasta ${hasta ? fechaHistorialTexto(hasta) : ''}`}
                      onPress={() => setFechaPickerVisible('hasta')}
                      style={styles.inputFecha}
                    >
                      <Text
                        style={[
                          styles.fechaHistorialTexto,
                          !hasta && styles.fechaHistorialPlaceholder,
                        ]}
                      >
                        {fechaHistorialTexto(hasta)}
                      </Text>

                      <Text style={styles.iconoCalendario}>▦</Text>
                    </Pressable>
                  </View>
                </View>

                {fechaPickerVisible && (
                  <>
                    <View style={styles.calendarioInlineHeader}>
                      <Text style={styles.calendarioInlineTitulo}>
                        Selecciona fecha {fechaPickerVisible === 'desde' ? 'desde' : 'hasta'}
                      </Text>

                      <Pressable
                        onPress={() => setFechaPickerVisible(null)}
                      >
                        <Text style={styles.calendarioInlineCancelar}>
                          Cancelar
                        </Text>
                      </Pressable>
                    </View>

                    <DateTimePicker
                      value={fechaDatePicker(
                        fechaPickerVisible === 'desde' ? desde : hasta
                      )}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      minimumDate={
                        fechaPickerVisible === 'hasta' && desde
                          ? fechaDatePicker(desde)
                          : undefined
                      }
                      maximumDate={
                        fechaPickerVisible === 'desde' && hasta
                          ? fechaDatePicker(hasta)
                          : undefined
                      }
                      onChange={(evento, fechaSeleccionada) => {
                        const campo = fechaPickerVisible;
                        setFechaPickerVisible(null);

                        if (
                          evento.type === 'dismissed' ||
                          !fechaSeleccionada
                        ) return;

                        const valor = fechaISODatePicker(fechaSeleccionada);

                        if (campo === 'desde') setDesde(valor);
                        else setHasta(valor);
                      }}
                    />
                  </>
                )}

                {(desde || hasta || filtroEvento !== 'TODOS') && (
                  <Pressable
                    onPress={() => {
                      setDesde('');
                      setHasta('');
                      setFiltroEvento('TODOS');
                    }}
                    style={styles.limpiarFiltros}
                  >
                    <Text style={styles.limpiarFiltrosTexto}>
                      Limpiar filtros
                    </Text>
                  </Pressable>
                )}

                {eventosVisibles.length === 0 ? (
                  <View style={styles.tarjetaVacia}>
                    <Text style={styles.textoSecundario}>
                      {eventosHistorial.length === 0
                        ? 'Esta colmena todavía no tiene actividad registrada.'
                        : 'No hay eventos que coincidan con estos filtros.'}
                    </Text>
                  </View>
                ) : (
                  eventosVisibles.map((evento) => (
                    <View key={evento.key} style={styles.evento}>
                      <View style={styles.eventoPunto} />

                      <View style={{ flex: 1 }}>
                        <View style={styles.eventoTituloFila}>
                          <Text style={styles.eventoTitulo}>
                            {evento.titulo}
                          </Text>

                          {!!evento.estado && (
                            <Text style={styles.eventoEstado}>
                              {evento.estado}
                            </Text>
                          )}
                        </View>

                        <Text style={styles.eventoFecha}>
                          {formatearFechaHora(evento.fecha)}
                        </Text>

                        {evento.lineas.map((linea, indice) => (
                          <Text
                            key={`${evento.key}-${indice}`}
                            style={styles.eventoLinea}
                          >
                            {linea}
                          </Text>
                        ))}

                        {evento.tipo === 'INSPECCION' &&
                          (evento.inspeccionServidor || evento.inspeccionLocal) && (
                            <Pressable
                              style={styles.verDetalleEvento}
                              onPress={() => void abrirDetalleInspeccion(evento)}
                            >
                              <Text style={styles.verDetalleEventoTexto}>
                                Ver detalle
                              </Text>
                            </Pressable>
                          )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            {ficha && !inspeccionFichaVisible && !qrVisible && (
              <View style={styles.pieFicha}>
                <Pressable
                  style={[styles.botonSecundario, styles.botonPie]}
                  onPress={irATratamientos}
                >
                  <Text style={styles.botonSecundarioTexto}>
                    Registrar tratamiento
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.botonPrincipal, styles.botonPie]}
                  onPress={() => inspeccionar(ficha)}
                >
                  <Text style={styles.botonPrincipalTexto}>
                    Registrar inspección
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
        )}
      </Modal>

      {/* DETALLE DE INSPECCIÓN DESDE EL HISTORIAL */}
      <Modal
        visible={Boolean(inspeccionDetalle)}
        transparent
        animationType="fade"
        onRequestClose={cerrarDetalleInspeccion}
      >
        <View style={styles.fondoModal}>
          <View style={styles.modalDetalleInspeccion}>
            <View style={styles.modalEncabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>Detalle de inspección</Text>
                <Text style={styles.modalSubtitulo}>
                  {inspeccionDetalle ? formatearFechaHora(inspeccionDetalle.fecha) : ''}
                </Text>
              </View>
              <Pressable onPress={cerrarDetalleInspeccion} style={styles.cerrarModal}>
                <Text style={styles.cerrarModalTexto}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.detalleInspeccionContenido}>
              {inspeccionDetalle?.inspeccionServidor ? (
                <>
                  {[
                    ['Estado general', estadoGeneralTexto(inspeccionDetalle.inspeccionServidor.estado_general)],
                    ['Responsable', inspeccionDetalle.inspeccionServidor.usuario_id
                      ? (sesion && inspeccionDetalle.inspeccionServidor.usuario_id === sesion.usuario.id
                        ? sesion.usuario.nombre
                        : `Usuario #${inspeccionDetalle.inspeccionServidor.usuario_id}`)
                      : 'Sin registrar'],
                    ['Reina observada', inspeccionDetalle.inspeccionServidor.reina_observada == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionServidor.reina_observada ? 'Sí' : 'No'],
                    ['Presencia de cría', inspeccionDetalle.inspeccionServidor.presencia_cria == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionServidor.presencia_cria ? 'Sí' : 'No'],
                    ['Postura', inspeccionDetalle.inspeccionServidor.postura == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionServidor.postura ? 'Sí' : 'No'],
                    ['Nivel de población', humanizar(inspeccionDetalle.inspeccionServidor.nivel_poblacion)],
                    ['Reservas de alimento', humanizar(inspeccionDetalle.inspeccionServidor.reservas_alimento)],
                    ['Marcos registrados', inspeccionDetalle.inspeccionServidor.cantidad_marcos == null ? 'Sin registrar' : String(inspeccionDetalle.inspeccionServidor.cantidad_marcos)],
                    ['Tiene alza', inspeccionDetalle.inspeccionServidor.tiene_alza == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionServidor.tiene_alza ? 'Sí' : 'No'],
                    ['Nivel de miel', humanizar(inspeccionDetalle.inspeccionServidor.miel)],
                    ['Alimentación suministrada', inspeccionDetalle.inspeccionServidor.alimentacion_suministrada || 'Sin registro'],
                    ['Signos de enfermedad', inspeccionDetalle.inspeccionServidor.signos_enfermedad ? 'Sí' : 'No'],
                    ['Enfermedad observada', inspeccionDetalle.inspeccionServidor.enfermedad_observada || 'Sin registro'],
                    ['Tiras de medicamento', inspeccionDetalle.inspeccionServidor.tiras_medicamento == null ? 'Sin registro' : String(inspeccionDetalle.inspeccionServidor.tiras_medicamento)],
                    ['Observaciones', inspeccionDetalle.inspeccionServidor.observaciones || 'Sin observaciones'],
                  ].map(([etiqueta, valor]) => (
                    <View key={etiqueta} style={styles.detalleCampo}>
                      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
                      <Text style={styles.datoValor}>{valor}</Text>
                    </View>
                  ))}
                  {historial.tratamientos
                    .filter((tratamiento) => tratamiento.inspeccion_id === inspeccionDetalle.inspeccionServidor!.id)
                    .map((tratamiento) => (
                      <View key={`tratamiento-${tratamiento.id}`} style={styles.detalleCampo}>
                        <Text style={styles.datoEtiqueta}>Tratamiento asociado</Text>
                        <Text style={styles.datoValor}>
                          {tratamiento.producto || humanizar(tratamiento.tipo_tratamiento)}
                          {tratamiento.dosis ? ` · ${tratamiento.dosis}` : ''}
                        </Text>
                        <Text style={styles.eventoLinea}>
                          {humanizar(tratamiento.estado)} · Desde {formatearFecha(tratamiento.fecha_inicio)}
                          {tratamiento.fecha_fin ? ` hasta ${formatearFecha(tratamiento.fecha_fin)}` : ''}
                        </Text>
                      </View>
                    ))}
                  {historial.transferencias
                    .filter((transferencia) => transferencia.inspeccion_id === inspeccionDetalle.inspeccionServidor!.id)
                    .map((transferencia) => (
                      <View key={`transferencia-${transferencia.id}`} style={styles.detalleCampo}>
                        <Text style={styles.datoEtiqueta}>Transferencia de marcos</Text>
                        <Text style={styles.datoValor}>
                          {colmenas.find((item) => item.id === transferencia.colmena_origen_id)?.codigo ?? `Colmena #${transferencia.colmena_origen_id}`}
                          {' → '}
                          {colmenas.find((item) => item.id === transferencia.colmena_destino_id)?.codigo ?? `Colmena #${transferencia.colmena_destino_id}`}
                        </Text>
                        <Text style={styles.eventoLinea}>
                          {transferencia.cantidad_marcos} {transferencia.cantidad_marcos === 1 ? 'marco' : 'marcos'}
                          {transferencia.tipo_marco ? ` · ${humanizar(transferencia.tipo_marco)}` : ''}
                          {transferencia.observaciones ? ` · ${transferencia.observaciones}` : ''}
                        </Text>
                      </View>
                    ))}
                  {!!inspeccionDetalle.inspeccionServidor.marcos?.length && (
                    <View style={styles.detalleCampo}>
                      <Text style={styles.datoEtiqueta}>Detalle de marcos</Text>
                      {inspeccionDetalle.inspeccionServidor.marcos.map((marco, indice) => (
                        <Text key={`${marco.ubicacion}-${marco.numero}-${indice}`} style={styles.eventoLinea}>
                          {humanizar(marco.ubicacion)} · Posición {marco.numero}: {humanizar(marco.contenido)}
                          {marco.transferido_a_colmena_id ? ` · Transferido a colmena #${marco.transferido_a_colmena_id}` : ''}
                          {marco.retirar_a_bodega ? ' · Retirado a bodega' : ''}
                        </Text>
                      ))}
                    </View>
                  )}
                </>
              ) : inspeccionDetalle?.inspeccionLocal ? (
                <>
                  {[
                    ['Estado general', estadoGeneralTexto(inspeccionDetalle.inspeccionLocal.estado_general)],
                    ['Reina observada', inspeccionDetalle.inspeccionLocal.reina_observada == null ? inspeccionDetalle.inspeccionLocal.reina : inspeccionDetalle.inspeccionLocal.reina_observada ? 'Sí' : 'No'],
                    ['Presencia de cría', inspeccionDetalle.inspeccionLocal.presencia_cria == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionLocal.presencia_cria ? 'Sí' : 'No'],
                    ['Postura', inspeccionDetalle.inspeccionLocal.postura == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionLocal.postura ? 'Sí' : 'No'],
                    ['Nivel de población', humanizar(inspeccionDetalle.inspeccionLocal.nivel_poblacion)],
                    ['Reservas de alimento', humanizar(inspeccionDetalle.inspeccionLocal.reservas_alimento)],
                    ['Marcos totales', String(inspeccionDetalle.inspeccionLocal.marcos_totales)],
                    ['Marcos con cría', String(inspeccionDetalle.inspeccionLocal.marcos_cria)],
                    ['Marcos con miel', String(inspeccionDetalle.inspeccionLocal.marcos_miel)],
                    ['Tiene alza', inspeccionDetalle.inspeccionLocal.tiene_alza == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionLocal.tiene_alza ? 'Sí' : 'No'],
                    ['Nivel de miel', humanizar(inspeccionDetalle.inspeccionLocal.miel)],
                    ['Alimentación suministrada', inspeccionDetalle.inspeccionLocal.alimentacion_suministrada || 'Sin registro'],
                    ['Signos de enfermedad', inspeccionDetalle.inspeccionLocal.signos_enfermedad == null ? 'Sin evaluar' : inspeccionDetalle.inspeccionLocal.signos_enfermedad ? 'Sí' : 'No'],
                    ['Enfermedad observada', inspeccionDetalle.inspeccionLocal.enfermedad_observada || 'Sin registro'],
                    ['Tiras de medicamento', inspeccionDetalle.inspeccionLocal.tiras_medicamento == null ? 'Sin registro' : String(inspeccionDetalle.inspeccionLocal.tiras_medicamento)],
                    ['Observaciones', inspeccionDetalle.inspeccionLocal.observaciones || 'Sin observaciones'],
                    ['Sincronización', inspeccionDetalle.inspeccionLocal.estado === 'SINCRONIZADO' ? 'Sincronizada' : 'Pendiente de sincronización'],
                  ].map(([etiqueta, valor]) => (
                    <View key={etiqueta} style={styles.detalleCampo}>
                      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
                      <Text style={styles.datoValor}>{valor}</Text>
                    </View>
                  ))}
                  {tratamientosLocales
                    .filter((tratamiento) => tratamiento.inspeccion_local_id === inspeccionDetalle.inspeccionLocal!.id)
                    .map((tratamiento) => (
                      <View key={`tratamiento-local-${tratamiento.id}`} style={styles.detalleCampo}>
                        <Text style={styles.datoEtiqueta}>Tratamiento asociado</Text>
                        <Text style={styles.datoValor}>
                          {tratamiento.producto || humanizar(tratamiento.tipo_tratamiento)}
                          {tratamiento.dosis ? ` · ${tratamiento.dosis}` : ''}
                        </Text>
                        <Text style={styles.eventoLinea}>
                          {humanizar(tratamiento.estado)} · Desde {formatearFecha(tratamiento.fecha_inicio)}
                          {tratamiento.fecha_fin ? ` hasta ${formatearFecha(tratamiento.fecha_fin)}` : ''}
                        </Text>
                      </View>
                    ))}
                  {transferenciasLocales
                    .filter((transferencia) => transferencia.inspeccion_local_id === inspeccionDetalle.inspeccionLocal!.id)
                    .map((transferencia, indice) => (
                      <View key={`transferencia-local-${indice}`} style={styles.detalleCampo}>
                        <Text style={styles.datoEtiqueta}>Transferencia de marco</Text>
                        <Text style={styles.datoValor}>
                          {transferencia.origen} {' → '} {transferencia.destino}
                        </Text>
                        <Text style={styles.eventoLinea}>
                          {humanizar(transferencia.contenido)} · {humanizar(transferencia.ubicacion)} · Posición {transferencia.numero}
                        </Text>
                      </View>
                    ))}
                  {cargandoDetalleLocal ? (
                    <ActivityIndicator color={COLORS.goldText} style={{ marginVertical: 14 }} />
                  ) : detalleMarcosLocales.length > 0 ? (
                    <View style={styles.detalleCampo}>
                      <Text style={styles.datoEtiqueta}>Detalle de marcos</Text>
                      {detalleMarcosLocales.map((marco) => (
                        <Text key={`${marco.ubicacion}-${marco.numero}`} style={styles.eventoLinea}>
                          {humanizar(marco.ubicacion)} · Posición {marco.numero}: {humanizar(marco.contenido)}
                          {marco.transferir ? ` · Transferido a ${marco.destino_codigo || 'destino no indicado'}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.textoSecundario}>No hay datos detallados disponibles para esta inspección.</Text>
              )}
            </ScrollView>
            <View style={styles.pieDetalleInspeccion}>
              <Pressable style={styles.botonSecundario} onPress={cerrarDetalleInspeccion}>
                <Text style={styles.botonSecundarioTexto}>Cerrar detalle</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* FORMULARIO CREAR / EDITAR */}
      <Modal
        visible={formularioVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!guardando) { setFechaFormularioPickerVisible(false); setFormularioVisible(false); } }}
      >
        <View style={styles.fondoModal}>
          <View style={styles.modalFormulario}>
            <View style={styles.modalEncabezado}>
              <Text style={styles.modalTitulo}>{editando ? `Editar colmena ${editando.codigo}` : 'Nueva colmena'}</Text>
              <Pressable onPress={() => { if (!guardando) { setFechaFormularioPickerVisible(false); setFormularioVisible(false); } }} style={styles.cerrarModal} disabled={guardando}>
                <Text style={styles.cerrarModalTexto}>✕</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContenido}>
              <Text style={styles.datoEtiqueta}>Apiario *</Text>
              <Pressable style={styles.selectorApiario} onPress={() => setApiarioPickerVisible(true)} disabled={guardando}>
                <Text style={styles.datoValor}>{apiarios.find((item) => String(item.id) === formulario.apiario_id)?.nombre ?? 'Selecciona un apiario'}</Text>
                <Text style={styles.selectorFlecha}>⌄</Text>
              </Pressable>

              <Text style={styles.datoEtiqueta}>Código *</Text>
              <TextInput
                value={formulario.codigo}
                onChangeText={(valor) => setFormulario((actual) => ({ ...actual, codigo: valor }))}
                style={styles.input}
                placeholder="Ej. COL-004"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="characters"
                autoFocus={!editando}
                maxLength={50}
                editable={!guardando}
              />
              <Text style={styles.ayudaFormulario}>Identificador único, por ejemplo COL-004.</Text>

              <View style={styles.filaFormulario}>
                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Estado</Text>
                  <Pressable style={styles.selectorApiario} onPress={() => setEstadoFormularioPickerVisible(true)} disabled={guardando}>
                    <Text style={styles.datoValor}>{ESTADOS.find((item) => item.valor === formulario.estado)?.texto ?? 'Activa'}</Text>
                    <Text style={styles.selectorFlecha}>⌄</Text>
                  </Pressable>
                </View>

                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Fecha de instalación</Text>
                  <Pressable style={styles.inputFechaFormulario} onPress={() => setFechaFormularioPickerVisible(true)} disabled={guardando}>
                    <Text style={[styles.fechaFormularioTexto, !formulario.fecha_instalacion && styles.fechaHistorialPlaceholder]}>
                      {formulario.fecha_instalacion ? fechaHistorialTexto(formulario.fecha_instalacion) : 'dd-mm-aaaa'}
                    </Text>
                    <Text style={styles.iconoCalendario}>▦</Text>
                  </Pressable>
                </View>
              </View>

              {fechaFormularioPickerVisible && (
                <DateTimePicker
                  value={fechaDatePicker(formulario.fecha_instalacion)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={(evento, fechaSeleccionada) => {
                    setFechaFormularioPickerVisible(false);
                    if (evento.type !== 'dismissed' && fechaSeleccionada) {
                      setFormulario((actual) => ({ ...actual, fecha_instalacion: fechaISODatePicker(fechaSeleccionada) }));
                    }
                  }}
                />
              )}

              <Text style={styles.datoEtiqueta}>Observaciones</Text>
              <TextInput
                value={formulario.observaciones}
                onChangeText={(valor) => setFormulario((actual) => ({ ...actual, observaciones: valor }))}
                style={[styles.input, styles.inputMultilinea]}
                multiline
                textAlignVertical="top"
                placeholder="Observaciones de la colmena"
                placeholderTextColor={COLORS.textMuted}
                maxLength={2000}
                editable={!guardando}
              />
            </ScrollView>

            <View style={styles.pieFormulario}>
              <Pressable style={styles.botonSecundarioFlex} onPress={() => setFormularioVisible(false)} disabled={guardando}>
                <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.botonPrincipalFlex} onPress={() => void guardarFormulario()} disabled={guardando}>
                {guardando ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.botonPrincipalTexto}>{editando ? 'Guardar cambios' : 'Registrar colmena'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SELECTOR DE ESTADO DEL FORMULARIO */}
      <Modal visible={estadoFormularioPickerVisible} transparent animationType="fade" onRequestClose={() => setEstadoFormularioPickerVisible(false)}>
        <View style={styles.fondoModal}>
          <View style={styles.modalPicker}>
            <Text style={styles.modalTitulo}>Seleccionar estado</Text>
            {ESTADOS.map((item) => (
              <Pressable
                key={item.valor}
                style={styles.opcionApiario}
                onPress={() => { setFormulario((actual) => ({ ...actual, estado: item.valor })); setEstadoFormularioPickerVisible(false); }}
              >
                <Text style={styles.datoValor}>{item.texto}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.botonSecundario} onPress={() => setEstadoFormularioPickerVisible(false)}>
              <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* CREAR COLMENAS EN LOTE */}
      <Modal visible={loteVisible} transparent animationType="fade" onRequestClose={() => { if (!loteCreando) { setFechaLotePickerVisible(false); setLoteVisible(false); } }}>
        <View style={styles.fondoModal}>
          <View style={styles.modalFormulario}>
            <View style={styles.modalEncabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>Crear colmenas en lote</Text>
                <Text style={styles.modalDescripcion}>Para la carga inicial de un apiario: crea varias colmenas activas con códigos correlativos.</Text>
              </View>
              <Pressable onPress={() => { if (!loteCreando) { setFechaLotePickerVisible(false); setLoteVisible(false); } }} style={styles.cerrarModal} disabled={loteCreando}>
                <Text style={styles.cerrarModalTexto}>✕</Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContenido}>
              <Text style={styles.datoEtiqueta}>Apiario *</Text>
              <Pressable style={styles.selectorApiario} onPress={() => setLoteApiarioPickerVisible(true)} disabled={loteCreando}>
                <Text style={styles.datoValor}>{apiarios.find((item) => String(item.id) === loteFormulario.apiario_id)?.nombre ?? 'Selecciona un apiario'}</Text>
                <Text style={styles.selectorFlecha}>⌄</Text>
              </Pressable>

              <View style={styles.filaFormulario}>
                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Prefijo del código *</Text>
                  <TextInput
                    value={loteFormulario.prefijo}
                    onChangeText={(valor) => setLoteFormulario((actual) => ({ ...actual, prefijo: valor.toUpperCase() }))}
                    style={styles.input}
                    placeholder="Ej. CUL"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="characters"
                    editable={!loteCreando}
                  />
                </View>
                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Desde el número *</Text>
                  <TextInput
                    value={loteFormulario.desde_numero}
                    onChangeText={(valor) => setLoteFormulario((actual) => ({ ...actual, desde_numero: valor.replace(/[^0-9]/g, '') }))}
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="1"
                    editable={!loteCreando}
                  />
                </View>
                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Cantidad *</Text>
                  <TextInput
                    value={loteFormulario.cantidad}
                    onChangeText={(valor) => setLoteFormulario((actual) => ({ ...actual, cantidad: valor.replace(/[^0-9]/g, '') }))}
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="Ej. 50"
                    editable={!loteCreando}
                  />
                  <Text style={styles.ayudaFormulario}>Hasta 500 por vez.</Text>
                </View>
              </View>

              <View style={styles.filaFormulario}>
                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Marcos por colmena</Text>
                  <TextInput
                    value={loteFormulario.cantidad_marcos}
                    onChangeText={(valor) => setLoteFormulario((actual) => ({ ...actual, cantidad_marcos: valor.replace(/[^0-9]/g, '') }))}
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="10"
                    editable={!loteCreando}
                  />
                </View>
                <View style={styles.controlFormulario}>
                  <Text style={styles.datoEtiqueta}>Fecha de instalación</Text>
                  <Pressable style={styles.inputFechaFormulario} onPress={() => setFechaLotePickerVisible(true)} disabled={loteCreando}>
                    <Text style={[styles.fechaFormularioTexto, !loteFormulario.fecha_instalacion && styles.fechaHistorialPlaceholder]}>
                      {loteFormulario.fecha_instalacion ? fechaHistorialTexto(loteFormulario.fecha_instalacion) : 'dd-mm-aaaa'}
                    </Text>
                    <Text style={styles.iconoCalendario}>▦</Text>
                  </Pressable>
                  <Text style={styles.ayudaFormulario}>Opcional.</Text>
                </View>
              </View>

              {fechaLotePickerVisible && (
                <DateTimePicker
                  value={fechaDatePicker(loteFormulario.fecha_instalacion)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  onChange={(evento, fechaSeleccionada) => {
                    setFechaLotePickerVisible(false);
                    if (evento.type !== 'dismissed' && fechaSeleccionada) {
                      setLoteFormulario((actual) => ({ ...actual, fecha_instalacion: fechaISODatePicker(fechaSeleccionada) }));
                    }
                  }}
                />
              )}

              {loteCreando && (
                <View style={styles.progresoLote}>
                  <ActivityIndicator color={COLORS.goldText} />
                  <Text style={styles.textoSecundario}>Creando colmenas: {loteProgreso} / {Number(loteFormulario.cantidad) || 0}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.pieFormulario}>
              <Pressable style={styles.botonSecundarioFlex} onPress={() => setLoteVisible(false)} disabled={loteCreando}>
                <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.botonPrincipalFlex} onPress={() => void crearColmenasEnLote()} disabled={loteCreando}>
                {loteCreando ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.botonPrincipalTexto}>▤ Crear colmenas</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SELECTOR DE APIARIO PARA LOTE */}
      <Modal visible={loteApiarioPickerVisible} transparent animationType="fade" onRequestClose={() => setLoteApiarioPickerVisible(false)}>
        <View style={styles.fondoModal}>
          <View style={styles.modalPicker}>
            <Text style={styles.modalTitulo}>Seleccionar apiario</Text>
            <ScrollView>
              {apiarios.map((item) => (
                <Pressable key={item.id} style={styles.opcionApiario} onPress={() => { setLoteFormulario((actual) => ({ ...actual, apiario_id: String(item.id) })); setLoteApiarioPickerVisible(false); }}>
                  <Text style={styles.datoValor}>{item.nombre}</Text>
                  <Text style={styles.textoSecundario}>{item.ubicacion ?? 'Sin ubicación registrada'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.botonSecundario} onPress={() => setLoteApiarioPickerVisible(false)}>
              <Text style={styles.botonSecundarioTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* CONFIRMACIÓN DE BAJA LÓGICA */}
      <Modal visible={Boolean(colmenaABaja)} transparent animationType="fade" onRequestClose={() => { if (!bajaProcesando) setColmenaABaja(null); }}>
        <View style={styles.fondoModal}>
          <View style={styles.modalConfirmacion}>
            <View style={styles.modalEncabezado}>
              <Text style={styles.modalTitulo}>¿Dar de baja la colmena {colmenaABaja?.codigo}?</Text>
              <Pressable onPress={() => !bajaProcesando && setColmenaABaja(null)} style={styles.cerrarModal} disabled={bajaProcesando}>
                <Text style={styles.cerrarModalTexto}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.textoConfirmacion}>
              Dejará de aparecer en las listas y no se podrán registrar nuevas inspecciones en ella. Sus inspecciones, tratamientos y transferencias se conservan.
            </Text>
            <View style={styles.pieFormulario}>
              <Pressable style={styles.botonSecundarioFlex} onPress={() => setColmenaABaja(null)} disabled={bajaProcesando}>
                <Text style={styles.botonSecundarioTexto}>Volver</Text>
              </Pressable>
              <Pressable style={styles.botonPeligroFlex} onPress={() => void ejecutarBaja()} disabled={bajaProcesando}>
                {bajaProcesando ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.botonPeligroTexto}>Dar de baja</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ESCANEAR QR PARA ABRIR LA FICHA DE UNA COLMENA */}
      <Modal visible={escaneoListadoVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { qrListadoBloqueado.current = false; setEscaneoListadoVisible(false); }}>
        <View style={styles.camaraPantalla}>
          {cameraPermission?.granted ? (
            <CameraView
              key="lector-qr-listado-colmenas"
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => void manejarQrListado(data)}
            />
          ) : (
            <View style={styles.camaraSinPermiso}>
              <Text style={styles.camaraTitulo}>Permiso de cámara requerido</Text>
              <Text style={styles.camaraAyuda}>Activa el permiso de cámara en los ajustes del teléfono y vuelve a intentarlo.</Text>
            </View>
          )}
          <View style={styles.camaraCabecera} pointerEvents="none">
            <Text style={styles.camaraTitulo}>Escanear QR de colmena</Text>
            <Text style={styles.camaraAyuda}>Centra la etiqueta de la colmena dentro del recuadro.</Text>
          </View>
          <View pointerEvents="none" style={styles.marcoEscaneo} />
          <Pressable style={styles.cerrarCamara} onPress={() => { qrListadoBloqueado.current = false; setEscaneoListadoVisible(false); }}>
            <Text style={styles.cerrarCamaraTexto}>Cancelar escaneo</Text>
          </Pressable>
        </View>
      </Modal>

      {/* FILTRO DE APIARIO */}
      <Modal
        visible={apiarioFiltroPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setApiarioFiltroPickerVisible(false)}
      >
        <View style={styles.fondoModal}>
          <View style={styles.modalPicker}>
            <Text style={styles.modalTitulo}>Filtrar por apiario</Text>
            <ScrollView>
              <Pressable
                style={styles.opcionApiario}
                onPress={() => {
                  setApiarioFiltro('');
                  setApiarioFiltroPickerVisible(false);
                }}
              >
                <Text style={styles.datoValor}>Todos los apiarios</Text>
              </Pressable>
              {apiarios.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.opcionApiario}
                  onPress={() => {
                    setApiarioFiltro(String(item.id));
                    setApiarioFiltroPickerVisible(false);
                  }}
                >
                  <Text style={styles.datoValor}>{item.nombre}</Text>
                  <Text style={styles.textoSecundario}>{item.ubicacion ?? 'Sin ubicación registrada'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.botonSecundario}
              onPress={() => setApiarioFiltroPickerVisible(false)}
            >
              <Text style={styles.botonSecundarioTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* FILTRO DE ESTADO */}
      <Modal
        visible={estadoFiltroPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEstadoFiltroPickerVisible(false)}
      >
        <View style={styles.fondoModal}>
          <View style={styles.modalPicker}>
            <Text style={styles.modalTitulo}>Filtrar por estado</Text>
            <ScrollView>
              <Pressable
                style={styles.opcionApiario}
                onPress={() => {
                  setFiltroEstado('TODAS');
                  setEstadoFiltroPickerVisible(false);
                }}
              >
                <Text style={styles.datoValor}>Todos los estados</Text>
              </Pressable>
              {ESTADOS.map((item) => (
                <Pressable
                  key={item.valor}
                  style={styles.opcionApiario}
                  onPress={() => {
                    setFiltroEstado(item.valor);
                    setEstadoFiltroPickerVisible(false);
                  }}
                >
                  <Text style={styles.datoValor}>{item.texto}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={styles.botonSecundario}
              onPress={() => setEstadoFiltroPickerVisible(false)}
            >
              <Text style={styles.botonSecundarioTexto}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* SELECTOR DE APIARIO */}
      <Modal visible={apiarioPickerVisible} transparent animationType="fade" onRequestClose={() => setApiarioPickerVisible(false)}>
        <View style={styles.fondoModal}>
          <View style={styles.modalPicker}>
            <Text style={styles.modalTitulo}>Seleccionar apiario</Text>
            <ScrollView>
              {apiarios.map((item) => (
                <Pressable key={item.id} style={styles.opcionApiario} onPress={() => { setFormulario((actual) => ({ ...actual, apiario_id: String(item.id) })); setApiarioPickerVisible(false); }}>
                  <Text style={styles.datoValor}>{item.nombre}</Text>
                  <Text style={styles.textoSecundario}>{item.ubicacion ?? 'Sin ubicación registrada'}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.botonSecundario} onPress={() => setApiarioPickerVisible(false)}><Text style={styles.botonSecundarioTexto}>Cerrar</Text></Pressable>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.backgroundSoft },
  volverModulo: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 2 },
  volverModuloTexto: { color: COLORS.goldText, fontWeight: '900', fontSize: 13 },
  contenido: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 38 },
  barraSuperiorListado: { marginBottom: 16 },
  descripcionListado: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 12 },
  accionesEncabezado: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 7 },
  botonAccionSecundario: { minHeight: 40, flexGrow: 1, flexBasis: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, backgroundColor: COLORS.surface },
  botonAccionTexto: { color: COLORS.text, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  botonAccionPrincipal: { minHeight: 40, flexGrow: 1, flexBasis: 104, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 10, backgroundColor: COLORS.gold },
  botonAccionPrincipalTexto: { color: COLORS.forestDeep, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  estadoServidor: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8, marginTop: 8, borderWidth: 1 },
  servidorOk: { backgroundColor: COLORS.successBg, borderColor: '#B7DCC3' },
  servidorOffline: { backgroundColor: COLORS.warningBg, borderColor: '#F3D49C' },
  punto: { width: 8, height: 8, borderRadius: 5, marginRight: 7 },
  puntoOk: { backgroundColor: COLORS.success },
  puntoOffline: { backgroundColor: COLORS.warning },
  estadoServidorTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '800' },
  resumen: { flexDirection: 'row', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, paddingVertical: 15, marginBottom: 12 },
  resumenItem: { flex: 1, alignItems: 'center', paddingHorizontal: 3 },
  numero: { color: COLORS.goldText, fontSize: 23, fontWeight: '900' },
  resumenTexto: { color: COLORS.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 4 },
  aviso: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldBorder, borderWidth: 1, borderRadius: 11, padding: 12, marginBottom: 12 },
  avisoTexto: { color: COLORS.goldText, fontSize: 12, lineHeight: 18 },
  errorCaja: { backgroundColor: COLORS.dangerBg, borderRadius: 11, padding: 12, marginBottom: 12 },
  errorTexto: { color: COLORS.danger, fontSize: 12, lineHeight: 18 },
  filtroDashboard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.goldSoft, borderWidth: 1, borderColor: COLORS.goldBorder, borderRadius: 11, padding: 12, marginBottom: 14 },
  filtroDashboardTitulo: { color: COLORS.goldText, fontWeight: '900', fontSize: 12 },
  filtroDashboardTexto: { color: COLORS.textSecondary, fontSize: 11, marginTop: 3 },
  quitarFiltro: { borderWidth: 1, borderColor: COLORS.goldBorder, backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  quitarFiltroTexto: { color: COLORS.goldText, fontSize: 11, fontWeight: '800' },
  labelSeccion: { color: COLORS.forest, fontSize: 15, fontWeight: '900', marginTop: 16, marginBottom: 8 },
  filtrosListado: { marginTop: 2, marginBottom: 4 },
  inputFiltro: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, color: COLORS.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  input: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, color: COLORS.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, marginBottom: 12 },
  filaSelectoresFiltro: { flexDirection: 'row', gap: 9, marginTop: 12 },
  controlFiltro: { flex: 1, minWidth: 0 },
  labelFiltro: { color: COLORS.forest, fontSize: 12, fontWeight: '900', marginBottom: 6 },
  selectorFiltro: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, paddingHorizontal: 11 },
  selectorFiltroTexto: { color: COLORS.text, fontSize: 12, flex: 1, marginRight: 5 },
  selectorFiltroFlecha: { color: COLORS.forest, fontSize: 18, fontWeight: '900' },
  checkboxFiltro: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 13, paddingVertical: 5, paddingRight: 8 },
  checkboxCuadro: { width: 19, height: 19, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 4, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  checkboxCuadroActivo: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  checkboxMarca: { color: COLORS.forestDeep, fontSize: 13, fontWeight: '900', lineHeight: 16 },
  checkboxTexto: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  filaChips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, paddingRight: 10 },
  filaChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chipActivo: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  chipTextoActivo: { color: COLORS.forestDeep, fontWeight: '900' },
  barraAcciones: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 6 },
  resultados: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  botonTexto: { paddingVertical: 8, paddingHorizontal: 4 },
  botonTextoLabel: { color: COLORS.goldText, fontSize: 12, fontWeight: '900' },
  tarjetaColmena: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  tarjetaColmenaTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  codigoConAlerta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  codigoColmena: { color: COLORS.forest, fontSize: 16, fontWeight: '900' },
  puntoAtencion: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginLeft: 7 },
  apiarioTexto: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  insigniaEstado: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8 },
  estadoActiva: { backgroundColor: COLORS.successBg, borderColor: '#B7DCC3' },
  estadoObservacion: { backgroundColor: COLORS.warningBg, borderColor: '#F3D49C' },
  estadoInactiva: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  insigniaEstadoTexto: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '800' },
  datosFila: { flexDirection: 'row', gap: 14, marginTop: 12 },
  datoTarjeta: { flex: 1, minWidth: 0 },
  datoTarjetaEtiqueta: { color: COLORS.textMuted, fontSize: 10, marginBottom: 3 },
  datoTarjetaValor: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  datoTarjetaEstado: { alignSelf: 'flex-start', color: '#0875C9', backgroundColor: '#EAF6FF', borderWidth: 1, borderColor: '#B8E2FF', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, marginTop: 4, fontSize: 9, fontWeight: '800' },
  tarjetaColmenaBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 12, paddingTop: 9, gap: 8 },
  accionVerFicha: { paddingVertical: 4, paddingRight: 8 },
  verFicha: { color: COLORS.goldText, fontSize: 11, fontWeight: '900' },
  accionesTarjeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accionTarjeta: { paddingVertical: 4 },
  accionTarjetaTexto: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '700' },
  accionTarjetaPeligro: { color: COLORS.danger, fontSize: 10, fontWeight: '700' },
  accionesInferiores: { marginTop: 8 },
  botonPrincipal: { backgroundColor: COLORS.gold, borderRadius: 11, paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center', marginTop: 9 },
  botonPrincipalTexto: { color: COLORS.forestDeep, fontWeight: '900', fontSize: 13 },
  botonSecundario: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.goldBorder, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', marginTop: 9 },
  botonSecundarioTexto: { color: COLORS.goldText, fontWeight: '800', fontSize: 13 },
  botonPeligro: { backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: '#F2B8B5', borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginTop: 9 },
  botonPeligroTexto: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  pie: { color: COLORS.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 18 },
  tarjetaVacia: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 16, marginTop: 8 },
  tarjetaTitulo: { color: COLORS.forest, fontWeight: '900', fontSize: 14, marginBottom: 5 },
  textoSecundario: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  fondoModal: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', padding: 12 },
  modalFicha: { backgroundColor: COLORS.surface, borderRadius: 18, height: '94%', maxHeight: '94%', overflow: 'hidden' },
  modalQrFicha: { backgroundColor: COLORS.surface, borderRadius: 18, width: '100%', maxHeight: '88%', overflow: 'hidden' },
  scrollFicha: { flex: 1 },
  modalFormulario: { backgroundColor: COLORS.surface, borderRadius: 18, maxHeight: '90%', width: '100%', overflow: 'hidden' },
  modalPicker: { backgroundColor: COLORS.backgroundSoft, borderRadius: 16, maxHeight: '90%', padding: 18 },
  modalEncabezadoQr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  qrEtiquetaCampo: { color: COLORS.forest, fontSize: 13, fontWeight: '800', marginTop: 6, marginBottom: 8 },
  qrModosFila: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  qrModoBoton: { flex: 1, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 11, minHeight: 48, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  qrModoBotonActivo: { borderColor: COLORS.gold, borderWidth: 2, backgroundColor: COLORS.goldSoft },
  qrModoTexto: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  qrModoTextoActivo: { color: COLORS.forestDeep, fontWeight: '900' },
  qrModoContenido: { paddingBottom: 8 },
  qrExplicacion: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  qrSeparador: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 17, marginBottom: 10 },
  qrSeparadorLinea: { flex: 1, height: 1, backgroundColor: COLORS.border },
  qrSeparadorTexto: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  botonGenerarQr: { marginTop: 16 },
  camaraPantalla: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  camaraCabecera: { position: 'absolute', top: Platform.OS === 'ios' ? 66 : 38, left: 22, right: 22, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: '#00000088' },
  camaraTitulo: { color: '#FFFFFF', fontSize: 19, fontWeight: '900', textAlign: 'center' },
  camaraAyuda: { color: '#FFFFFF', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  marcoEscaneo: { position: 'absolute', top: '34%', alignSelf: 'center', width: 250, height: 250, borderWidth: 3, borderColor: COLORS.gold, borderRadius: 22 },
  camaraProcesando: { position: 'absolute', alignSelf: 'center', alignItems: 'center', backgroundColor: '#000000BB', padding: 22, borderRadius: 16 },
  camaraSinPermiso: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  cerrarCamara: { position: 'absolute', bottom: Platform.OS === 'ios' ? 42 : 24, left: 24, right: 24, backgroundColor: COLORS.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  cerrarCamaraTexto: { color: COLORS.forestDeep, fontSize: 14, fontWeight: '900' },
  modalEncabezado: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  modalTitulo: { color: COLORS.forest, fontSize: 19, fontWeight: '900' },
  modalSubtitulo: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  cerrarModal: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.backgroundSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  cerrarModalTexto: { color: COLORS.forest, fontSize: 16, fontWeight: '900' },
  contenidoFicha: { padding: 16, paddingBottom: 26 },
  fichaDatos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 15 },
  datoFicha: { width: '47%', minWidth: 0, paddingVertical: 2 },
  datoEtiqueta: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', marginBottom: 5 },
  datoValor: { color: COLORS.text, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  ultimaInspeccionFicha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  estadoInspeccionFicha: { color: '#0875C9', backgroundColor: '#EAF6FF', borderWidth: 1, borderColor: '#B8E2FF', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, fontSize: 9, fontWeight: '800' },
  qrCaja: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'transparent', padding: 4, marginTop: 8, marginBottom: 8 },
  imagenQr: { width: 132, height: 132, backgroundColor: '#FFFFFF', marginVertical: 6 },
  qrSinConexion: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginVertical: 6, padding: 10 },
  qrIcono: { color: COLORS.forest, fontSize: 54, marginBottom: 6 },
  codigoQrTexto: { color: COLORS.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 4 },
  botonQr: { paddingVertical: 9, paddingHorizontal: 12, marginTop: 7 },
  botonQrTexto: { color: COLORS.goldText, fontSize: 12, fontWeight: '900' },
  botonDeshabilitado: { opacity: 0.45 },
  historialEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 },
  tituloHistorial: { color: COLORS.forest, fontSize: 18, fontWeight: '900' },
  fechasHistorial: { flexDirection: 'row', gap: 9, marginTop: 12 },
  inputFecha: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 10, minHeight: 42, marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fechaHistorialTexto: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  fechaHistorialPlaceholder: { color: COLORS.textMuted, fontWeight: '400' },
  iconoCalendario: { color: COLORS.textSecondary, fontSize: 15, marginLeft: 5 },
  calendarioInlineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 },
  calendarioInlineTitulo: { color: COLORS.text, fontSize: 12, fontWeight: '800' },
  calendarioInlineCancelar: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  limpiarFiltros: { alignSelf: 'flex-start', paddingVertical: 8 },
  limpiarFiltrosTexto: { color: COLORS.goldText, fontWeight: '800', fontSize: 11 },
  evento: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  eventoPunto: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.gold, marginTop: 4 },
  eventoTituloFila: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  eventoTitulo: { color: COLORS.forest, fontWeight: '900', fontSize: 13, flexShrink: 1 },
  eventoEstado: { color: COLORS.goldText, backgroundColor: COLORS.goldSoft, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontWeight: '800' },
  eventoFecha: { color: COLORS.textMuted, fontSize: 10, marginTop: 4 },
  eventoLinea: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 3 },
  verDetalleEvento: { alignSelf: 'flex-start', paddingVertical: 7, paddingRight: 10, marginTop: 3 },
  verDetalleEventoTexto: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  accionesFicha: { marginTop: 16, paddingBottom: 10 },
  pieFicha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  botonPie: { flex: 1, minHeight: 44, justifyContent: 'center', marginTop: 0, paddingHorizontal: 8 },
  modalDetalleInspeccion: { backgroundColor: COLORS.backgroundSoft, borderRadius: 18, height: '90%', maxHeight: '90%', overflow: 'hidden' },
  detalleInspeccionContenido: { padding: 16, paddingBottom: 24 },
  detalleCampo: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 11, marginBottom: 8 },
  pieDetalleInspeccion: { padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  formContenido: { padding: 17, paddingBottom: 18 },
  selectorApiario: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 13, marginBottom: 12 },
  selectorFlecha: { color: COLORS.goldText, fontSize: 18, fontWeight: '900' },
  filaFormulario: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  controlFormulario: { flex: 1, minWidth: 0 },
  inputFechaFormulario: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, paddingHorizontal: 11, marginBottom: 12 },
  fechaFormularioTexto: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  ayudaFormulario: { color: COLORS.textMuted, fontSize: 10, lineHeight: 15, marginTop: -7, marginBottom: 10 },
  modalDescripcion: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4, marginRight: 8 },
  pieFormulario: { flexDirection: 'row', gap: 9, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
  progresoLote: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.goldSoft, borderRadius: 10, padding: 12, marginTop: 8 },
  modalConfirmacion: { width: '100%', maxWidth: 480, backgroundColor: COLORS.surface, borderRadius: 17, overflow: 'hidden' },
  textoConfirmacion: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, paddingHorizontal: 17, paddingVertical: 16 },
  botonPeligroFlex: { flex: 1, backgroundColor: COLORS.danger, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  inputMultilinea: { minHeight: 90, textAlignVertical: 'top' },
  filaBotones: { flexDirection: 'row', gap: 9, marginTop: 12 },
  botonSecundarioFlex: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  botonPrincipalFlex: { flex: 1, backgroundColor: COLORS.gold, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  opcionApiario: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
});
