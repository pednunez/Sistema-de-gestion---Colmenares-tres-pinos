import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS } from './theme';
import { SelectorLista, InsigniaMovil } from './ComponentesMoviles';
import FormularioInspeccion from './FormularioInspeccion';

import {
  leerSesionGuardada,
  tokenVigente,
} from './api/auth';
import type { SesionMovil } from './api/auth';
import {
  listarInspecciones,
  obtenerInspeccion,
  actualizarInspeccion,
  anularInspeccion,
} from './api/inspecciones';
import type { InspeccionApi, InspeccionUpdateApi } from './api/inspecciones';
import { listarUsuarios } from './api/usuarios';
import type { UsuarioAPI } from './api/usuarios';

import {
  descargarCatalogo,
  leerCatalogoLocal,
} from './database/catalogo';
import type { CatalogoMovil, ColmenaCatalogo } from './database/catalogo';
import {
  listarInspeccionesLocales,
  anularInspeccionLocal,
} from './database/inspecciones';
import type { InspeccionGuardada } from './database/inspecciones';
import type { InspeccionAvanzada } from './database/inspeccionesAvanzadas';

// ==========================================
// TIPOS DE LA VISTA
// ==========================================

type Props = {
  onVolver: () => void;
};

type InspeccionVista = {
  key: string;
  id: number;
  serverId: number | null;
  localId: number | null;
  colmenaId: number | null;
  codigo: string;
  apiarioId: number | null;
  fecha: string;
  usuarioId: number | null;
  usuarioNombre: string;
  cantidadMarcos: number | null;
  estadoGeneral: string | null;
  reinaObservada: boolean | string | null;
  presenciaCria: boolean | null;
  postura: boolean | null;
  miel: string | null;
  poblacion: string | null;
  reservas: string | null;
  signosEnfermedad: boolean;
  enfermedadObservada: string | null;
  tirasMedicamento: number | null;
  alimentacion: string | null;
  observaciones: string;
  marcos: InspeccionApi['marcos'];
  sincronizacion: string;
  server?: InspeccionApi;
  local?: InspeccionGuardada;
};

type FormularioActivo = {
  codigoQR: string;
  inspeccion: InspeccionApi | null;
};

const ESTADOS = [
  { value: '', label: 'Todos los estados' },
  { value: 'COMPLETA', label: 'Completa' },
  { value: 'EN_DESARROLLO', label: 'En desarrollo' },
  { value: 'DONANTE', label: 'Donante' },
  { value: 'DEBIL', label: 'Débil' },
  { value: 'REQUIERE_REVISION', label: 'Requiere revisión' },
  { value: 'BUENO', label: 'Bueno' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'CRITICO', label: 'Crítico' },
  { value: 'PENDIENTE', label: 'Pendiente de sincronización' },
];

// ==========================================
// FORMATO
// ==========================================

function fechaHora(valor?: string | null): string {
  if (!valor) return 'Fecha no disponible';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return fecha.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fechaCorta(valor?: string | null): string {
  if (!valor) return 'Sin inspecciones';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return fecha.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function textoSiNo(valor: boolean | string | null | undefined): string {
  if (valor === true || valor === 'Vista') return 'Sí';
  if (valor === false || valor === 'No vista') return 'No';
  return 'No revisado';
}

function etiquetaEstado(valor: string | null): string {
  const nombres: Record<string, string> = {
    COMPLETA: 'Completa',
    EN_DESARROLLO: 'En desarrollo',
    DONANTE: 'Donante',
    DEBIL: 'Débil',
    REQUIERE_REVISION: 'Requiere revisión',
    BUENO: 'Bueno',
    REGULAR: 'Regular',
    CRITICO: 'Crítico',
  };
  return valor ? nombres[valor] ?? valor.replaceAll('_', ' ') : 'Sin estado';
}

function tonoEstado(valor: string | null): 'verde' | 'azul' | 'ambar' | 'rojo' | 'neutral' {
  if (valor === 'COMPLETA' || valor === 'BUENO') return 'verde';
  if (valor === 'EN_DESARROLLO' || valor === 'REGULAR') return 'azul';
  if (valor === 'REQUIERE_REVISION' || valor === 'CRITICO') return 'rojo';
  if (valor === 'PENDIENTE') return 'ambar';
  return 'neutral';
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

// ==========================================
// COMPONENTE
// ==========================================

export default function InspeccionesLocales({ onVolver }: Props) {
  const [sesion, setSesion] = useState<SesionMovil | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoMovil | null>(null);
  const [locales, setLocales] = useState<InspeccionGuardada[]>([]);
  const [servidor, setServidor] = useState<InspeccionApi[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioAPI[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [apiarioFiltro, setApiarioFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [detalle, setDetalle] = useState<InspeccionVista | null>(null);
  const [formulario, setFormulario] = useState<FormularioActivo | null>(null);
  const [selectorColmena, setSelectorColmena] = useState(false);
  const [busquedaColmena, setBusquedaColmena] = useState('');

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

      const registrosLocales = await listarInspeccionesLocales();
      setLocales(registrosLocales);

      try {
        const registrosServidor = await listarInspecciones(sesionActual.accessToken);
        setServidor(registrosServidor.filter(item => item.activo));
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
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las inspecciones.');
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  const registros = useMemo<InspeccionVista[]>(() => {
    const colmenasPorId = new Map<number, ColmenaCatalogo>(
      (catalogo?.colmenas ?? []).map(colmena => [colmena.id, colmena])
    );
    const colmenasPorQr = new Map<string, ColmenaCatalogo>(
      (catalogo?.colmenas ?? []).map(colmena => [colmena.codigo_qr.toLowerCase(), colmena])
    );
    const localPorCliente = new Map<string, InspeccionGuardada>(locales.map(item => [item.id_cliente, item] as const));
    const localPorServidor = new Map<number, InspeccionGuardada>(locales.filter(item => item.servidor_id !== null).map(item => [item.servidor_id as number, item] as const));
    const clientesVistos = new Set<string>();
    const servidoresVistos = new Set<number>();

    const remotos: InspeccionVista[] = servidor.map(item => {
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
        colmenaId: item.colmena_id,
        codigo: colmena?.codigo ?? `Colmena #${item.colmena_id}`,
        apiarioId: colmena?.apiario_id ?? null,
        fecha: item.fecha_inspeccion,
        usuarioId: item.usuario_id,
        usuarioNombre: usuarioNombre(item.usuario_id, sesion, usuarios),
        cantidadMarcos: item.cantidad_marcos,
        estadoGeneral: item.estado_general,
        reinaObservada: item.reina_observada,
        presenciaCria: item.presencia_cria,
        postura: item.postura,
        miel: item.miel,
        poblacion: item.nivel_poblacion,
        reservas: item.reservas_alimento,
        signosEnfermedad: item.signos_enfermedad,
        enfermedadObservada: item.enfermedad_observada,
        tirasMedicamento: item.tiras_medicamento,
        alimentacion: item.alimentacion_suministrada,
        observaciones: item.observaciones ?? '',
        marcos: item.marcos ?? [],
        sincronizacion: 'SINCRONIZADO',
        server: item,
        local,
      };
    });

    const pendientes: InspeccionVista[] = locales
      .filter(item =>
        item.estado !== 'ANULADA' &&
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
          colmenaId: colmena?.id ?? null,
          codigo: colmena?.codigo ?? 'Registro local',
          apiarioId: colmena?.apiario_id ?? null,
          fecha: item.fecha_local,
          usuarioId: item.usuario_local_id,
          usuarioNombre: usuarioNombre(item.usuario_local_id, sesion, usuarios),
          cantidadMarcos: item.marcos_totales,
          estadoGeneral: null,
          reinaObservada: item.reina,
          presenciaCria: null,
          postura: null,
          miel: null,
          poblacion: null,
          reservas: null,
          signosEnfermedad: false,
          enfermedadObservada: null,
          tirasMedicamento: null,
          alimentacion: null,
          observaciones: item.observaciones,
          marcos: [],
          sincronizacion: item.estado,
          local: item,
        };
      });

    return [...remotos, ...pendientes].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [servidor, locales, catalogo, sesion, usuarios]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return registros.filter(item => {
      const coincideTexto = !termino || item.codigo.toLowerCase().includes(termino);
      const coincideApiario = !apiarioFiltro || String(item.apiarioId ?? '') === apiarioFiltro;
      const estado = item.estadoGeneral ?? (item.sincronizacion === 'PENDIENTE' ? 'PENDIENTE' : '');
      const coincideEstado = !estadoFiltro || estado === estadoFiltro;
      return coincideTexto && coincideApiario && coincideEstado;
    });
  }, [registros, busqueda, apiarioFiltro, estadoFiltro]);

  const apiarios = (catalogo?.apiarios ?? []).map(item => ({ value: String(item.id), label: item.nombre }));
  const colmenasFiltradas = useMemo(() => {
    const termino = busquedaColmena.trim().toLowerCase();
    return (catalogo?.colmenas ?? []).filter(colmena =>
      colmena.estado !== 'INACTIVA' &&
      colmena.estado !== 'BAJA' &&
      (!termino || colmena.codigo.toLowerCase().includes(termino))
    ).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  }, [catalogo, busquedaColmena]);

  const puedeGestionar = (item: InspeccionVista) =>
    Boolean(sesion && (sesion.usuario.rol === 'ADMIN' || item.usuarioId === sesion.usuario.id));

  const abrirEdicion = async (item: InspeccionVista) => {
    if (!sesion || !puedeGestionar(item)) return;
    try {
      let inspeccion = item.server;
      if (!inspeccion && item.serverId) {
        inspeccion = await obtenerInspeccion(item.serverId, sesion.accessToken);
      }
      if (!inspeccion) {
        Alert.alert(
          'Inspección pendiente',
          'Esta inspección todavía no está sincronizada. Primero sincroniza el registro para poder editarlo.'
        );
        return;
      }
      const colmena = catalogo?.colmenas.find(registro => registro.id === inspeccion?.colmena_id);
      if (!colmena) throw new Error('La colmena no está disponible en el catálogo local. Actualiza el catálogo e inténtalo nuevamente.');
      setDetalle(null);
      setFormulario({ codigoQR: colmena.codigo_qr, inspeccion });
    } catch (err) {
      Alert.alert('No se pudo abrir la edición', err instanceof Error ? err.message : 'Intenta nuevamente.');
    }
  };

  const anular = (item: InspeccionVista) => {
    if (!puedeGestionar(item)) return;
    Alert.alert(
      '¿Anular esta inspección?',
      `La inspección de ${item.codigo} del ${fechaHora(item.fecha)} dejará de mostrarse.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Anular',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                if (item.serverId && sesion) {
                  await anularInspeccion(item.serverId, sesion.accessToken);
                  if (item.localId) {
                    // El servidor ya la anuló. La copia local queda identificada
                    // por su servidor_id y no se vuelve a sincronizar.
                  }
                } else if (item.localId) {
                  await anularInspeccionLocal(item.localId);
                }
                setDetalle(null);
                await cargar(true);
                Alert.alert('Inspección anulada', 'El registro quedó anulado correctamente.');
              } catch (err) {
                Alert.alert('No se pudo anular', err instanceof Error ? err.message : 'Intenta nuevamente.');
              }
            })();
          },
        },
      ]
    );
  };

  const guardarEdicion = async (datos: InspeccionAvanzada) => {
    if (!sesion || !formulario?.inspeccion) throw new Error('La sesión o la inspección no están disponibles.');
    const payload: InspeccionUpdateApi = {
      estado_general: datos.estadoGeneral,
      reina_observada: datos.reinaObservada,
      presencia_cria: datos.presenciaCria,
      postura: datos.postura,
      nivel_poblacion: datos.nivelPoblacion,
      reservas_alimento: datos.reservasAlimento,
      miel: datos.nivelMiel,
      alimentacion_suministrada: datos.alimentacion.trim() || null,
      signos_enfermedad: datos.signosEnfermedad,
      enfermedad_observada: datos.signosEnfermedad ? datos.enfermedadObservada.trim() || null : null,
      tiras_medicamento: datos.signosEnfermedad ? datos.tirasMedicamento : null,
      observaciones: datos.observaciones.trim() || null,
    };
    await actualizarInspeccion(formulario.inspeccion.id, payload, sesion.accessToken);
  };

  if (formulario) {
    return (
      <FormularioInspeccion
        codigoQR={formulario.codigoQR}
        inspeccionEditar={formulario.inspeccion}
        onGuardarEdicion={formulario.inspeccion ? guardarEdicion : undefined}
        onVolver={() => {
          setFormulario(null);
          void cargar(true);
        }}
      />
    );
  }

  if (cargando) {
    return (
      <View style={styles.cargandoPantalla}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.textoCargando}>Cargando inspecciones...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      <View style={styles.encabezado}>
        <View style={styles.encabezadoTexto}>
          <Pressable onPress={onVolver} style={styles.volver}>
            <Text style={styles.volverTexto}>‹ Volver</Text>
          </Pressable>
          <Text style={styles.titulo}>Inspecciones</Text>
          <Text style={styles.subtitulo}>Revisiones registradas en terreno, de la más reciente a la más antigua.</Text>
        </View>
        <Pressable style={styles.botonPrincipal} onPress={() => setSelectorColmena(true)}>
          <Text style={styles.botonPrincipalTexto}>＋ Registrar inspección</Text>
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
        placeholder="Buscar por código de colmena"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
        autoCapitalize="characters"
      />

      <View style={styles.filtros}>
        <View style={styles.filtroItem}>
          <SelectorLista
            label="Apiario"
            value={apiarioFiltro}
            opciones={[{ value: '', label: 'Todos los apiarios' }, ...apiarios]}
            onChange={setApiarioFiltro}
            placeholder="Todos los apiarios"
          />
        </View>
        <View style={styles.filtroItem}>
          <SelectorLista
            label="Estado"
            value={estadoFiltro}
            opciones={ESTADOS}
            onChange={setEstadoFiltro}
            placeholder="Todos los estados"
          />
        </View>
      </View>

      <View style={styles.barraResultados}>
        <Text style={styles.contador}>{filtrados.length} inspección(es)</Text>
        <Pressable onPress={() => void cargar(true)} disabled={actualizando}>
          <Text style={styles.actualizar}>{actualizando ? 'Actualizando…' : '⟳ Actualizar'}</Text>
        </Pressable>
      </View>

      {filtrados.length === 0 ? (
        <View style={styles.vacio}>
          <Text style={styles.vacioTitulo}>No hay inspecciones para mostrar</Text>
          <Text style={styles.vacioTexto}>
            {registros.length === 0
              ? 'Registra la primera inspección desde aquí o escaneando el QR de una colmena.'
              : 'Ajusta o limpia los filtros para ver otros registros.'}
          </Text>
        </View>
      ) : (
        <View style={styles.listaTarjetas}>
          {filtrados.map(item => (
            <View key={item.key} style={styles.tarjeta}>
              <View style={styles.tarjetaCabecera}>
                <View style={styles.tarjetaTituloGrupo}>
                  <Text style={styles.codigo}>{item.codigo}</Text>
                  <Text style={styles.apiario}>{catalogo?.apiarios.find(a => a.id === item.apiarioId)?.nombre ?? 'Apiario no disponible'}</Text>
                </View>
                <InsigniaMovil
                  texto={item.estadoGeneral ? etiquetaEstado(item.estadoGeneral) : item.sincronizacion === 'PENDIENTE' ? 'Pendiente' : 'Sin estado'}
                  tono={item.estadoGeneral ? tonoEstado(item.estadoGeneral) : item.sincronizacion === 'PENDIENTE' ? 'ambar' : 'neutral'}
                />
              </View>

              <Text style={styles.meta}>{fechaHora(item.fecha)} · {item.usuarioNombre} · {item.cantidadMarcos ?? '—'} marcos</Text>

              <View style={styles.datosGrid}>
                <Dato nombre="Reina observada" valor={textoSiNo(item.reinaObservada)} />
                <Dato nombre="Presencia de cría" valor={textoSiNo(item.presenciaCria)} />
                <Dato nombre="Postura" valor={textoSiNo(item.postura)} />
                <Dato nombre="Miel" valor={item.miel ?? 'No revisado'} />
                <Dato nombre="Población" valor={item.poblacion ?? 'No revisado'} />
                <Dato nombre="Reservas de alimento" valor={item.reservas ?? 'No revisado'} />
              </View>

              {item.signosEnfermedad && (
                <View style={styles.alertaSanitaria}>
                  <Text style={styles.alertaSanitariaTexto}>Signos de enfermedad{item.enfermedadObservada ? ` · ${item.enfermedadObservada}` : ''}</Text>
                </View>
              )}
              {!!item.alimentacion && <Text style={styles.textoSecundario}>Alimentación: {item.alimentacion}</Text>}
              {!!item.observaciones && <Text style={styles.observaciones} numberOfLines={2}>{item.observaciones}</Text>}

              {item.sincronizacion === 'PENDIENTE' && (
                <View style={styles.pendienteLocal}>
                  <Text style={styles.pendienteTexto}>Pendiente de sincronización. Se conserva en el teléfono.</Text>
                </View>
              )}

              <View style={styles.acciones}>
                <Pressable style={styles.accion} onPress={() => setDetalle(item)}>
                  <Text style={styles.accionTexto}>◉ Ver detalle</Text>
                </Pressable>
                {puedeGestionar(item) && item.serverId !== null && (
                  <Pressable style={styles.accion} onPress={() => void abrirEdicion(item)}>
                    <Text style={styles.accionTexto}>✎ Editar</Text>
                  </Pressable>
                )}
                {puedeGestionar(item) && (item.serverId !== null || item.sincronizacion === 'PENDIENTE') && (
                  <Pressable style={styles.accion} onPress={() => anular(item)}>
                    <Text style={styles.accionTexto}>▣ Anular</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.pie}>Los registros nuevos se guardan primero en SQLite y se sincronizan con FastAPI cuando hay conexión.</Text>

      {/* SELECCIÓN DE COLMENA PARA UNA NUEVA INSPECCIÓN */}
      <Modal visible={selectorColmena} transparent animationType="slide" onRequestClose={() => setSelectorColmena(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalGrande}>
            <View style={styles.modalCabecera}>
              <Text style={styles.modalTitulo}>Registrar inspección</Text>
              <Pressable onPress={() => setSelectorColmena(false)}><Text style={styles.cerrar}>×</Text></Pressable>
            </View>
            <Text style={styles.modalAyuda}>Selecciona la colmena que vas a revisar.</Text>
            <TextInput
              value={busquedaColmena}
              onChangeText={setBusquedaColmena}
              placeholder="Buscar código de colmena"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              autoCapitalize="characters"
            />
            <ScrollView style={styles.listaColmenas} keyboardShouldPersistTaps="handled">
              {colmenasFiltradas.map(colmena => (
                <Pressable
                  key={colmena.id}
                  style={styles.opcionColmena}
                  onPress={() => {
                    setSelectorColmena(false);
                    setBusquedaColmena('');
                    setFormulario({ codigoQR: colmena.codigo_qr, inspeccion: null });
                  }}
                >
                  <View>
                    <Text style={styles.codigo}>{colmena.codigo}</Text>
                    <Text style={styles.apiario}>{catalogo?.apiarios.find(a => a.id === colmena.apiario_id)?.nombre ?? 'Apiario'}</Text>
                  </View>
                  <Text style={styles.flecha}>›</Text>
                </Pressable>
              ))}
              {colmenasFiltradas.length === 0 && <Text style={styles.vacioTexto}>No se encontraron colmenas.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DETALLE DE INSPECCIÓN */}
      <Modal visible={Boolean(detalle)} transparent animationType="fade" onRequestClose={() => setDetalle(null)}>
        {detalle && (
          <View style={styles.overlay}>
            <View style={styles.modalGrande}>
              <View style={styles.modalCabecera}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitulo}>Inspección de {detalle.codigo}</Text>
                  <Text style={styles.modalSubtitulo}>{catalogo?.apiarios.find(a => a.id === detalle.apiarioId)?.nombre ?? 'Apiario'} · {fechaHora(detalle.fecha)}</Text>
                </View>
                <Pressable onPress={() => setDetalle(null)}><Text style={styles.cerrar}>×</Text></Pressable>
              </View>
              <ScrollView style={styles.detalleScroll}>
                <View style={styles.datosGrid}>
                  <Dato nombre="Estado de la colmena" valor={etiquetaEstado(detalle.estadoGeneral)} />
                  <Dato nombre="Responsable" valor={detalle.usuarioNombre} />
                  <Dato nombre="Marcos presentes" valor={String(detalle.cantidadMarcos ?? 'Sin registrar')} />
                  <Dato nombre="Reina observada" valor={textoSiNo(detalle.reinaObservada)} />
                  <Dato nombre="Presencia de cría" valor={textoSiNo(detalle.presenciaCria)} />
                  <Dato nombre="Postura" valor={textoSiNo(detalle.postura)} />
                  <Dato nombre="Miel" valor={detalle.miel ?? 'No revisado'} />
                  <Dato nombre="Población" valor={detalle.poblacion ?? 'No revisado'} />
                  <Dato nombre="Reservas de alimento" valor={detalle.reservas ?? 'No revisado'} />
                  <Dato nombre="Alimentación" valor={detalle.alimentacion || 'No se alimentó'} />
                  <Dato nombre="Signos de enfermedad" valor={detalle.signosEnfermedad ? 'Sí' : 'No'} />
                  <Dato nombre="Enfermedad observada" valor={detalle.enfermedadObservada || 'Sin detallar'} />
                  <Dato nombre="Tiras de medicamento" valor={detalle.tirasMedicamento === null ? 'Sin registrar' : String(detalle.tirasMedicamento)} />
                </View>

                <Text style={styles.seccion}>Revisión de marcos</Text>
                {detalle.marcos.length > 0 ? detalle.marcos.map(marco => (
                  <View key={`${marco.ubicacion}-${marco.numero}`} style={styles.marcoFila}>
                    <Text style={styles.marcoTitulo}>{marco.ubicacion === 'ALZA' ? 'Alza' : 'Cámara de cría'} · Marco {marco.numero}</Text>
                    <Text style={styles.marcoTexto}>{marco.contenido ?? 'Sin registrar'}</Text>
                    {marco.transferido_a_colmena_id && <Text style={styles.marcoTransferencia}>Transferido a colmena #{marco.transferido_a_colmena_id}</Text>}
                    {marco.retirar_a_bodega && <Text style={styles.marcoTransferencia}>Retirado a bodega</Text>}
                  </View>
                )) : <Text style={styles.textoSecundario}>Esta inspección no tiene guardado el detalle por marco.</Text>}

                <Text style={styles.seccion}>Observaciones</Text>
                <Text style={styles.textoSecundario}>{detalle.observaciones.trim() || 'Sin observaciones'}</Text>
              </ScrollView>
              <View style={styles.modalPie}>
                <Pressable style={styles.botonSecundario} onPress={() => setDetalle(null)}>
                  <Text style={styles.botonSecundarioTexto}>Cerrar</Text>
                </Pressable>
                {puedeGestionar(detalle) && detalle.serverId !== null && (
                  <Pressable style={styles.botonPrincipal} onPress={() => void abrirEdicion(detalle)}>
                    <Text style={styles.botonPrincipalTexto}>Editar inspección</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      </Modal>
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
  encabezadoTexto: { gap: 4 },
  volver: { alignSelf: 'flex-start', paddingVertical: 4 },
  volverTexto: { color: COLORS.goldText, fontSize: 13, fontWeight: '800' },
  titulo: { color: COLORS.forest, fontSize: 27, fontWeight: '900' },
  subtitulo: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  botonPrincipal: { backgroundColor: COLORS.gold, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  botonPrincipalTexto: { color: '#35230A', fontSize: 13, fontWeight: '900' },
  input: { minHeight: 46, borderWidth: 1, borderColor: COLORS.borderStrong, borderRadius: 12, backgroundColor: COLORS.surface, paddingHorizontal: 13, color: COLORS.text, fontSize: 13, marginBottom: 12 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  filtroItem: { flexGrow: 1, flexBasis: 150 },
  barraResultados: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 12 },
  contador: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  actualizar: { color: COLORS.goldText, fontSize: 12, fontWeight: '800' },
  listaTarjetas: { gap: 12 },
  tarjeta: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, padding: 15, gap: 11 },
  tarjetaCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  tarjetaTituloGrupo: { flex: 1, gap: 3 },
  codigo: { color: COLORS.forest, fontSize: 16, fontWeight: '900' },
  apiario: { color: COLORS.textSecondary, fontSize: 11 },
  meta: { color: COLORS.textSecondary, fontSize: 10, lineHeight: 15 },
  datosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dato: { flexBasis: '46%', flexGrow: 1, minWidth: 110, gap: 3 },
  datoNombre: { color: COLORS.textMuted, fontSize: 10 },
  datoValor: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  alertaSanitaria: { backgroundColor: COLORS.dangerBg, borderRadius: 9, padding: 9 },
  alertaSanitariaTexto: { color: COLORS.danger, fontSize: 11, fontWeight: '700' },
  textoSecundario: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  observaciones: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 16 },
  pendienteLocal: { backgroundColor: COLORS.goldSoft, padding: 9, borderRadius: 9 },
  pendienteTexto: { color: COLORS.goldText, fontSize: 10, fontWeight: '700' },
  acciones: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  accion: { paddingVertical: 4 },
  accionTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  vacio: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8 },
  vacioTitulo: { color: COLORS.forest, fontSize: 15, fontWeight: '800' },
  vacioTexto: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  aviso: { backgroundColor: COLORS.warningBg, borderColor: COLORS.goldBorder, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  avisoTexto: { color: COLORS.goldText, fontSize: 11, lineHeight: 16 },
  pie: { color: COLORS.textMuted, fontSize: 10, textAlign: 'center', marginTop: 22, lineHeight: 16 },
  cargandoPantalla: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.backgroundSoft, gap: 12 },
  textoCargando: { color: COLORS.textSecondary, fontSize: 13 },
  overlay: { flex: 1, backgroundColor: '#00000077', justifyContent: 'center', alignItems: 'center', padding: 12 },
  modalGrande: { width: '100%', maxWidth: 680, maxHeight: '94%', backgroundColor: COLORS.surface, borderRadius: 18, overflow: 'hidden' },
  modalCabecera: { minHeight: 62, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalTitulo: { color: COLORS.forest, fontSize: 16, fontWeight: '900' },
  modalSubtitulo: { color: COLORS.textSecondary, fontSize: 10, marginTop: 3 },
  cerrar: { color: COLORS.textSecondary, fontSize: 28, lineHeight: 30 },
  modalAyuda: { color: COLORS.textSecondary, fontSize: 12, paddingHorizontal: 16, paddingTop: 13 },
  listaColmenas: { paddingHorizontal: 14, paddingBottom: 12, maxHeight: 500 },
  opcionColmena: { minHeight: 58, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecha: { color: COLORS.goldText, fontSize: 22, fontWeight: '800' },
  detalleScroll: { paddingHorizontal: 16, paddingVertical: 14 },
  seccion: { color: COLORS.forest, fontSize: 14, fontWeight: '900', marginTop: 18, marginBottom: 9 },
  marcoFila: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, marginBottom: 8, gap: 3 },
  marcoTitulo: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  marcoTexto: { color: COLORS.textSecondary, fontSize: 11 },
  marcoTransferencia: { color: COLORS.goldText, fontSize: 10, fontWeight: '700' },
  modalPie: { padding: 12, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  botonSecundario: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: COLORS.borderStrong, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  botonSecundarioTexto: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
});
