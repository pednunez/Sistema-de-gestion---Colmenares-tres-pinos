import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS } from './theme';
import { leerSesionGuardada, tokenVigente } from './api/auth';
import type { SesionMovil } from './api/auth';
import { listarTransferencias } from './api/transferencias';
import type { TransferenciaMarco } from './api/transferencias';
import { listarColmenas } from './api/colmenas';
import { listarApiarios } from './api/apiarios';
import { solicitarAPI } from './api/cliente';
import { leerCatalogoLocal } from './database/catalogo';
import {
  listarInspeccionesDashboardLocales,
  listarTransferenciasPreparadas,
} from './database/inspeccionesAvanzadas';

type Props = {
  // Conservamos esta prop porque App.tsx ya la envía.
  // La web registra las transferencias durante la inspección, no desde esta lista.
  onEscanear: () => void;
};

type TransferenciaLocal = Awaited<ReturnType<typeof listarTransferenciasPreparadas>>[number];
type InspeccionLocal = Awaited<ReturnType<typeof listarInspeccionesDashboardLocales>>[number];

type RefColmena = {
  id: number;
  apiario_id: number;
  codigo: string;
  codigo_qr: string;
};

type RefApiario = { id: number; nombre: string };
type RefUsuario = { id: number; nombre: string };

type CacheTransferencias = {
  transferencias: TransferenciaMarco[];
  colmenas: RefColmena[];
  apiarios: RefApiario[];
  usuarios: RefUsuario[];
};

type OrigenDestino = {
  codigo: string;
  apiarioId: number | null;
  apiarioNombre: string;
};

type TarjetaTransferencia = {
  id: string;
  origen: OrigenDestino;
  destino: OrigenDestino;
  cantidad: number;
  tipo: string;
  fecha: string | null;
  autor: string;
  observaciones: string | null;
  pendiente: boolean;
};

const SIN_CACHE: CacheTransferencias = {
  transferencias: [],
  colmenas: [],
  apiarios: [],
  usuarios: [],
};

let dbCache: Promise<SQLite.SQLiteDatabase> | null = null;

async function conectarCache(): Promise<SQLite.SQLiteDatabase> {
  if (!dbCache) {
    dbCache = (async () => {
      const db = await SQLite.openDatabaseAsync('colmenas.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS transferencias_historial_movil (
          usuario_id INTEGER PRIMARY KEY,
          contenido TEXT NOT NULL,
          actualizado_en TEXT NOT NULL
        );
      `);
      return db;
    })().catch((error) => {
      dbCache = null;
      throw error;
    });
  }
  return dbCache;
}

async function leerCache(usuarioId: number): Promise<CacheTransferencias> {
  const db = await conectarCache();
  const fila = await db.getFirstAsync<{ contenido: string }>(
    'SELECT contenido FROM transferencias_historial_movil WHERE usuario_id = ?',
    [usuarioId]
  );
  if (!fila) return { ...SIN_CACHE };
  try {
    const datos = JSON.parse(fila.contenido) as Partial<CacheTransferencias>;
    return {
      transferencias: Array.isArray(datos.transferencias) ? datos.transferencias : [],
      colmenas: Array.isArray(datos.colmenas) ? datos.colmenas : [],
      apiarios: Array.isArray(datos.apiarios) ? datos.apiarios : [],
      usuarios: Array.isArray(datos.usuarios) ? datos.usuarios : [],
    };
  } catch {
    return { ...SIN_CACHE };
  }
}

async function guardarCache(usuarioId: number, datos: CacheTransferencias): Promise<void> {
  const db = await conectarCache();
  await db.runAsync(
    `INSERT INTO transferencias_historial_movil (usuario_id, contenido, actualizado_en)
     VALUES (?, ?, ?)
     ON CONFLICT(usuario_id) DO UPDATE SET
       contenido = excluded.contenido,
       actualizado_en = excluded.actualizado_en`,
    [usuarioId, JSON.stringify(datos), new Date().toISOString()]
  );
}

function unirPorId<T extends { id: number }>(...listas: T[][]): T[] {
  const mapa = new Map<number, T>();
  for (const lista of listas) {
    for (const item of lista) {
      if (item && Number.isFinite(item.id)) mapa.set(item.id, item);
    }
  }
  return [...mapa.values()];
}

function tipoDeMarco(tipo?: string | null, contenido?: string | null): string {
  const textos: Record<string, string> = {
    CRIA: 'cría',
    MIEL: 'miel',
    POLEN: 'polen',
    VACIO: 'vacío',
    OTRO: 'otro',
    MIEL_Y_CRIA: 'miel y cría',
    SOLO_CRIA: 'cría',
    SOLO_MIEL: 'miel',
    CERA_ESTIRADA: 'cera estirada',
    CERA_ESTAMPADA: 'cera estampada',
    CERA_UNTADA: 'cera untada',
  };
  const clave = tipo || contenido;
  return clave ? textos[clave] ?? clave.toLowerCase().replace(/_/g, ' ') : 'tipo sin indicar';
}

function fechaLegible(valor: string | null): string {
  if (!valor) return 'Fecha pendiente';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00:00`)
    : new Date(valor);
  if (!Number.isFinite(fecha.getTime())) return 'Fecha no disponible';
  return fecha.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fechaOrden(valor: string | null): number {
  const numero = valor ? new Date(valor).getTime() : 0;
  return Number.isFinite(numero) ? numero : 0;
}

export default function TransferenciasLocales({ onEscanear: _onEscanear }: Props) {
  const [sesion, setSesion] = useState<SesionMovil | null>(null);
  const [remotas, setRemotas] = useState<TransferenciaMarco[]>([]);
  const [locales, setLocales] = useState<TransferenciaLocal[]>([]);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<InspeccionLocal[]>([]);
  const [colmenas, setColmenas] = useState<RefColmena[]>([]);
  const [apiarios, setApiarios] = useState<RefApiario[]>([]);
  const [usuarios, setUsuarios] = useState<RefUsuario[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [apiarioElegido, setApiarioElegido] = useState('');
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [online, setOnline] = useState(false);
  const [colmenasActualizadas, setColmenasActualizadas] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async (manual = false) => {
    if (manual) setActualizando(true);
    else setCargando(true);
    setMensaje('');

    try {
      const usuario = await leerSesionGuardada();
      setSesion(usuario);
      setOnline(false);
      setColmenasActualizadas(false);

      if (!usuario) {
        setRemotas([]);
        setLocales([]);
        setInspeccionesLocales([]);
        setColmenas([]);
        setApiarios([]);
        setUsuarios([]);
        setMensaje('Inicia sesión para consultar las transferencias de las colmenas.');
        return;
      }

      // El historial remoto queda guardado por usuario para consultar sin conexión.
      const [cache, catalogo] = await Promise.all([
        leerCache(usuario.usuario.id).catch(() => ({ ...SIN_CACHE })),
        leerCatalogoLocal(usuario.usuario.id).catch(() => null),
      ]);
      const colmenasCatalogo: RefColmena[] = (catalogo?.colmenas ?? []).map((item) => ({
        id: item.id,
        apiario_id: item.apiario_id,
        codigo: item.codigo,
        codigo_qr: item.codigo_qr,
      }));
      const apiariosCatalogo: RefApiario[] = (catalogo?.apiarios ?? []).map((item) => ({
        id: item.id,
        nombre: item.nombre,
      }));
      const nombresLocales: RefUsuario[] = [{ id: usuario.usuario.id, nombre: usuario.usuario.nombre }];
      let vista: CacheTransferencias = {
        transferencias: cache.transferencias,
        colmenas: unirPorId(cache.colmenas, colmenasCatalogo),
        apiarios: unirPorId(cache.apiarios, apiariosCatalogo),
        usuarios: unirPorId(cache.usuarios, nombresLocales),
      };

      setRemotas(vista.transferencias);
      setColmenas(vista.colmenas);
      setApiarios(vista.apiarios);
      setUsuarios(vista.usuarios);

      // Inspecciones y movimientos pendientes del dispositivo actual.
      // Nunca mezclamos datos locales atribuidos explícitamente a otro usuario.
      try {
        const inspecciones = await listarInspeccionesDashboardLocales();
        const propias = inspecciones.filter((item) =>
          item.usuario_id == null || item.usuario_id === usuario.usuario.id
        );
        const ids = new Set(propias.map((item) => item.id));
        const transferencias = await listarTransferenciasPreparadas();
        setInspeccionesLocales(propias);
        setLocales(transferencias.filter((item) =>
          ids.has(item.inspeccion_local_id) && item.estado.toUpperCase() !== 'SINCRONIZADO'
        ));
      } catch (errorLocal) {
        console.warn('No se pudo cargar el historial local de transferencias:', errorLocal);
        setInspeccionesLocales([]);
        setLocales([]);
      }

      if (!tokenVigente(usuario)) {
        setMensaje('Sesión vencida o sin conexión. Se muestran los movimientos que están guardados en este teléfono.');
        return;
      }

      // El endpoint de usuarios sólo está disponible para ADMIN.
      // El resto del historial no depende de ese permiso.
      const [respuestaTransferencias, respuestaColmenas, respuestaApiarios, respuestaUsuarios] = await Promise.allSettled([
        listarTransferencias(usuario),
        listarColmenas(usuario.accessToken, { orden: 'codigo' }),
        listarApiarios(usuario.accessToken),
        usuario.usuario.rol === 'ADMIN'
          ? solicitarAPI<RefUsuario[]>('/usuarios/', { method: 'GET', token: usuario.accessToken })
          : Promise.resolve(nombresLocales),
      ]);

      if (respuestaTransferencias.status === 'fulfilled') {
        vista = { ...vista, transferencias: respuestaTransferencias.value };
        setOnline(true);
      } else {
        setMensaje('No fue posible actualizar las transferencias. Se muestra la última copia guardada y los movimientos locales.');
      }
      if (respuestaColmenas.status === 'fulfilled') {
        setColmenasActualizadas(true);
        const referencias = respuestaColmenas.value.map((item) => ({
          id: item.id,
          codigo: item.codigo,
          codigo_qr: item.codigo_qr,
          apiario_id: item.apiario_id,
        }));
        // Conservar referencias anteriores para mostrar colmenas ya dadas de baja.
        vista = { ...vista, colmenas: unirPorId(vista.colmenas, referencias) };
      }
      if (respuestaApiarios.status === 'fulfilled') {
        vista = { ...vista, apiarios: unirPorId(vista.apiarios, respuestaApiarios.value.map((item) => ({
          id: item.id, nombre: item.nombre,
        }))) };
      }
      if (respuestaUsuarios.status === 'fulfilled') {
        vista = { ...vista, usuarios: unirPorId(vista.usuarios, respuestaUsuarios.value.map((item) => ({
          id: item.id, nombre: item.nombre,
        }))) };
      }

      setRemotas(vista.transferencias);
      setColmenas(vista.colmenas);
      setApiarios(vista.apiarios);
      setUsuarios(vista.usuarios);

      if (
        respuestaTransferencias.status === 'fulfilled' ||
        respuestaColmenas.status === 'fulfilled' ||
        respuestaApiarios.status === 'fulfilled'
      ) {
        await guardarCache(usuario.usuario.id, vista).catch((errorCache) => {
          console.warn('No se pudo guardar la copia del historial:', errorCache);
        });
      }
    } catch (error) {
      console.warn('Error abriendo el historial de transferencias:', error);
      setMensaje('No se pudieron cargar los movimientos. Revisa la sesión y la conexión con FastAPI.');
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const apiariosOrdenados = useMemo(
    () => [...apiarios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [apiarios]
  );

  const tarjetas = useMemo<TarjetaTransferencia[]>(() => {
    const colmenasPorId = new Map(colmenas.map((item) => [item.id, item]));
    const colmenasPorCodigo = new Map<string, RefColmena>();
    for (const item of colmenas) {
      colmenasPorCodigo.set(item.codigo_qr.toLowerCase(), item);
      colmenasPorCodigo.set(item.codigo.toLowerCase(), item);
    }
    const apiariosPorId = new Map(apiarios.map((item) => [item.id, item.nombre]));
    const usuariosPorId = new Map(usuarios.map((item) => [item.id, item.nombre]));

    const resolver = (valor: number | string): OrigenDestino => {
      const esNumero = typeof valor === 'number';
      const colmena = esNumero
        ? colmenasPorId.get(valor)
        : colmenasPorCodigo.get(valor.trim().toLowerCase());
      if (colmena) {
        return {
          codigo: colmena.codigo,
          apiarioId: colmena.apiario_id,
          apiarioNombre: apiariosPorId.get(colmena.apiario_id) ?? `Apiario #${colmena.apiario_id}`,
        };
      }
      if (esNumero) {
        return {
          codigo: colmenasActualizadas ? `Colmena dada de baja (#${valor})` : `Colmena #${valor}`,
          apiarioId: null,
          apiarioNombre: colmenasActualizadas ? 'Apiario dado de baja' : 'Apiario no disponible',
        };
      }
      if (valor.trim().toUpperCase() === 'BODEGA') {
        return { codigo: 'Bodega', apiarioId: null, apiarioNombre: 'Destino de marcos' };
      }
      return {
        codigo: valor.length > 20 ? `QR ${valor.slice(0, 8)}…` : valor,
        apiarioId: null,
        apiarioNombre: 'Apiario no identificado',
      };
    };

    const fechasLocales = new Map(inspeccionesLocales.map((item) => [item.id, item.fecha_local]));
    const autorLocal = sesion?.usuario.nombre ?? 'Usuario local';
    const delServidor: TarjetaTransferencia[] = remotas.map((item) => ({
      id: `servidor-${item.id}`,
      origen: resolver(item.colmena_origen_id),
      destino: resolver(item.colmena_destino_id),
      cantidad: item.cantidad_marcos,
      tipo: tipoDeMarco(item.tipo_marco, item.contenido),
      fecha: item.fecha_transferencia ?? item.fecha_creacion ?? null,
      autor: usuariosPorId.get(item.usuario_id) ?? `Usuario #${item.usuario_id}`,
      observaciones: item.observaciones,
      pendiente: false,
    }));

    const delTelefono: TarjetaTransferencia[] = locales.map((item, index) => ({
      id: `local-${item.inspeccion_local_id}-${item.ubicacion}-${item.numero}-${index}`,
      origen: resolver(item.origen),
      destino: resolver(item.destino),
      cantidad: 1,
      tipo: tipoDeMarco(null, item.contenido),
      fecha: fechasLocales.get(item.inspeccion_local_id) ?? null,
      autor: autorLocal,
      observaciones: null,
      pendiente: true,
    }));

    return [...delServidor, ...delTelefono].sort((a, b) => fechaOrden(b.fecha) - fechaOrden(a.fecha));
  }, [colmenas, apiarios, usuarios, inspeccionesLocales, sesion, remotas, locales, colmenasActualizadas]);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return tarjetas.filter((item) => {
      if (apiarioElegido &&
        String(item.origen.apiarioId ?? '') !== apiarioElegido &&
        String(item.destino.apiarioId ?? '') !== apiarioElegido
      ) return false;
      if (!termino) return true;
      return item.origen.codigo.toLocaleLowerCase('es').includes(termino) ||
        item.destino.codigo.toLocaleLowerCase('es').includes(termino);
    });
  }, [tarjetas, apiarioElegido, busqueda]);

  const nombreElegido = apiarios.find((a) => String(a.id) === apiarioElegido)?.nombre;
  const salidas = filtradas.filter((item) => String(item.origen.apiarioId) === apiarioElegido).length;
  const llegadas = filtradas.filter((item) => String(item.destino.apiarioId) === apiarioElegido).length;

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={actualizando} onRefresh={() => void cargar(true)} tintColor={COLORS.forestMid} />
      }
    >
      <Text style={styles.titulo}>Transferencias</Text>
      <Text style={styles.descripcion}>
        Historial de marcos movidos entre colmenas. Las transferencias se registran durante la inspección.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.filaApiarios}
      >
        <Text style={styles.ver}>Ver:</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: apiarioElegido === '' }}
          onPress={() => setApiarioElegido('')}
          style={[styles.chip, apiarioElegido === '' && styles.chipActivo]}
        >
          <Text style={[styles.chipTexto, apiarioElegido === '' && styles.chipTextoActivo]}>Todos los apiarios</Text>
        </Pressable>
        {apiariosOrdenados.map((apiario) => {
          const elegido = apiarioElegido === String(apiario.id);
          return (
            <Pressable
              key={apiario.id}
              accessibilityRole="button"
              accessibilityState={{ selected: elegido }}
              onPress={() => setApiarioElegido(String(apiario.id))}
              style={[styles.chip, elegido && styles.chipActivo]}
            >
              <Text style={[styles.chipTexto, elegido && styles.chipTextoActivo]}>{apiario.nombre}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {nombreElegido ? (
        <Text style={styles.resumenApiario}>
          {nombreElegido}: {filtradas.length} {filtradas.length === 1 ? 'transferencia' : 'transferencias'} · {salidas} {salidas === 1 ? 'salida' : 'salidas'} · {llegadas} {llegadas === 1 ? 'llegada' : 'llegadas'}
        </Text>
      ) : null}

      <View style={styles.filtros}>
        <TextInput
          style={styles.buscador}
          placeholder="Buscar por código de colmena"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Buscar por código de colmena"
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar transferencias"
          onPress={() => void cargar(true)}
          disabled={actualizando}
          style={styles.actualizar}
        >
          <Text style={styles.actualizarTexto}>{actualizando ? '…' : '⟳'}</Text>
        </Pressable>
      </View>

      {mensaje ? (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>{mensaje}</Text>
        </View>
      ) : !online && !cargando && sesion ? (
        <Text style={styles.avisoPequeno}>Consulta local. Desliza hacia abajo para intentar actualizar.</Text>
      ) : null}

      {cargando && tarjetas.length === 0 ? (
        <View style={styles.cargando}>
          <ActivityIndicator color={COLORS.forestMid} size="large" />
          <Text style={styles.cargandoTexto}>Cargando transferencias...</Text>
        </View>
      ) : filtradas.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioIcono}>⇄</Text>
          <Text style={styles.vacioTitulo}>No hay transferencias para mostrar</Text>
          <Text style={styles.vacioTexto}>
            {tarjetas.length === 0
              ? 'Aparecerán aquí cuando marques un marco con «Transferir» al registrar una inspección.'
              : nombreElegido
                ? 'Este apiario no tiene transferencias con estos filtros.'
                : 'Prueba con otro código de colmena.'}
          </Text>
        </View>
      ) : (
        <View style={styles.lista}>
          {filtradas.map((item) => (
            <View key={item.id} style={styles.tarjeta}>
              <View style={styles.ruta}>
                <View style={styles.columnaOrigen}>
                  <Text style={styles.rotulo}>Salió de</Text>
                  <Text style={styles.nombreColmena}>{item.origen.codigo}</Text>
                  <Text style={styles.nombreApiario}>{item.origen.apiarioNombre}</Text>
                </View>
                <Text style={styles.flecha}>→</Text>
                <View style={styles.columnaDestino}>
                  <Text style={styles.rotulo}>Llegó a</Text>
                  <Text style={styles.nombreColmena}>{item.destino.codigo}</Text>
                  <Text style={styles.nombreApiario}>{item.destino.apiarioNombre}</Text>
                </View>
              </View>
              <View style={styles.detalleFila}>
                <View style={styles.insignia}>
                  <Text style={styles.insigniaTexto}>
                    {item.cantidad} {item.cantidad === 1 ? 'marco' : 'marcos'} de {item.tipo}
                  </Text>
                </View>
                <Text style={styles.fecha}>{fechaLegible(item.fecha)} · {item.autor}</Text>
              </View>
              {item.pendiente && (
                <Text style={styles.pendiente}>Pendiente de sincronización · Guardada en este teléfono</Text>
              )}
              {!!item.observaciones?.trim() && (
                <Text style={styles.observaciones}>{item.observaciones.trim()}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.background },
  contenido: { paddingHorizontal: 16, paddingTop: 23, paddingBottom: 36 },
  titulo: { fontSize: 25, fontWeight: '900', color: COLORS.forestDeep },
  descripcion: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 20 },
  filaApiarios: { alignItems: 'center', gap: 8, paddingRight: 14, paddingBottom: 4 },
  ver: { color: COLORS.text, fontSize: 12, marginRight: 2 },
  chip: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 22, paddingHorizontal: 13, paddingVertical: 9 },
  chipActivo: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipTexto: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTextoActivo: { color: COLORS.forestDeep, fontWeight: '800' },
  resumenApiario: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12 },
  filtros: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, marginBottom: 15 },
  buscador: { backgroundColor: COLORS.surface, borderColor: COLORS.borderStrong, borderWidth: 1, borderRadius: 11, flex: 1, paddingHorizontal: 13, minHeight: 45, color: COLORS.text, fontSize: 13 },
  actualizar: { width: 44, height: 44, backgroundColor: COLORS.surface, borderColor: COLORS.borderStrong, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actualizarTexto: { color: COLORS.forestDeep, fontSize: 21, fontWeight: '700' },
  aviso: { backgroundColor: COLORS.warningBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.goldBorder, padding: 12, marginBottom: 12 },
  avisoTexto: { fontSize: 12, color: COLORS.goldText, lineHeight: 18 },
  avisoPequeno: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 9 },
  cargando: { padding: 25, alignItems: 'center' },
  cargandoTexto: { color: COLORS.textSecondary, fontSize: 12, marginTop: 12 },
  vacio: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 14, padding: 25, alignItems: 'center' },
  vacioIcono: { color: COLORS.goldText, fontSize: 32 },
  vacioTitulo: { color: COLORS.forestDeep, fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: 9 },
  vacioTexto: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  lista: { gap: 11 },
  tarjeta: { backgroundColor: COLORS.surface, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, padding: 15 },
  ruta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  columnaOrigen: { flex: 1, minWidth: 0 },
  columnaDestino: { flex: 1, minWidth: 0 },
  rotulo: { color: COLORS.textMuted, fontSize: 10, marginBottom: 4 },
  nombreColmena: { color: COLORS.forestDeep, fontSize: 14, fontWeight: '900', lineHeight: 19 },
  nombreApiario: { color: COLORS.textSecondary, fontSize: 10, marginTop: 2, lineHeight: 15 },
  flecha: { color: COLORS.goldText, fontSize: 22, marginTop: 4, fontWeight: '800' },
  detalleFila: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  insignia: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldBorder, borderWidth: 1, borderRadius: 15, paddingHorizontal: 9, paddingVertical: 4 },
  insigniaTexto: { color: COLORS.goldText, fontSize: 10, fontWeight: '800' },
  fecha: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16, flexShrink: 1 },
  pendiente: { color: COLORS.goldText, fontSize: 10, marginTop: 9, fontWeight: '700' },
  observaciones: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12 },
});
