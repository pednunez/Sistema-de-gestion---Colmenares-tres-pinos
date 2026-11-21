import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as SQLite from 'expo-sqlite';

import { COLORS } from './theme';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { listarInspeccionesLocales } from './database/inspecciones';
import type { InspeccionGuardada } from './database/inspecciones';
import { listarTransferenciasPreparadas } from './database/inspeccionesAvanzadas';
import { listarTratamientosLocales } from './database/tratamientos';
import type { TratamientoGuardado } from './database/tratamientos';

type Props = {
  onVolver: () => void;
  onEscanear: () => void;
  onVerInspecciones: () => void;
  onInspeccionar?: (colmenaId: number) => void;
  onAbrirTratamientos?: () => void;
  apiarioIdInicial?: number;
  colmenaIdsIniciales?: number[];
  colmenaIdInicial?: number;
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
  cantidad_marcos?: number | null;
  tiene_alza?: boolean | null;
  signos_enfermedad?: boolean | null;
  enfermedad_observada?: string | null;
  observaciones?: string | null;
  marcos?: Array<{ transferido_a_colmena_id?: number | null }>;
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
};

type FormularioColmena = {
  apiario_id: string;
  codigo: string;
  estado: Exclude<EstadoColmenaApi, 'BAJA'>;
  fecha_instalacion: string;
  cantidad_marcos: string;
  observaciones: string;
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

function construirEventos(
  colmena: ColmenaApi,
  paquete: PaqueteHistorial,
  inspeccionesLocales: InspeccionGuardada[],
  tratamientosLocales: TratamientoGuardado[],
  transferenciasLocales: TransferenciaLocal[],
  colmenas: ColmenaApi[],
  inspeccionesLocalesTodas: InspeccionGuardada[],
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
  onVolver,
  onEscanear,
  onVerInspecciones,
  onInspeccionar,
  onAbrirTratamientos,
  apiarioIdInicial,
  colmenaIdsIniciales,
  colmenaIdInicial,
}: Props) {
  const [sesion, setSesion] = useState<SesionMovil | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoMovil | null>(null);
  const [colmenas, setColmenas] = useState<ColmenaApi[]>([]);
  const [inspeccionesServidor, setInspeccionesServidor] = useState<InspeccionServidor[]>([]);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<InspeccionGuardada[]>([]);
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

  const [formularioVisible, setFormularioVisible] = useState(false);
  const [apiarioPickerVisible, setApiarioPickerVisible] = useState(false);
  const [editando, setEditando] = useState<ColmenaApi | null>(null);
  const [formulario, setFormulario] = useState<FormularioColmena>(crearFormulario());
  const [guardando, setGuardando] = useState(false);

  const [qrVisible, setQrVisible] = useState(false);
  const [qrNuevo, setQrNuevo] = useState('');
  const [guardandoQr, setGuardandoQr] = useState(false);

  const esAdmin = sesion?.usuario.rol === 'ADMIN';

  const cargarDatos = useCallback(async (manual = false) => {
    if (manual) setActualizando(true);
    else setCargando(true);
    setError('');
    setAviso('');

    try {
      const sesionActual = await leerSesionGuardada();
      setSesion(sesionActual);

      const [catalogoLocal, inspecciones, tratamientos, transferencias, inspeccionesCache] = await Promise.all([
        sesionActual ? leerCatalogoLocal(sesionActual.usuario.id).catch(() => null) : Promise.resolve(null),
        listarInspeccionesLocales().catch(() => [] as InspeccionGuardada[]),
        listarTratamientosLocales().catch(() => [] as TratamientoGuardado[]),
        listarTransferenciasPreparadas().catch(() => [] as TransferenciaLocal[]),
        sesionActual
          ? leerInspeccionesServidorCache(sesionActual.usuario.id).catch(() => [] as InspeccionServidor[])
          : Promise.resolve([] as InspeccionServidor[]),
      ]);

      setCatalogo(catalogoLocal);
      const usuarioId = sesionActual?.usuario.id ?? null;
      const inspeccionesPropias = inspecciones.filter((item) =>
        usuarioId == null ? item.usuario_local_id == null : item.usuario_local_id === usuarioId || item.usuario_local_id == null
      );
      const idsInspeccionesPropias = new Set(inspeccionesPropias.map((item) => item.id));
      const tratamientosPropios = tratamientos.filter((item) =>
        usuarioId == null ? item.usuario_local_id == null : item.usuario_local_id === usuarioId || item.usuario_local_id == null
      );
      const transferenciasPropias = transferencias.filter((item) => idsInspeccionesPropias.has(item.inspeccion_local_id));

      setInspeccionesLocales(inspeccionesPropias);
      setTratamientosLocales(tratamientosPropios);
      setTransferenciasLocales(transferenciasPropias);

      let lista: ColmenaApi[] = [];
      if (sesionActual) {
        lista = await leerColmenasCache(sesionActual.usuario.id).catch(() => []) ?? [];
      }
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

      let online = false;
      let inspeccionesActuales = inspeccionesCache;
      const mensajesAviso: string[] = [];

      if (sesionActual && tokenVigente(sesionActual)) {
        try {
          const servidor = await listarColmenas(sesionActual.accessToken, { orden: 'codigo' });
          lista = servidor.filter((item) => item.activo !== false && item.estado !== 'BAJA');
          await guardarColmenasCache(sesionActual.usuario.id, lista);
          online = true;
        } catch (e) {
          const mensaje = e instanceof Error ? e.message : 'No se pudo consultar FastAPI.';
          mensajesAviso.push(lista.length
            ? `Sin conexión con el servidor. Se muestra la última copia guardada. ${mensaje}`
            : mensaje);
        }

        try {
          const inspeccionesRemotas = await solicitarAPI<InspeccionServidor[]>('/inspecciones/', {
            method: 'GET',
            token: sesionActual.accessToken,
          });
          inspeccionesActuales = Array.isArray(inspeccionesRemotas) ? inspeccionesRemotas : [];
          await guardarInspeccionesServidorCache(sesionActual.usuario.id, inspeccionesActuales);
        } catch (e) {
          const mensaje = e instanceof Error ? e.message : 'No se pudieron actualizar las inspecciones.';
          mensajesAviso.push(
            inspeccionesActuales.length
              ? `Se conserva la última copia de inspecciones. ${mensaje}`
              : `No se pudieron cargar las inspecciones del servidor. ${mensaje}`
          );
        }
      } else if (sesionActual) {
        mensajesAviso.push('La sesión venció. Se muestran las últimas copias guardadas en el dispositivo.');
      } else {
        mensajesAviso.push('No hay una sesión activa. Se muestran los datos locales disponibles.');
      }

      setInspeccionesServidor(inspeccionesActuales);
      setAviso(mensajesAviso.join(' '));
      setConectado(online);
      setColmenas(lista);
      if (lista.length === 0 && !catalogoLocal) {
        setError('No hay colmenas guardadas en el dispositivo. Conéctate al servidor para descargar el catálogo oficial.');
      }
    } catch (e) {
      console.error('Error cargando módulo Colmenas:', e);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las colmenas.');
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    void cargarDatos(false);
  }, [cargarDatos]);

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
        id: -Math.abs(Number(item.id)),
        colmena_id: colmena.id,
        fecha_inspeccion: item.fecha_local,
      } as InspeccionServidor];
    });

    return [...inspeccionesServidor, ...locales];
  }, [inspeccionesServidor, inspeccionesLocales, colmenas]);

  const colmenasConAtencion = useMemo(
    () => calcularColmenasConAtencion(colmenas, inspeccionesParaAlertas),
    [colmenas, inspeccionesParaAlertas]
  );

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
    const remotas = historial.inspecciones
      .filter((item) => item.colmena_id === ficha.id)
      .map((item) => ({ fecha: item.fecha_inspeccion, estado: item.estado_general ?? null }));
    const locales = inspeccionesLocales
      .filter((item) => item.codigo_qr.trim().toLowerCase() === ficha.codigo_qr.trim().toLowerCase())
      .map((item) => ({ fecha: item.fecha_local, estado: null }));
    return [...remotas, ...locales].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0] ?? null;
  }, [ficha, historial.inspecciones, inspeccionesLocales]);

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
        solicitarAPI<InspeccionServidor[]>('/inspecciones/', { method: 'GET', token }).catch(() => null),
        solicitarAPI<TratamientoServidor[]>('/tratamientos/', { method: 'GET', token }).catch(() => null),
        listarTransferencias(sesion).catch(() => null),
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
    const marcos = Number(formulario.cantidad_marcos);
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
    if (!Number.isInteger(marcos) || marcos < 0) {
      Alert.alert('Cantidad inválida', 'La cantidad de marcos debe ser un número entero igual o mayor que cero.');
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
      cantidad_marcos: marcos,
      observaciones: formulario.observaciones.trim() || null,
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
    Alert.alert(
      `¿Dar de baja ${colmena.codigo}?`,
      'La colmena dejará de aparecer en los listados operativos. Su historial se conserva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await darDeBajaColmena(colmena.id, sesion.accessToken);
                setFichaId(null);
                await descargarCatalogo(sesion).catch(() => undefined);
                await cargarDatos(true);
                Alert.alert('Colmena dada de baja', 'La baja lógica se registró correctamente.');
              } catch (e) {
                Alert.alert('No se pudo dar de baja', e instanceof Error ? e.message : 'Ocurrió un error.');
              }
            })();
          },
        },
      ]
    );
  };

  const abrirCambioQr = () => {
    setQrNuevo('');
    setQrVisible(true);
  };

  const guardarCambioQr = async () => {
    if (!ficha || !sesion || !tokenVigente(sesion)) {
      Alert.alert('Sin sesión vigente', 'Debes conectarte nuevamente para cambiar la etiqueta QR.');
      return;
    }
    const valor = qrNuevo.trim();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (valor && !uuid.test(valor)) {
      Alert.alert('Código QR inválido', 'Ingresa un UUID válido o deja el campo vacío para generar uno nuevo.');
      return;
    }
    setGuardandoQr(true);
    try {
      await asociarQrColmena(ficha.id, valor || null, sesion.accessToken);
      await descargarCatalogo(sesion).catch(() => undefined);
      setQrVisible(false);
      await cargarDatos(true);
      Alert.alert('Etiqueta actualizada', valor ? 'Se asoció el nuevo código QR.' : 'Se generó un nuevo código QR para la colmena.');
    } catch (e) {
      Alert.alert('No se pudo cambiar el QR', e instanceof Error ? e.message : 'Ocurrió un error al cambiar la etiqueta.');
    } finally {
      setGuardandoQr(false);
    }
  };

  const inspeccionar = (colmena: ColmenaApi) => {
    setFichaId(null);
    if (onInspeccionar) onInspeccionar(colmena.id);
    else onEscanear();
  };

  const irATratamientos = () => {
    setFichaId(null);
    if (onAbrirTratamientos) onAbrirTratamientos();
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
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={actualizando} onRefresh={() => void cargarDatos(true)} tintColor={COLORS.goldText} />}
      >
        <Pressable onPress={onVolver} style={styles.volverModulo}>
          <Text style={styles.volverModuloTexto}>‹ Volver</Text>
        </Pressable>
        <View style={styles.encabezado}>
          <View style={styles.encabezadoTexto}>
            <Text style={styles.titulo}>Colmenas</Text>
            <Text style={styles.subtitulo}>Inventario, fichas e historial de actividad.</Text>
          </View>
          <View style={[styles.estadoServidor, conectado ? styles.servidorOk : styles.servidorOffline]}>
            <View style={[styles.punto, conectado ? styles.puntoOk : styles.puntoOffline]} />
            <Text style={styles.estadoServidorTexto}>{conectado ? 'Conectado' : 'Modo local'}</Text>
          </View>
        </View>

        <View style={styles.resumen}>
          <View style={styles.resumenItem}>
            <Text style={styles.numero}>{colmenas.length}</Text>
            <Text style={styles.resumenTexto}>Colmenas</Text>
          </View>
          <View style={styles.resumenItem}>
            <Text style={styles.numero}>{inspeccionesLocales.length}</Text>
            <Text style={styles.resumenTexto}>Inspecciones locales</Text>
          </View>
          <View style={styles.resumenItem}>
            <Text style={styles.numero}>{inspeccionesLocales.filter((item) => item.estado !== 'SINCRONIZADO').length}</Text>
            <Text style={styles.resumenTexto}>Pendientes</Text>
          </View>
        </View>

        {!!aviso && <View style={styles.aviso}><Text style={styles.avisoTexto}>{aviso}</Text></View>}
        {!!error && <View style={styles.errorCaja}><Text style={styles.errorTexto}>{error}</Text></View>}

        {(apiarioFiltro || idsFiltroDashboard) && (
          <View style={styles.filtroDashboard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.filtroDashboardTitulo}>Filtro aplicado desde Dashboard</Text>
              <Text style={styles.filtroDashboardTexto}>{idsFiltroDashboard ? `${idsFiltroDashboard.length} colmenas seleccionadas` : 'Colmenas del apiario seleccionado'}</Text>
            </View>
            <Pressable onPress={() => { setApiarioFiltro(''); setIdsFiltroDashboard(null); }} style={styles.quitarFiltro}>
              <Text style={styles.quitarFiltroTexto}>Quitar</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.filtrosListado}>
          <Text style={styles.labelSeccion}>Buscar por código</Text>
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
                <Text style={styles.selectorFiltroTexto} numberOfLines={1}>
                  {apiarioFiltro ? nombreApiario(Number(apiarioFiltro)) : 'Todos los apiarios'}
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
                <Text style={styles.selectorFiltroTexto} numberOfLines={1}>
                  {filtroEstado === 'TODAS'
                    ? 'Todos los estados'
                    : ESTADOS.find((item) => item.valor === filtroEstado)?.texto ?? 'Todos los estados'}
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
            <View style={[styles.checkboxCuadro, soloAtencion && styles.checkboxCuadroActivo]}>
              {soloAtencion && <Text style={styles.checkboxMarca}>✓</Text>}
            </View>
            <Text style={styles.checkboxTexto}>Solo las que requieren atención</Text>
          </Pressable>
        </View>

        <View style={styles.barraAcciones}>
          <Text style={styles.resultados}>{colmenasFiltradas.length} resultado(s)</Text>
          <Pressable onPress={() => void cargarDatos(true)} disabled={actualizando} style={styles.botonTexto}>
            <Text style={styles.botonTextoLabel}>{actualizando ? 'Actualizando…' : '⟳ Actualizar'}</Text>
          </Pressable>
        </View>

        {cargando ? (
          <ActivityIndicator size="large" color={COLORS.gold} style={{ marginTop: 28 }} />
        ) : colmenasFiltradas.length === 0 ? (
          <View style={styles.tarjetaVacia}>
            <Text style={styles.tarjetaTitulo}>No hay colmenas para mostrar</Text>
            <Text style={styles.textoSecundario}>Cambia los filtros o actualiza el catálogo. Los datos locales se conservan.</Text>
          </View>
        ) : (
          colmenasFiltradas.map((colmena) => {
            const ultimaLocal = inspeccionesLocales
              .filter((item) => item.codigo_qr.trim().toLowerCase() === colmena.codigo_qr.trim().toLowerCase())
              .sort((a, b) => b.fecha_local.localeCompare(a.fecha_local))[0];
            return (
              <Pressable key={colmena.id} style={styles.tarjetaColmena} onPress={() => setFichaId(colmena.id)}>
                <View style={styles.tarjetaColmenaTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.codigoConAlerta}>
                      <Text style={styles.codigoColmena}>{colmena.codigo}</Text>
                      {colmenasConAtencion.has(colmena.id) && (
                        <View style={styles.puntoAtencion} />
                      )}
                    </View>
                    <Text style={styles.apiarioTexto}>{nombreApiario(colmena.apiario_id)}</Text>
                  </View>
                  <View style={[styles.insigniaEstado, colmena.estado === 'ACTIVA' ? styles.estadoActiva : colmena.estado === 'EN_OBSERVACION' ? styles.estadoObservacion : styles.estadoInactiva]}>
                    <Text style={styles.insigniaEstadoTexto}>{estadoColmenaTexto(colmena.estado)}</Text>
                  </View>
                </View>
                <View style={styles.datosFila}>
                  <Text style={styles.datoPequeno}>Marcos: {colmena.cantidad_marcos}</Text>
                  <Text style={styles.datoPequeno}>Instalación: {formatearFecha(colmena.fecha_instalacion)}</Text>
                </View>
                <View style={styles.tarjetaColmenaBottom}>
                  <Text style={styles.fechaUltima}>Última inspección local: {ultimaLocal ? formatearFechaHora(ultimaLocal.fecha_local) : 'Sin registro local'}</Text>
                  <Text style={styles.verFicha}>Ver ficha ›</Text>
                </View>
              </Pressable>
            );
          })
        )}

        <View style={styles.accionesInferiores}>
          {esAdmin && <Pressable style={styles.botonPrincipal} onPress={abrirNueva}><Text style={styles.botonPrincipalTexto}>＋ Nueva colmena</Text></Pressable>}
          <Pressable style={styles.botonSecundario} onPress={onEscanear}><Text style={styles.botonSecundarioTexto}>Escanear código QR</Text></Pressable>
          <Pressable style={styles.botonSecundario} onPress={onVerInspecciones}><Text style={styles.botonSecundarioTexto}>Ver mis inspecciones</Text></Pressable>
        </View>
        <Text style={styles.pie}>La lista y el historial local se conservan en SQLite para consulta sin conexión. Las modificaciones administrativas requieren conexión con FastAPI.</Text>
      </ScrollView>

      {/* FICHA COMPLETA */}
      <Modal visible={Boolean(ficha)} transparent animationType="slide" onRequestClose={() => setFichaId(null)}>
        <View style={styles.fondoModal}>
          <View style={styles.modalFicha}>
            <View style={styles.modalEncabezado}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>{ficha ? `Colmena ${ficha.codigo}` : 'Ficha de colmena'}</Text>
                {ficha && <Text style={styles.modalSubtitulo}>{nombreApiario(ficha.apiario_id)}</Text>}
              </View>
              <Pressable onPress={() => setFichaId(null)} style={styles.cerrarModal}><Text style={styles.cerrarModalTexto}>✕</Text></Pressable>
            </View>

            {ficha && (
              <ScrollView contentContainerStyle={styles.contenidoFicha}>
                <View style={styles.fichaDatos}>
                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Estado</Text>
                    <Text style={styles.datoValor}>{estadoColmenaTexto(ficha.estado)}</Text>
                  </View>
                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Fecha de instalación</Text>
                    <Text style={styles.datoValor}>{formatearFecha(ficha.fecha_instalacion)}</Text>
                  </View>
                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Cantidad de marcos</Text>
                    <Text style={styles.datoValor}>{ficha.cantidad_marcos}</Text>
                  </View>
                  <View style={styles.datoFicha}>
                    <Text style={styles.datoEtiqueta}>Última inspección</Text>
                    <Text style={styles.datoValor}>{ultimaInspeccion ? `${formatearFechaHora(ultimaInspeccion.fecha)}${ultimaInspeccion.estado ? ` · ${estadoGeneralTexto(ultimaInspeccion.estado)}` : ''}` : 'Sin inspecciones'}</Text>
                  </View>
                  <View style={[styles.datoFicha, { width: '100%' }]}>
                    <Text style={styles.datoEtiqueta}>Observaciones</Text>
                    <Text style={styles.datoValor}>{ficha.observaciones?.trim() || 'Sin observaciones'}</Text>
                  </View>
                </View>

                <View style={styles.qrCaja}>
                  <Text style={styles.labelSeccion}>Código QR oficial</Text>
                  {conectado && sesion && tokenVigente(sesion) ? (
                    <Image
                      key={`${ficha.id}-${ficha.codigo_qr}`}
                      source={{ uri: `${API_BASE_URL}/colmenas/${ficha.id}/qr`, headers: { Authorization: `Bearer ${sesion.accessToken}` } }}
                      style={styles.imagenQr}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.qrSinConexion}><Text style={styles.qrIcono}>▦</Text><Text style={styles.textoSecundario}>Imagen QR disponible al conectarse al servidor</Text></View>
                  )}
                  <Text selectable style={styles.codigoQrTexto}>{ficha.codigo_qr}</Text>
                  {esAdmin && <Pressable style={styles.botonQr} onPress={abrirCambioQr}><Text style={styles.botonQrTexto}>Cambiar etiqueta QR</Text></Pressable>}
                </View>

                <View style={styles.historialEncabezado}>
                  <Text style={styles.tituloHistorial}>Historial</Text>
                  {historialCargando && <ActivityIndicator size="small" color={COLORS.goldText} />}
                </View>
                {!!historialError && <View style={styles.aviso}><Text style={styles.avisoTexto}>{historialError}</Text></View>}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filaChips}>
                  {filtrosEvento.map((item) => {
                    const etiqueta = `${item.texto} (${conteosEventos[item.valor] ?? 0})`;
                    return <Chip key={item.valor} texto={etiqueta} activo={filtroEvento === item.valor} onPress={() => setFiltroEvento(item.valor)} />;
                  })}
                </ScrollView>
                <View style={styles.fechasHistorial}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.datoEtiqueta}>Desde (AAAA-MM-DD)</Text>
                    <TextInput value={desde} onChangeText={setDesde} placeholder="2026-01-01" placeholderTextColor={COLORS.textMuted} style={styles.inputFecha} autoCapitalize="none" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.datoEtiqueta}>Hasta (AAAA-MM-DD)</Text>
                    <TextInput value={hasta} onChangeText={setHasta} placeholder="2026-12-31" placeholderTextColor={COLORS.textMuted} style={styles.inputFecha} autoCapitalize="none" />
                  </View>
                </View>
                {(desde || hasta || filtroEvento !== 'TODOS') && <Pressable onPress={() => { setDesde(''); setHasta(''); setFiltroEvento('TODOS'); }} style={styles.limpiarFiltros}><Text style={styles.limpiarFiltrosTexto}>Limpiar filtros</Text></Pressable>}

                {eventosVisibles.length === 0 ? (
                  <View style={styles.tarjetaVacia}><Text style={styles.textoSecundario}>{eventosHistorial.length === 0 ? 'Esta colmena todavía no tiene actividad registrada.' : 'No hay eventos que coincidan con estos filtros.'}</Text></View>
                ) : eventosVisibles.map((evento) => (
                  <View key={evento.key} style={styles.evento}>
                    <View style={styles.eventoPunto} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.eventoTituloFila}>
                        <Text style={styles.eventoTitulo}>{evento.titulo}</Text>
                        {!!evento.estado && <Text style={styles.eventoEstado}>{evento.estado}</Text>}
                      </View>
                      <Text style={styles.eventoFecha}>{formatearFechaHora(evento.fecha)}</Text>
                      {evento.lineas.map((linea, indice) => <Text key={`${evento.key}-${indice}`} style={styles.eventoLinea}>{linea}</Text>)}
                    </View>
                  </View>
                ))}

                <View style={styles.accionesFicha}>
                  <Pressable style={styles.botonPrincipal} onPress={() => inspeccionar(ficha)}><Text style={styles.botonPrincipalTexto}>Registrar inspección</Text></Pressable>
                  <Pressable style={styles.botonSecundario} onPress={irATratamientos}><Text style={styles.botonSecundarioTexto}>Ir a tratamientos</Text></Pressable>
                  {esAdmin && <Pressable style={styles.botonSecundario} onPress={() => abrirEdicion(ficha)}><Text style={styles.botonSecundarioTexto}>Editar colmena</Text></Pressable>}
                  {esAdmin && <Pressable style={styles.botonPeligro} onPress={() => confirmarBaja(ficha)}><Text style={styles.botonPeligroTexto}>Dar de baja</Text></Pressable>}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* FORMULARIO CREAR / EDITAR */}
      <Modal visible={formularioVisible} transparent animationType="fade" onRequestClose={() => { if (!guardando) { setFormularioVisible(false); } }}>
        <View style={styles.fondoModal}>
          <View style={styles.modalFormulario}>
            <View style={styles.modalEncabezado}>
              <Text style={styles.modalTitulo}>{editando ? `Editar ${editando.codigo}` : 'Nueva colmena'}</Text>
              <Pressable onPress={() => !guardando && setFormularioVisible(false)} style={styles.cerrarModal}><Text style={styles.cerrarModalTexto}>✕</Text></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContenido}>
              <Text style={styles.datoEtiqueta}>Apiario *</Text>
              <Pressable style={styles.selectorApiario} onPress={() => setApiarioPickerVisible(true)}>
                <Text style={styles.datoValor}>{apiarios.find((item) => String(item.id) === formulario.apiario_id)?.nombre ?? 'Seleccionar apiario'}</Text>
                <Text style={styles.selectorFlecha}>⌄</Text>
              </Pressable>

              <Text style={styles.datoEtiqueta}>Código *</Text>
              <TextInput value={formulario.codigo} onChangeText={(valor) => setFormulario((actual) => ({ ...actual, codigo: valor }))} style={styles.input} placeholder="Ej. COL-004" placeholderTextColor={COLORS.textMuted} autoCapitalize="characters" maxLength={50} />

              <Text style={styles.datoEtiqueta}>Estado</Text>
              <View style={styles.filaChipsWrap}>
                {ESTADOS.map((item) => <Chip key={item.valor} texto={item.texto} activo={formulario.estado === item.valor} onPress={() => setFormulario((actual) => ({ ...actual, estado: item.valor }))} />)}
              </View>

              <Text style={styles.datoEtiqueta}>Fecha de instalación (AAAA-MM-DD)</Text>
              <TextInput value={formulario.fecha_instalacion} onChangeText={(valor) => setFormulario((actual) => ({ ...actual, fecha_instalacion: valor }))} style={styles.input} placeholder="2026-11-20" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" />

              <Text style={styles.datoEtiqueta}>Cantidad de marcos</Text>
              <TextInput value={formulario.cantidad_marcos} onChangeText={(valor) => setFormulario((actual) => ({ ...actual, cantidad_marcos: valor.replace(/[^0-9]/g, '') }))} style={styles.input} keyboardType="number-pad" placeholder="0" placeholderTextColor={COLORS.textMuted} />

              <Text style={styles.datoEtiqueta}>Observaciones</Text>
              <TextInput value={formulario.observaciones} onChangeText={(valor) => setFormulario((actual) => ({ ...actual, observaciones: valor }))} style={[styles.input, styles.inputMultilinea]} multiline textAlignVertical="top" placeholder="Observaciones de la colmena" placeholderTextColor={COLORS.textMuted} maxLength={2000} />

              <View style={styles.filaBotones}>
                <Pressable style={styles.botonSecundarioFlex} onPress={() => setFormularioVisible(false)} disabled={guardando}><Text style={styles.botonSecundarioTexto}>Cancelar</Text></Pressable>
                <Pressable style={styles.botonPrincipalFlex} onPress={() => void guardarFormulario()} disabled={guardando}>
                  {guardando ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.botonPrincipalTexto}>{editando ? 'Guardar cambios' : 'Registrar colmena'}</Text>}
                </Pressable>
              </View>
            </ScrollView>
          </View>
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

      {/* CAMBIAR ETIQUETA QR */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => { if (!guardandoQr) { setQrVisible(false); } }}>
        <View style={styles.fondoModal}>
          <View style={styles.modalPicker}>
            <Text style={styles.modalTitulo}>Cambiar etiqueta QR</Text>
            <Text style={styles.textoSecundario}>Ingresa un UUID de una etiqueta disponible. Si dejas el campo vacío, el servidor generará un código nuevo.</Text>
            <TextInput value={qrNuevo} onChangeText={setQrNuevo} style={styles.input} placeholder="UUID nuevo (opcional)" placeholderTextColor={COLORS.textMuted} autoCapitalize="none" autoCorrect={false} />
            <View style={styles.filaBotones}>
              <Pressable style={styles.botonSecundarioFlex} onPress={() => setQrVisible(false)} disabled={guardandoQr}><Text style={styles.botonSecundarioTexto}>Cancelar</Text></Pressable>
              <Pressable style={styles.botonPrincipalFlex} onPress={() => void guardarCambioQr()} disabled={guardandoQr}>
                {guardandoQr ? <ActivityIndicator color={COLORS.surface} /> : <Text style={styles.botonPrincipalTexto}>Guardar QR</Text>}
              </Pressable>
            </View>
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
  contenido: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 38 },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 18 },
  encabezadoTexto: { flex: 1, minWidth: 190, marginRight: 10 },
  titulo: { color: COLORS.forest, fontSize: 28, fontWeight: '900' },
  subtitulo: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
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
  tarjetaColmena: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 15, marginBottom: 10 },
  tarjetaColmenaTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  codigoConAlerta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  codigoColmena: { color: COLORS.forest, fontSize: 18, fontWeight: '900' },
  puntoAtencion: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B', marginLeft: 7 },
  apiarioTexto: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  insigniaEstado: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8 },
  estadoActiva: { backgroundColor: COLORS.successBg, borderColor: '#B7DCC3' },
  estadoObservacion: { backgroundColor: COLORS.warningBg, borderColor: '#F3D49C' },
  estadoInactiva: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  insigniaEstadoTexto: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '800' },
  datosFila: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  datoPequeno: { color: COLORS.textSecondary, fontSize: 11 },
  tarjetaColmenaBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 12, paddingTop: 10 },
  fechaUltima: { color: COLORS.textMuted, fontSize: 10, flex: 1 },
  verFicha: { color: COLORS.goldText, fontSize: 12, fontWeight: '900', marginLeft: 8 },
  accionesInferiores: { marginTop: 8 },
  botonPrincipal: { backgroundColor: COLORS.gold, borderRadius: 11, paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center', marginTop: 9 },
  botonPrincipalTexto: { color: COLORS.forestDeep, fontWeight: '900', fontSize: 13 },
  botonSecundario: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.goldBorder, borderRadius: 11, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', marginTop: 9 },
  botonSecundarioTexto: { color: COLORS.goldText, fontWeight: '800', fontSize: 13 },
  botonPeligro: { backgroundColor: COLORS.dangerBg, borderWidth: 1, borderColor: '#F2B8B5', borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginTop: 9 },
  botonPeligroTexto: { color: COLORS.danger, fontWeight: '900', fontSize: 13 },
  pie: { color: COLORS.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 18 },
  tarjetaVacia: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 16, marginTop: 8 },
  tarjetaTitulo: { color: COLORS.forest, fontWeight: '900', fontSize: 14, marginBottom: 5 },
  textoSecundario: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  fondoModal: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', padding: 12 },
  modalFicha: { backgroundColor: COLORS.backgroundSoft, borderRadius: 18, maxHeight: '94%', overflow: 'hidden' },
  modalFormulario: { backgroundColor: COLORS.backgroundSoft, borderRadius: 18, maxHeight: '90%', overflow: 'hidden' },
  modalPicker: { backgroundColor: COLORS.backgroundSoft, borderRadius: 16, maxHeight: '75%', padding: 18 },
  modalEncabezado: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  modalTitulo: { color: COLORS.forest, fontSize: 19, fontWeight: '900' },
  modalSubtitulo: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  cerrarModal: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.backgroundSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  cerrarModalTexto: { color: COLORS.forest, fontSize: 16, fontWeight: '900' },
  contenidoFicha: { padding: 16, paddingBottom: 26 },
  fichaDatos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  datoFicha: { width: '47%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 11, padding: 12 },
  datoEtiqueta: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', marginBottom: 5 },
  datoValor: { color: COLORS.text, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  qrCaja: { alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 13, padding: 13, marginTop: 14 },
  imagenQr: { width: 150, height: 150, backgroundColor: '#FFFFFF', marginVertical: 6 },
  qrSinConexion: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginVertical: 6, padding: 10 },
  qrIcono: { color: COLORS.forest, fontSize: 54, marginBottom: 6 },
  codigoQrTexto: { color: COLORS.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 4 },
  botonQr: { paddingVertical: 9, paddingHorizontal: 12, marginTop: 7 },
  botonQrTexto: { color: COLORS.goldText, fontSize: 12, fontWeight: '900' },
  historialEncabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 },
  tituloHistorial: { color: COLORS.forest, fontSize: 18, fontWeight: '900' },
  fechasHistorial: { flexDirection: 'row', gap: 9, marginTop: 12 },
  inputFecha: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 10, color: COLORS.text, fontSize: 11, marginTop: 5 },
  limpiarFiltros: { alignSelf: 'flex-start', paddingVertical: 8 },
  limpiarFiltrosTexto: { color: COLORS.goldText, fontWeight: '800', fontSize: 11 },
  evento: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  eventoPunto: { width: 11, height: 11, borderRadius: 6, backgroundColor: COLORS.gold, marginTop: 4 },
  eventoTituloFila: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  eventoTitulo: { color: COLORS.forest, fontWeight: '900', fontSize: 13, flexShrink: 1 },
  eventoEstado: { color: COLORS.goldText, backgroundColor: COLORS.goldSoft, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontWeight: '800' },
  eventoFecha: { color: COLORS.textMuted, fontSize: 10, marginTop: 4 },
  eventoLinea: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 3 },
  accionesFicha: { marginTop: 16 },
  formContenido: { padding: 17, paddingBottom: 22 },
  selectorApiario: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 13, marginBottom: 12 },
  selectorFlecha: { color: COLORS.goldText, fontSize: 18, fontWeight: '900' },
  inputMultilinea: { minHeight: 90, textAlignVertical: 'top' },
  filaBotones: { flexDirection: 'row', gap: 9, marginTop: 12 },
  botonSecundarioFlex: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  botonPrincipalFlex: { flex: 1, backgroundColor: COLORS.gold, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  opcionApiario: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
});
