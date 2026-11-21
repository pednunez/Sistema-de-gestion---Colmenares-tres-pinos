import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { COLORS } from './theme';
import { SelectorLista, InsigniaMovil } from './ComponentesMoviles';

import { leerSesionGuardada, tokenVigente } from './api/auth';
import type { SesionMovil } from './api/auth';
import {
  listarTratamientos,
  actualizarTratamiento,
  cancelarTratamiento,
} from './api/tratamientos';
import type { TratamientoApi, TratamientoUpdateApi } from './api/tratamientos';
import { listarUsuarios } from './api/usuarios';
import type { UsuarioAPI } from './api/usuarios';

import { descargarCatalogo, leerCatalogoLocal } from './database/catalogo';
import type { CatalogoMovil, ColmenaCatalogo } from './database/catalogo';
import { listarInspeccionesLocales } from './database/inspecciones';
import type { InspeccionGuardada } from './database/inspecciones';
import {
  actualizarTratamientoLocal,
  cambiarEstadoTratamientoLocal,
  fechaLocalISO,
  guardarTratamientoLocal,
  listarTratamientosLocales,
} from './database/tratamientos';
import type {
  DatosTratamiento,
  EstadoTratamiento,
  TratamientoGuardado,
} from './database/tratamientos';
import { sincronizarTratamientosPendientes } from './sincronizacion/tratamientos';

// ==========================================
// TIPOS
// ==========================================

type Props = {
  onVolver: () => void;
  colmenaIdInicial?: number;
};

type TratamientoVista = {
  key: string;
  id: number;
  serverId: number | null;
  localId: number | null;
  idCliente: string | null;
  colmenaId: number | null;
  codigo: string;
  inspeccionId: number | null;
  usuarioId: number | null;
  usuarioNombre: string;
  tipo: string;
  producto: string;
  dosis: string;
  motivo: string;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoTratamiento;
  observaciones: string;
  pendiente: boolean;
  server?: TratamientoApi;
  local?: TratamientoGuardado;
};

type FormularioTratamiento = {
  registro: TratamientoVista | null;
  colmenaId: string;
  inspeccionLocalId: string;
  tipo: string;
  producto: string;
  dosis: string;
  fechaInicio: string;
  fechaFin: string;
  estado: EstadoTratamiento;
  motivo: string;
  observaciones: string;
};

type CampoFecha = 'inicio' | 'termino' | null;

const ESTADOS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'PLANIFICADO', label: 'Planificado' },
  { value: 'EN_CURSO', label: 'En curso' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const ESTADOS_FORM: { value: string; label: string }[] = [
  { value: 'PLANIFICADO', label: 'Planificado' },
  { value: 'EN_CURSO', label: 'En curso' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

// ==========================================
// FORMATO Y AUXILIARES
// ==========================================

function fechaEtiqueta(valor?: string | null): string {
  if (!valor) return 'Sin definir';
  const partes = valor.slice(0, 10).split('-');
  if (partes.length !== 3) return valor;
  return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

function fechaDate(valor?: string | null): Date {
  if (valor && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    return new Date(anio, mes - 1, dia, 12, 0, 0);
  }
  return new Date();
}

function usuarioNombre(
  id: number | null,
  sesion: SesionMovil | null,
  usuarios: UsuarioAPI[]
): string {
  if (id === null) return 'Usuario local';
  if (sesion?.usuario.id === id) return sesion.usuario.nombre;
  const usuario = usuarios.find(item => item.id === id);
  return usuario
    ? `${usuario.nombre}${usuario.apellido ? ` ${usuario.apellido}` : ''}`
    : `Usuario #${id}`;
}

function tonoTratamiento(estado: EstadoTratamiento): 'verde' | 'ambar' | 'rojo' | 'neutral' {
  if (estado === 'FINALIZADO') return 'verde';
  if (estado === 'EN_CURSO') return 'ambar';
  if (estado === 'CANCELADO') return 'rojo';
  return 'neutral';
}

function etiquetaTratamiento(estado: EstadoTratamiento): string {
  const nombres: Record<EstadoTratamiento, string> = {
    PLANIFICADO: 'Planificado',
    EN_CURSO: 'En curso',
    FINALIZADO: 'Finalizado',
    CANCELADO: 'Cancelado',
  };
  return nombres[estado];
}

function textoNulo(valor: string | null | undefined): string {
  return valor?.trim() ? valor : 'Sin registrar';
}

// ==========================================
// PANTALLA PRINCIPAL
// ==========================================

export default function TratamientosLocales({ onVolver, colmenaIdInicial }: Props) {
  const { width } = useWindowDimensions();
  const esTablet = width >= 760;
  const [sesion, setSesion] = useState<SesionMovil | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoMovil | null>(null);
  const [locales, setLocales] = useState<TratamientoGuardado[]>([]);
  const [servidor, setServidor] = useState<TratamientoApi[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioAPI[]>([]);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<InspeccionGuardada[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [formulario, setFormulario] = useState<FormularioTratamiento | null>(null);
  const [fechaVisible, setFechaVisible] = useState<CampoFecha>(null);
  const formularioInicialAbierto = useRef(false);

  const cargar = useCallback(async (forzar = false) => {
    if (forzar) setActualizando(true);
    else setCargando(true);
    setError('');

    try {
      const sesionActual = await leerSesionGuardada();
      if (!sesionActual) throw new Error('No existe una sesión móvil activa. Vuelve a iniciar sesión.');
      setSesion(sesionActual);

      let catalogoActual = await leerCatalogoLocal(sesionActual.usuario.id);
      if (tokenVigente(sesionActual)) {
        try {
          catalogoActual = await descargarCatalogo(sesionActual);
        } catch (err) {
          if (!catalogoActual) throw err;
        }
      }
      setCatalogo(catalogoActual);

      const [registrosLocales, inspecciones] = await Promise.all([
        listarTratamientosLocales(),
        listarInspeccionesLocales(),
      ]);
      setLocales(registrosLocales);
      setInspeccionesLocales(inspecciones);

      try {
        const registrosServidor = await listarTratamientos(sesionActual.accessToken);
        setServidor(registrosServidor);
        if (sesionActual.usuario.rol === 'ADMIN') {
          setUsuarios(await listarUsuarios(sesionActual.accessToken).catch(() => []));
        } else {
          setUsuarios([]);
        }
      } catch (err) {
        setServidor([]);
        setError(
          err instanceof Error
            ? `No se pudo actualizar el listado del servidor. Se muestran los registros guardados en el teléfono. ${err.message}`
            : 'No se pudo conectar con FastAPI. Se muestran los registros guardados en el teléfono.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los tratamientos.');
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  const registros = useMemo<TratamientoVista[]>(() => {
    const colmenasPorId = new Map<number, ColmenaCatalogo>(
      (catalogo?.colmenas ?? []).map(colmena => [colmena.id, colmena])
    );
    const colmenasPorQr = new Map<string, ColmenaCatalogo>(
      (catalogo?.colmenas ?? []).map(colmena => [colmena.codigo_qr.toLowerCase(), colmena])
    );
    const localPorCliente = new Map<string, TratamientoGuardado>(locales.map(item => [item.id_cliente, item] as const));
    const localPorServidor = new Map<number, TratamientoGuardado>(locales.filter(item => item.servidor_id !== null).map(item => [item.servidor_id as number, item] as const));
    const clientesVistos = new Set<string>();
    const servidoresVistos = new Set<number>();

    const remotos: TratamientoVista[] = servidor.map(item => {
      const local = (item.id_cliente ? localPorCliente.get(item.id_cliente) : undefined)
        ?? localPorServidor.get(item.id);
      if (item.id_cliente) clientesVistos.add(item.id_cliente);
      servidoresVistos.add(item.id);
      const colmena = colmenasPorId.get(item.colmena_id);
      return {
        key: `server-${item.id}`,
        id: item.id,
        serverId: item.id,
        localId: local?.id ?? null,
        idCliente: item.id_cliente,
        colmenaId: item.colmena_id,
        codigo: colmena?.codigo ?? `Colmena #${item.colmena_id}`,
        inspeccionId: item.inspeccion_id,
        usuarioId: item.usuario_id,
        usuarioNombre: usuarioNombre(item.usuario_id, sesion, usuarios),
        tipo: item.tipo_tratamiento,
        producto: item.producto ?? '',
        dosis: item.dosis ?? '',
        motivo: item.motivo ?? '',
        fechaInicio: item.fecha_inicio,
        fechaFin: item.fecha_fin,
        estado: item.estado,
        observaciones: item.observaciones ?? '',
        pendiente: false,
        server: item,
        local,
      };
    });

    const pendientes: TratamientoVista[] = locales
      .filter(item =>
        !clientesVistos.has(item.id_cliente) &&
        !(item.servidor_id !== null && servidoresVistos.has(item.servidor_id))
      )
      .map(item => {
        const colmena = colmenasPorQr.get(item.codigo_qr.toLowerCase());
        return {
          key: `local-${item.id}`,
          id: item.id,
          serverId: item.servidor_id,
          localId: item.id,
          idCliente: item.id_cliente,
          colmenaId: colmena?.id ?? null,
          codigo: colmena?.codigo ?? 'Colmena local',
          inspeccionId: null,
          usuarioId: item.usuario_local_id,
          usuarioNombre: usuarioNombre(item.usuario_local_id, sesion, usuarios),
          tipo: item.tipo_tratamiento,
          producto: item.producto,
          dosis: item.dosis,
          motivo: item.motivo,
          fechaInicio: item.fecha_inicio,
          fechaFin: item.fecha_fin,
          estado: item.estado,
          observaciones: item.observaciones,
          pendiente: item.sincronizacion === 'PENDIENTE',
          local: item,
        };
      });

    return [...remotos, ...pendientes].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  }, [servidor, locales, catalogo, sesion, usuarios]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return registros.filter(item => {
      const coincideEstado = !estadoFiltro || item.estado === estadoFiltro;
      const coincideTexto = !termino ||
        item.codigo.toLowerCase().includes(termino) ||
        item.tipo.toLowerCase().includes(termino) ||
        item.producto.toLowerCase().includes(termino);
      return coincideEstado && coincideTexto;
    });
  }, [registros, estadoFiltro, busqueda]);

  const opcionesColmenas = (catalogo?.colmenas ?? [])
    .filter(item => item.estado !== 'INACTIVA' && item.estado !== 'BAJA')
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    .map(item => ({
      value: String(item.id),
      label: item.codigo,
      description: catalogo?.apiarios.find(apiario => apiario.id === item.apiario_id)?.nombre ?? 'Apiario',
    }));

  const inspeccionesDeColmena = useMemo(() => {
    if (!formulario?.colmenaId || !catalogo) return [];
    const colmena = catalogo.colmenas.find(item => String(item.id) === formulario.colmenaId);
    if (!colmena) return [];
    return inspeccionesLocales
      .filter(item => item.codigo_qr.toLowerCase() === colmena.codigo_qr.toLowerCase() && item.estado !== 'ANULADA')
      .sort((a, b) => b.fecha_local.localeCompare(a.fecha_local))
      .map(item => ({
        value: String(item.id),
        label: fechaEtiqueta(item.fecha_local.slice(0, 10)),
        description: item.estado === 'SINCRONIZADO' ? 'Inspección sincronizada' : 'Inspección pendiente de sincronización',
      }));
  }, [formulario?.colmenaId, inspeccionesLocales, catalogo]);

  const puedeGestionar = (item: TratamientoVista) =>
    Boolean(sesion && (sesion.usuario.rol === 'ADMIN' || item.usuarioId === sesion.usuario.id));
  const estaAbierto = (item: TratamientoVista) => item.estado === 'PLANIFICADO' || item.estado === 'EN_CURSO';

  useEffect(() => {
    if (!colmenaIdInicial || !catalogo || formularioInicialAbierto.current) return;
    const existe = catalogo.colmenas.some(item => item.id === colmenaIdInicial);
    if (!existe) return;
    formularioInicialAbierto.current = true;
    setFormulario({
      registro: null,
      colmenaId: String(colmenaIdInicial),
      inspeccionLocalId: '',
      tipo: '',
      producto: '',
      dosis: '',
      fechaInicio: fechaLocalISO(),
      fechaFin: '',
      estado: 'EN_CURSO',
      motivo: '',
      observaciones: '',
    });
  }, [colmenaIdInicial, catalogo]);

  const abrirNuevo = () => {
    setFormulario({
      registro: null,
      colmenaId: '',
      inspeccionLocalId: '',
      tipo: '',
      producto: '',
      dosis: '',
      fechaInicio: fechaLocalISO(),
      fechaFin: '',
      estado: 'EN_CURSO',
      motivo: '',
      observaciones: '',
    });
  };

  const abrirEdicion = (item: TratamientoVista) => {
    setFormulario({
      registro: item,
      colmenaId: item.colmenaId === null ? '' : String(item.colmenaId),
      inspeccionLocalId: item.local?.inspeccion_local_id ? String(item.local.inspeccion_local_id) : '',
      tipo: item.tipo,
      producto: item.producto,
      dosis: item.dosis,
      fechaInicio: item.fechaInicio,
      fechaFin: item.fechaFin ?? '',
      estado: item.estado,
      motivo: item.motivo,
      observaciones: item.observaciones,
    });
  };

  const cambiarFormulario = <K extends keyof FormularioTratamiento>(campo: K, valor: FormularioTratamiento[K]) => {
    setFormulario(actual => actual ? { ...actual, [campo]: valor } : actual);
  };

  const guardar = async () => {
    if (!formulario || !sesion || !catalogo) return;
    if (guardando) return;

    const tipo = formulario.tipo.trim();
    if (tipo.length < 2 || tipo.length > 100) {
      Alert.alert('Revisa el formulario', 'El tipo de tratamiento debe tener entre 2 y 100 caracteres.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formulario.fechaInicio)) {
      Alert.alert('Fecha inválida', 'Indica una fecha de inicio válida.');
      return;
    }
    if (formulario.fechaFin && formulario.fechaFin < formulario.fechaInicio) {
      Alert.alert('Fechas inválidas', 'La fecha de término no puede ser anterior al inicio.');
      return;
    }
    if (formulario.estado === 'FINALIZADO' && !formulario.fechaFin) {
      Alert.alert('Fecha requerida', 'Un tratamiento finalizado necesita una fecha de término.');
      return;
    }
    if (formulario.estado === 'EN_CURSO' && formulario.fechaFin) {
      Alert.alert('Revisa el estado', 'Un tratamiento en curso no puede tener fecha de término.');
      return;
    }

    setGuardando(true);
    try {
      const comunes: TratamientoUpdateApi = {
        tipo_tratamiento: tipo,
        producto: formulario.producto.trim() || null,
        dosis: formulario.dosis.trim() || null,
        motivo: formulario.motivo.trim() || null,
        fecha_fin: formulario.fechaFin || null,
        estado: formulario.estado,
        observaciones: formulario.observaciones.trim() || null,
      };

      if (formulario.registro) {
        const registro = formulario.registro;
        if (registro.serverId !== null) {
          if (registro.pendiente) throw new Error('El tratamiento todavía está pendiente de sincronización.');
          await actualizarTratamiento(registro.serverId, comunes, sesion.accessToken);
        } else if (registro.localId !== null && registro.local) {
          const colmena = catalogo.colmenas.find(item => item.codigo_qr.toLowerCase() === registro.local?.codigo_qr.toLowerCase());
          if (!colmena) throw new Error('La colmena no está en el catálogo oficial.');
          const datos: DatosTratamiento = {
            codigoQR: registro.local.codigo_qr,
            inspeccionLocalId: registro.local.inspeccion_local_id,
            tipoTratamiento: tipo,
            producto: formulario.producto.trim(),
            dosis: formulario.dosis.trim(),
            motivo: formulario.motivo.trim(),
            fechaInicio: registro.local.fecha_inicio,
            fechaFin: formulario.fechaFin || null,
            estado: registro.local.estado,
            observaciones: formulario.observaciones.trim(),
          };
          await actualizarTratamientoLocal(registro.localId, datos);
        }
      } else {
        const colmena = catalogo.colmenas.find(item => String(item.id) === formulario.colmenaId);
        if (!colmena) throw new Error('Selecciona una colmena válida.');
        const datos: DatosTratamiento = {
          codigoQR: colmena.codigo_qr,
          inspeccionLocalId: formulario.inspeccionLocalId ? Number(formulario.inspeccionLocalId) : null,
          tipoTratamiento: tipo,
          producto: formulario.producto.trim(),
          dosis: formulario.dosis.trim(),
          motivo: formulario.motivo.trim(),
          fechaInicio: formulario.fechaInicio,
          fechaFin: formulario.fechaFin || null,
          estado: formulario.estado,
          observaciones: formulario.observaciones.trim(),
        };
        await guardarTratamientoLocal(datos);
      }

      setFormulario(null);
      await cargar(true);
      try {
        await sincronizarTratamientosPendientes();
        await cargar(true);
      } catch {
        // El registro ya está guardado localmente. La sincronización automática
        // lo enviará cuando vuelva la conexión.
      }
      Alert.alert(
        'Tratamiento guardado',
        formulario.registro
          ? 'Los cambios quedaron guardados correctamente.'
          : 'El tratamiento quedó guardado en el teléfono y se sincronizará con FastAPI cuando haya conexión.'
      );
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Ocurrió un error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const finalizar = (item: TratamientoVista) => {
    if (!puedeGestionar(item) || !estaAbierto(item)) return;
    Alert.alert(
      '¿Finalizar este tratamiento?',
      `${item.tipo} en ${item.codigo} quedará como finalizado con fecha de término de hoy.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: () => {
            void (async () => {
              try {
                if (item.serverId !== null) {
                  if (!sesion) throw new Error('Sesión no disponible.');
                  await actualizarTratamiento(item.serverId, {
                    estado: 'FINALIZADO',
                    fecha_fin: fechaLocalISO(),
                  }, sesion.accessToken);
                } else if (item.localId !== null) {
                  await cambiarEstadoTratamientoLocal(item.localId, 'FINALIZADO');
                  await sincronizarTratamientosPendientes().catch(() => {});
                }
                await cargar(true);
                Alert.alert('Tratamiento finalizado', 'El estado se actualizó correctamente.');
              } catch (err) {
                Alert.alert('No se pudo finalizar', err instanceof Error ? err.message : 'Intenta nuevamente.');
              }
            })();
          },
        },
      ]
    );
  };

  const cancelar = (item: TratamientoVista) => {
    if (!puedeGestionar(item) || !estaAbierto(item)) return;
    Alert.alert(
      '¿Cancelar este tratamiento?',
      'El tratamiento quedará como cancelado y se conservará en el historial de la colmena.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar tratamiento',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                if (item.serverId !== null) {
                  if (!sesion) throw new Error('Sesión no disponible.');
                  await cancelarTratamiento(item.serverId, sesion.accessToken);
                } else if (item.localId !== null) {
                  await cambiarEstadoTratamientoLocal(item.localId, 'CANCELADO');
                  await sincronizarTratamientosPendientes().catch(() => {});
                }
                await cargar(true);
                Alert.alert('Tratamiento cancelado', 'El tratamiento quedó cancelado correctamente.');
              } catch (err) {
                Alert.alert('No se pudo cancelar', err instanceof Error ? err.message : 'Intenta nuevamente.');
              }
            })();
          },
        },
      ]
    );
  };

  if (cargando) {
    return (
      <View style={styles.cargandoPantalla}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.textoCargando}>Cargando tratamientos...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.pantalla} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <StatusBar barStyle="dark-content" />

      <View style={styles.encabezado}>
        <View style={{ flex: 1 }}>
          <Pressable onPress={onVolver} style={styles.volver}>
            <Text style={styles.volverTexto}>‹ Volver</Text>
          </Pressable>
          <Text style={styles.titulo}>Tratamientos</Text>
          <Text style={styles.subtitulo}>Seguimiento sanitario de las colmenas.</Text>
        </View>
        <Pressable style={styles.botonPrincipal} onPress={abrirNuevo}>
          <Text style={styles.botonPrincipalTexto}>＋ Registrar tratamiento</Text>
        </Pressable>
      </View>

      {!!error && (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>{error}</Text>
        </View>
      )}

      <TextInput
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Colmena, tipo o producto"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />
      <View style={styles.filtroEstado}>
        <SelectorLista
          label="Estado"
          value={estadoFiltro}
          opciones={ESTADOS}
          onChange={setEstadoFiltro}
          placeholder="Todos los estados"
        />
      </View>

      <View style={styles.barraResultados}>
        <Text style={styles.contador}>{filtrados.length} tratamiento(s)</Text>
        <Pressable onPress={() => void cargar(true)} disabled={actualizando}>
          <Text style={styles.actualizar}>{actualizando ? 'Actualizando…' : '⟳ Actualizar'}</Text>
        </Pressable>
      </View>

      {filtrados.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioTitulo}>No hay tratamientos para mostrar</Text>
          <Text style={styles.vacioTexto}>{registros.length === 0 ? 'Registra el primer tratamiento sanitario.' : 'Ajusta o limpia los filtros.'}</Text>
        </View>
      ) : (
        <View style={styles.listaTarjetas}>
          {filtrados.map(item => (
            <View key={item.key} style={[styles.tarjeta, esTablet && styles.tarjetaTablet]}>
              <View style={styles.tarjetaCabecera}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tipo}>{item.tipo}</Text>
                  <Text style={styles.meta}>{item.codigo} · {item.usuarioNombre}</Text>
                </View>
                <InsigniaMovil texto={etiquetaTratamiento(item.estado)} tono={tonoTratamiento(item.estado)} />
              </View>

              {item.pendiente && <InsigniaMovil texto="Pendiente de sincronización" tono="ambar" />}

              <View style={styles.datosGrid}>
                <Dato nombre="Producto" valor={textoNulo(item.producto)} />
                <Dato nombre="Dosis" valor={textoNulo(item.dosis)} />
                <Dato nombre="Inicio" valor={fechaEtiqueta(item.fechaInicio)} />
                <Dato nombre="Término" valor={fechaEtiqueta(item.fechaFin)} />
              </View>

              {!!item.motivo && <Text style={styles.motivo}>Motivo: {item.motivo}</Text>}

              {puedeGestionar(item) && (
                <View style={styles.acciones}>
                  {estaAbierto(item) && (
                    <Pressable style={styles.accion} onPress={() => finalizar(item)}>
                      <Text style={styles.accionTexto}>✓ Finalizar</Text>
                    </Pressable>
                  )}
                  {(item.serverId !== null || (item.localId !== null && item.pendiente && estaAbierto(item))) && (
                    <Pressable style={styles.accion} onPress={() => abrirEdicion(item)}>
                      <Text style={styles.accionTexto}>✎ Editar</Text>
                    </Pressable>
                  )}
                  {estaAbierto(item) && (
                    <Pressable style={styles.accion} onPress={() => cancelar(item)}>
                      <Text style={styles.accionTexto}>⊗ Cancelar tratamiento</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <Text style={styles.pie}>Los tratamientos se guardan localmente y se sincronizan con FastAPI cuando hay conexión.</Text>

      {formulario && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setFormulario(null)}>
          <View style={styles.overlay}>
            <View style={styles.modalFormulario}>
              <View style={styles.modalCabecera}>
                <Text style={styles.modalTitulo}>{formulario.registro ? 'Editar tratamiento' : 'Registrar tratamiento'}</Text>
                <Pressable onPress={() => setFormulario(null)} hitSlop={10}>
                  <Text style={styles.cerrar}>×</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContenido} keyboardShouldPersistTaps="handled">
                {formulario.registro ? (
                  <View style={styles.camposDosColumnas}>
                    <View style={styles.campoMitad}>
                      <Text style={styles.label}>Colmena *</Text>
                      <View style={styles.campoSoloLectura}><Text style={styles.soloLecturaTexto}>{formulario.registro.codigo}</Text></View>
                    </View>
                    <View style={styles.campoMitad}>
                      <Text style={styles.label}>Inspección asociada</Text>
                      <View style={styles.campoSoloLectura}><Text style={styles.soloLecturaTexto}>{formulario.registro.inspeccionId ? `Inspección #${formulario.registro.inspeccionId}` : 'Sin inspecciones'}</Text></View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.camposDosColumnas}>
                    <View style={styles.campoMitad}>
                      <SelectorLista
                        label="Colmena"
                        required
                        value={formulario.colmenaId}
                        opciones={opcionesColmenas}
                        onChange={valor => {
                          cambiarFormulario('colmenaId', valor);
                          cambiarFormulario('inspeccionLocalId', '');
                        }}
                        placeholder="Seleccionar colmena"
                      />
                    </View>
                    <View style={styles.campoMitad}>
                      <SelectorLista
                        label="Inspección asociada"
                        value={formulario.inspeccionLocalId}
                        opciones={inspeccionesDeColmena}
                        onChange={valor => cambiarFormulario('inspeccionLocalId', valor)}
                        placeholder={inspeccionesDeColmena.length ? 'Ninguna' : 'Sin inspecciones'}
                        disabled={!formulario.colmenaId || inspeccionesDeColmena.length === 0}
                        helper="Opcional: la inspección que motivó el tratamiento."
                      />
                    </View>
                  </View>
                )}

                <View style={styles.campo}>
                  <Text style={styles.label}>Tipo de tratamiento *</Text>
                  <TextInput
                    value={formulario.tipo}
                    onChangeText={valor => cambiarFormulario('tipo', valor)}
                    style={styles.inputCampo}
                    placeholder="Por ejemplo: Control de varroa"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={100}
                  />
                </View>

                <View style={styles.camposDosColumnas}>
                  <View style={styles.campoMitad}>
                    <Text style={styles.label}>Producto</Text>
                    <TextInput
                      value={formulario.producto}
                      onChangeText={valor => cambiarFormulario('producto', valor)}
                      style={styles.inputCampo}
                      placeholder="Producto aplicado"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={150}
                    />
                  </View>
                  <View style={styles.campoMitad}>
                    <Text style={styles.label}>Dosis</Text>
                    <TextInput
                      value={formulario.dosis}
                      onChangeText={valor => cambiarFormulario('dosis', valor)}
                      style={styles.inputCampo}
                      placeholder="Ej. 2 tiras"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={100}
                    />
                  </View>
                </View>

                <View style={styles.camposDosColumnas}>
                  <View style={styles.campoMitad}>
                    <Text style={styles.label}>Fecha de inicio *</Text>
                    <Pressable
                      disabled={Boolean(formulario.registro)}
                      onPress={() => setFechaVisible('inicio')}
                      style={[styles.fechaCampo, Boolean(formulario.registro) && styles.campoDeshabilitado]}
                    >
                      <Text style={styles.fechaTexto}>{fechaEtiqueta(formulario.fechaInicio)}</Text>
                      <Text style={styles.calendario}>▣</Text>
                    </Pressable>
                  </View>
                  <View style={styles.campoMitad}>
                    <Text style={styles.label}>Fecha de término</Text>
                    <Pressable onPress={() => setFechaVisible('termino')} style={styles.fechaCampo}>
                      <Text style={formulario.fechaFin ? styles.fechaTexto : styles.fechaPlaceholder}>{fechaEtiqueta(formulario.fechaFin)}</Text>
                      <Text style={styles.calendario}>▣</Text>
                    </Pressable>
                  </View>
                </View>

                <SelectorLista
                  label="Estado"
                  value={formulario.estado}
                  opciones={(formulario.registro
                    ? ESTADOS_FORM
                    : ESTADOS_FORM.filter(item => item.value === 'PLANIFICADO' || item.value === 'EN_CURSO')
                  ).map(item => ({ value: item.value, label: item.label }))}
                  onChange={valor => {
                    cambiarFormulario('estado', valor as EstadoTratamiento);
                    if (valor === 'EN_CURSO') cambiarFormulario('fechaFin', '');
                  }}
                  disabled={Boolean(formulario.registro?.local && formulario.registro.pendiente)}
                />

                <View style={styles.campo}>
                  <Text style={styles.label}>Motivo</Text>
                  <TextInput
                    value={formulario.motivo}
                    onChangeText={valor => cambiarFormulario('motivo', valor)}
                    style={[styles.inputCampo, styles.areaTexto]}
                    multiline
                    textAlignVertical="top"
                    placeholder="Motivo del tratamiento"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={500}
                  />
                </View>

                <View style={styles.campo}>
                  <Text style={styles.label}>Observaciones</Text>
                  <TextInput
                    value={formulario.observaciones}
                    onChangeText={valor => cambiarFormulario('observaciones', valor)}
                    style={[styles.inputCampo, styles.areaTexto]}
                    multiline
                    textAlignVertical="top"
                    placeholder="Observaciones adicionales"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={1000}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalPie}>
                <Pressable style={styles.botonSecundario} onPress={() => setFormulario(null)} disabled={guardando}>
                  <Text style={styles.botonSecundarioTexto}>Cancelar</Text>
                </Pressable>
                <Pressable style={[styles.botonPrincipal, guardando && styles.botonDeshabilitado]} onPress={() => void guardar()} disabled={guardando}>
                  <Text style={styles.botonPrincipalTexto}>{guardando ? 'Guardando…' : formulario.registro ? 'Guardar cambios' : 'Registrar tratamiento'}</Text>
                </Pressable>
              </View>

              {fechaVisible && (
                <DateTimePicker
                  value={fechaDate(fechaVisible === 'inicio' ? formulario.fechaInicio : formulario.fechaFin || formulario.fechaInicio)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={fechaVisible === 'termino' ? fechaDate(formulario.fechaInicio) : undefined}
                  onChange={(evento, fecha) => {
                    setFechaVisible(null);
                    if (evento.type === 'dismissed' || !fecha) return;
                    const valor = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
                    if (fechaVisible === 'inicio') cambiarFormulario('fechaInicio', valor);
                    else cambiarFormulario('fechaFin', valor);
                  }}
                />
              )}
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

function Dato({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoNombre}>{nombre}</Text>
      <Text style={styles.datoValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.backgroundSoft },
  contenido: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 50 },
  encabezado: { gap: 14, marginBottom: 18 },
  volver: { alignSelf: 'flex-start', paddingVertical: 4 },
  volverTexto: { color: COLORS.goldText, fontSize: 13, fontWeight: '800' },
  titulo: { color: COLORS.forest, fontSize: 27, fontWeight: '900' },
  subtitulo: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  botonPrincipal: { backgroundColor: COLORS.gold, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  botonPrincipalTexto: { color: '#35230A', fontSize: 12, fontWeight: '900' },
  input: { minHeight: 46, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, backgroundColor: COLORS.surface, paddingHorizontal: 13, color: COLORS.text, fontSize: 13, marginBottom: 12 },
  filtroEstado: { marginBottom: 10, maxWidth: 460 },
  barraResultados: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  contador: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  actualizar: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  listaTarjetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tarjeta: { width: '100%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 15, gap: 11 },
  tarjetaTablet: { width: '48.5%' },
  tarjetaCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  tipo: { color: COLORS.forest, fontSize: 16, fontWeight: '900' },
  meta: { color: COLORS.textSecondary, fontSize: 10, marginTop: 3 },
  datosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dato: { flexBasis: '46%', flexGrow: 1, minWidth: 110, gap: 3 },
  datoNombre: { color: COLORS.textMuted, fontSize: 10 },
  datoValor: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  motivo: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  acciones: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  accion: { paddingVertical: 4 },
  accionTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  vacio: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, padding: 22, alignItems: 'center', gap: 8 },
  vacioTitulo: { color: COLORS.forest, fontSize: 15, fontWeight: '800' },
  vacioTexto: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  aviso: { backgroundColor: COLORS.warningBg, borderWidth: 1, borderColor: COLORS.goldBorder, borderRadius: 11, padding: 11, marginBottom: 12 },
  avisoTexto: { color: COLORS.goldText, fontSize: 11, lineHeight: 16 },
  pie: { color: COLORS.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 22 },
  cargandoPantalla: { flex: 1, backgroundColor: COLORS.backgroundSoft, alignItems: 'center', justifyContent: 'center', gap: 12 },
  textoCargando: { color: COLORS.textSecondary, fontSize: 13 },
  overlay: { flex: 1, backgroundColor: '#00000077', justifyContent: 'center', alignItems: 'center', padding: 8 },
  modalFormulario: { width: '100%', maxWidth: 700, maxHeight: '96%', backgroundColor: COLORS.surface, borderRadius: 16, overflow: 'hidden' },
  modalCabecera: { minHeight: 58, paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitulo: { color: COLORS.forest, fontSize: 15, fontWeight: '900' },
  cerrar: { color: COLORS.textSecondary, fontSize: 28, lineHeight: 30 },
  formScroll: { flexGrow: 0 },
  formContenido: { padding: 16, gap: 14, paddingBottom: 20 },
  campo: { gap: 6 },
  label: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  inputCampo: { minHeight: 44, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9, color: COLORS.text, backgroundColor: COLORS.surface, fontSize: 12 },
  areaTexto: { minHeight: 70, textAlignVertical: 'top' },
  camposDosColumnas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  campoMitad: { flex: 1, flexBasis: '47%', minWidth: 135 },
  fechaCampo: { minHeight: 44, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 11, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface },
  fechaTexto: { color: COLORS.text, fontSize: 12 },
  fechaPlaceholder: { color: COLORS.textMuted, fontSize: 12 },
  calendario: { color: COLORS.forest, fontSize: 15 },
  campoSoloLectura: { minHeight: 44, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 11, backgroundColor: COLORS.background, justifyContent: 'center', paddingHorizontal: 11 },
  soloLecturaTexto: { color: COLORS.textSecondary, fontSize: 12 },
  campoDeshabilitado: { backgroundColor: COLORS.background, opacity: 0.75 },
  modalPie: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  botonSecundario: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: COLORS.borderStrong, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  botonSecundarioTexto: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  botonDeshabilitado: { opacity: 0.6 },
});
