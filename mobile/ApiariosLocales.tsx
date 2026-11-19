
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

import {
  listarApiarios,
  crearApiario,
  actualizarApiario,
  darDeBajaApiario,
} from './api/apiarios';

import type { Apiario } from './api/apiarios';

// ==========================================
// PROPS
// ==========================================

type Props = {
  onVolver: () => void;
};

type ModoModal = 'crear' | 'editar' | 'detalle' | null;

// ==========================================
// VALIDAR SESION Y ROL
// ==========================================

async function obtenerTokenAdmin(): Promise<string> {
  const sesion = await leerSesionGuardada();

  if (!sesion || !tokenVigente(sesion)) {
    throw new Error(
      'Tu sesión ha vencido. Inicia sesión nuevamente.'
    );
  }

  if (sesion.usuario.rol !== 'ADMIN') {
    throw new Error(
      'No tienes permisos para administrar apiarios.'
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

function formatearFecha(fecha?: string | null): string {
  if (!fecha) return 'No disponible';

  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return fecha;
  }

  return valor.toLocaleDateString('es-CL');
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function ApiariosLocales({
  onVolver,
}: Props) {

  const [apiarios, setApiarios] = useState<Apiario[]>([]);

  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [procesandoId, setProcesandoId] =
    useState<number | null>(null);

  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [modal, setModal] = useState<ModoModal>(null);
  const [seleccionado, setSeleccionado] =
    useState<Apiario | null>(null);

  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [descripcion, setDescripcion] = useState('');

  // ========================================
  // CARGAR APIARIOS
  // ========================================

  const cargarApiarios = useCallback(
    async (inicial = false) => {

      if (inicial) {
        setCargando(true);
      } else {
        setActualizando(true);
      }

      try {
        const token = await obtenerTokenAdmin();

        const resultado = await listarApiarios(token);

        setApiarios(resultado);
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

  useEffect(() => {
    void cargarApiarios(true);
  }, [cargarApiarios]);

  // ========================================
  // BUSQUEDA
  // ========================================

  const apiariosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();

    if (!termino) return apiarios;

    return apiarios.filter(item =>
      item.nombre.toLowerCase().includes(termino) ||
      (item.ubicacion ?? '')
        .toLowerCase()
        .includes(termino)
    );
  }, [apiarios, busqueda]);

  const activos = apiarios.filter(
    item => item.activo
  ).length;

  const inactivos = apiarios.length - activos;

  // ========================================
  // ABRIR MODALES
  // ========================================

  const abrirCrear = () => {
    setSeleccionado(null);
    setNombre('');
    setUbicacion('');
    setDescripcion('');
    setModal('crear');
  };

  const abrirEditar = (item: Apiario) => {
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

  const cerrarModal = () => {
    if (guardando) return;

    setModal(null);
    setSeleccionado(null);
  };

  // ========================================
  // CREAR Y EDITAR
  // ========================================

  const guardarApiario = async () => {

    const nombreLimpio = nombre.trim();
    const ubicacionLimpia = ubicacion.trim();
    const descripcionLimpia = descripcion.trim();

    if (nombreLimpio.length < 2) {
      Alert.alert(
        'Nombre inválido',
        'El nombre debe tener al menos 2 caracteres.'
      );
      return;
    }

    if (nombreLimpio.length > 100) {
      Alert.alert(
        'Nombre inválido',
        'El nombre no puede superar los 100 caracteres.'
      );
      return;
    }

    if (ubicacionLimpia.length > 255) {
      Alert.alert(
        'Ubicación inválida',
        'La ubicación no puede superar los 255 caracteres.'
      );
      return;
    }

    setGuardando(true);

    try {
      const token = await obtenerTokenAdmin();

      const datos = {
        nombre: nombreLimpio,
        ubicacion: ubicacionLimpia || null,
        descripcion: descripcionLimpia || null,
      };

      if (modal === 'editar' && seleccionado) {

        await actualizarApiario(
          seleccionado.id,
          datos,
          token
        );

      } else {

        await crearApiario(datos, token);

      }

      setModal(null);
      setSeleccionado(null);

      await cargarApiarios(false);

      Alert.alert(
        'Operación exitosa',
        modal === 'editar'
          ? 'El apiario se actualizó correctamente.'
          : 'El apiario se creó correctamente.'
      );

    } catch (err) {

      Alert.alert(
        'Error',
        obtenerMensaje(err)
      );

    } finally {
      setGuardando(false);
    }
  };

  // ========================================
  // DAR DE BAJA
  // ========================================

  const ejecutarBaja = async (item: Apiario) => {

    setProcesandoId(item.id);

    try {
      const token = await obtenerTokenAdmin();

      await darDeBajaApiario(
        item.id,
        token
      );

      await cargarApiarios(false);

      Alert.alert(
        'Apiario dado de baja',
        'El registro histórico se ha conservado.'
      );

    } catch (err) {

      Alert.alert(
        'No se pudo dar de baja',
        obtenerMensaje(err)
      );

    } finally {
      setProcesandoId(null);
    }
  };

  const confirmarBaja = (item: Apiario) => {

    Alert.alert(
      'Dar de baja apiario',
      `¿Estás seguro de dar de baja "${item.nombre}"?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Dar de baja',
          style: 'destructive',
          onPress: () => {
            void ejecutarBaja(item);
          },
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
        <ActivityIndicator
          size="large"
          color={COLORS.gold}
        />

        <Text style={styles.secundario}>
          Cargando apiarios...
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
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={() => {
              void cargarApiarios(false);
            }}
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
          Apiarios
        </Text>

        <Text style={styles.subtitulo}>
          Administración y gestión de apiarios
        </Text>

        {/* RESUMEN */}

        <View style={styles.resumen}>

          <View style={styles.resumenCard}>
            <Text style={styles.numero}>
              {apiarios.length}
            </Text>
            <Text style={styles.resumenTexto}>
              Registrados
            </Text>
          </View>

          <View style={styles.resumenCard}>
            <Text style={[styles.numero, styles.verde]}>
              {activos}
            </Text>
            <Text style={styles.resumenTexto}>
              Activos
            </Text>
          </View>

          <View style={styles.resumenCard}>
            <Text style={[styles.numero, styles.naranja]}>
              {inactivos}
            </Text>
            <Text style={styles.resumenTexto}>
              Inactivos
            </Text>
          </View>

        </View>

        {/* CREAR */}

        <Pressable
          style={styles.botonNuevo}
          onPress={abrirCrear}
        >
          <Text style={styles.botonNuevoTexto}>
            + Registrar nuevo apiario
          </Text>
        </Pressable>

        {/* BUSCADOR */}

        <TextInput
          style={styles.buscador}
          placeholder="Buscar por nombre o ubicación..."
          placeholderTextColor={COLORS.textMuted}
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
        />

        {/* ERROR */}

        {!!error && (
          <View style={styles.errorCaja}>
            <Text style={styles.errorTexto}>
              {error}
            </Text>

            <Pressable
              onPress={() => {
                void cargarApiarios(false);
              }}
            >
              <Text style={styles.reintentar}>
                Reintentar
              </Text>
            </Pressable>
          </View>
        )}

        {/* LISTADO */}

        <Text style={styles.seccion}>
          Apiarios registrados
        </Text>

        {apiariosFiltrados.length === 0 ? (

          <View style={styles.vacio}>
            <Text style={styles.vacioIcono}>
              🌿
            </Text>

            <Text style={styles.vacioTitulo}>
              No hay apiarios
            </Text>

            <Text style={styles.secundario}>
              {busqueda
                ? 'No encontramos coincidencias.'
                : 'Todavía no existen apiarios registrados.'}
            </Text>
          </View>

        ) : (

          apiariosFiltrados.map(item => (

            <View
              key={item.id}
              style={styles.tarjeta}
            >

              <View style={styles.fila}>

                <View style={styles.icono}>
                  <Text style={styles.iconoTexto}>
                    🌿
                  </Text>
                </View>

                <View style={styles.info}>
                  <Text style={styles.nombre}>
                    {item.nombre}
                  </Text>

                  <Text style={styles.ubicacion}>
                    {item.ubicacion || 'Sin ubicación registrada'}
                  </Text>
                </View>

                <View style={[
                  styles.estado,
                  item.activo
                    ? styles.estadoActivo
                    : styles.estadoInactivo,
                ]}>
                  <Text style={[
                    styles.estadoTexto,
                    item.activo
                      ? styles.textoActivo
                      : styles.textoInactivo,
                  ]}>
                    {item.activo ? 'Activo' : 'Inactivo'}
                  </Text>
                </View>

              </View>

              {!!item.descripcion && (
                <Text style={styles.descripcion}>
                  {item.descripcion}
                </Text>
              )}

              <Text style={styles.fecha}>
                Registrado: {formatearFecha(item.fecha_creacion)}
              </Text>

              <View style={styles.acciones}>

                <Pressable
                  style={styles.botonDetalle}
                  onPress={() => abrirDetalle(item)}
                >
                  <Text style={styles.textoDetalle}>
                    Ver detalle
                  </Text>
                </Pressable>

                {item.activo && (
                  <>
                    <Pressable
                      style={styles.botonEditar}
                      onPress={() => abrirEditar(item)}
                    >
                      <Text style={styles.textoEditar}>
                        Editar
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.botonBaja}
                      disabled={procesandoId === item.id}
                      onPress={() => confirmarBaja(item)}
                    >
                      {procesandoId === item.id ? (
                        <ActivityIndicator color={COLORS.danger} />
                      ) : (
                        <Text style={styles.textoBaja}>
                          Baja
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}

              </View>

            </View>

          ))
        )}

      </ScrollView>

      {/* ====================================
          MODAL
      ==================================== */}

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

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >

              <Text style={styles.modalTitulo}>
                {modal === 'crear'
                  ? 'Nuevo apiario'
                  : modal === 'editar'
                    ? 'Editar apiario'
                    : 'Detalle del apiario'}
              </Text>

              {modal === 'detalle' && seleccionado ? (

                <>
                  <Text style={styles.label}>Nombre</Text>
                  <Text style={styles.valor}>
                    {seleccionado.nombre}
                  </Text>

                  <Text style={styles.label}>Ubicación</Text>
                  <Text style={styles.valor}>
                    {seleccionado.ubicacion || 'No registrada'}
                  </Text>

                  <Text style={styles.label}>Descripción</Text>
                  <Text style={styles.valor}>
                    {seleccionado.descripcion || 'Sin descripción'}
                  </Text>

                  <Text style={styles.label}>Estado</Text>
                  <Text style={styles.valor}>
                    {seleccionado.activo ? 'Activo' : 'Inactivo'}
                  </Text>

                  <Text style={styles.label}>
                    Fecha de creación
                  </Text>
                  <Text style={styles.valor}>
                    {formatearFecha(seleccionado.fecha_creacion)}
                  </Text>

                  <Text style={styles.label}>
                    Última actualización
                  </Text>
                  <Text style={styles.valor}>
                    {formatearFecha(seleccionado.fecha_actualizacion)}
                  </Text>

                  {!!seleccionado.fecha_eliminacion && (
                    <>
                      <Text style={styles.label}>
                        Fecha de baja
                      </Text>
                      <Text style={styles.valor}>
                        {formatearFecha(seleccionado.fecha_eliminacion)}
                      </Text>
                    </>
                  )}
                </>

              ) : (

                <>

                  <Text style={styles.label}>
                    Nombre del apiario *
                  </Text>

                  <TextInput
                    style={styles.input}
                    value={nombre}
                    onChangeText={setNombre}
                    placeholder="Ej. Apiario Melipilla"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={100}
                  />

                  <Text style={styles.label}>
                    Ubicación
                  </Text>

                  <TextInput
                    style={styles.input}
                    value={ubicacion}
                    onChangeText={setUbicacion}
                    placeholder="Comuna, sector o dirección"
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={255}
                  />

                  <Text style={styles.label}>
                    Descripción
                  </Text>

                  <TextInput
                    style={[styles.input, styles.multilinea]}
                    value={descripcion}
                    onChangeText={setDescripcion}
                    placeholder="Información adicional"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                    numberOfLines={4}
                  />

                  <Text style={styles.ayuda}>
                    Los campos marcados con * son obligatorios.
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
                    Cerrar
                  </Text>
                </Pressable>

                {(modal === 'crear' || modal === 'editar') && (

                  <Pressable
                    style={styles.botonGuardar}
                    onPress={() => {
                      void guardarApiario();
                    }}
                    disabled={guardando}
                  >
                    {guardando ? (
                      <ActivityIndicator color={COLORS.forest} />
                    ) : (
                      <Text style={styles.textoGuardar}>
                        {modal === 'editar'
                          ? 'Guardar cambios'
                          : 'Crear apiario'}
                      </Text>
                    )}
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
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  contenedor: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  contenido: {
    padding: 18,
    paddingBottom: 40,
  },

  cargando: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
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
    marginVertical: 18,
  },

  resumenCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    padding: 13,
    marginRight: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  numero: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.forest,
  },

  resumenTexto: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 5,
  },

  verde: {
    color: COLORS.success,
  },

  naranja: {
    color: COLORS.warning,
  },

  botonNuevo: {
    backgroundColor: COLORS.gold,
    borderRadius: 11,
    padding: 15,
    alignItems: 'center',
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
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.forest,
    marginVertical: 17,
  },

  tarjeta: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    padding: 15,
    marginBottom: 13,
  },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  icono: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: COLORS.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  iconoTexto: {
    fontSize: 21,
  },

  info: {
    flex: 1,
  },

  nombre: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.forest,
  },

  ubicacion: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  estado: {
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  estadoActivo: {
    backgroundColor: COLORS.successBg,
  },

  estadoInactivo: {
    backgroundColor: COLORS.background,
  },

  estadoTexto: {
    fontSize: 10,
    fontWeight: '800',
  },

  textoActivo: {
    color: COLORS.successDeep,
  },

  textoInactivo: {
    color: COLORS.textSecondary,
  },

  descripcion: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },

  fecha: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 12,
  },

  acciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },

  botonDetalle: {
    backgroundColor: COLORS.infoBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    marginRight: 7,
    marginBottom: 5,
  },

  textoDetalle: {
    color: COLORS.info,
    fontSize: 12,
    fontWeight: '700',
  },

  botonEditar: {
    backgroundColor: COLORS.goldSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    marginRight: 7,
    marginBottom: 5,
  },

  textoEditar: {
    color: COLORS.goldText,
    fontSize: 12,
    fontWeight: '700',
  },

  botonBaja: {
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 9,
    marginBottom: 5,
  },

  textoBaja: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },

  vacio: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
  },

  vacioIcono: {
    fontSize: 32,
    marginBottom: 10,
  },

  vacioTitulo: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.forest,
    marginBottom: 6,
  },

  secundario: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 7,
    textAlign: 'center',
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
    fontSize: 13,
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
    padding: 18,
  },

  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    maxHeight: '90%',
  },

  modalTitulo: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.forest,
    marginBottom: 15,
  },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 13,
    marginBottom: 7,
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

  multilinea: {
    minHeight: 95,
    textAlignVertical: 'top',
  },

  valor: {
    backgroundColor: COLORS.backgroundSoft,
    padding: 12,
    borderRadius: 9,
    color: COLORS.forest,
    fontSize: 14,
  },

  ayuda: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 10,
  },

  accionesModal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 22,
  },

  botonCancelar: {
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 9,
  },

  textoCancelar: {
    color: COLORS.text,
    fontWeight: '700',
  },

  botonGuardar: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 125,
    alignItems: 'center',
  },

  textoGuardar: {
    color: COLORS.forest,
    fontWeight: '800',
  },

});
