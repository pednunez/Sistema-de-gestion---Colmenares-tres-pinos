
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Modal,
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
} from './api/auth';

import type {
  SesionMovil,
} from './api/auth';

import {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  desactivarUsuario,
} from './api/usuarios';

import type {
  UsuarioAPI,
  RolUsuario,
} from './api/usuarios';

// ==========================================
// TIPOS
// ==========================================

type Props = {
  onVolver: () => void;
};

type FiltroRol = 'TODOS' | RolUsuario;

type ModoFormulario = 'CREAR' | 'EDITAR';

// ==========================================
// CONSTANTES
// ==========================================

const FILTROS: FiltroRol[] = [
  'TODOS',
  'ADMIN',
  'APICULTOR',
];

// ==========================================
// UTILIDADES
// ==========================================

function formatearFecha(
  fecha: string
): string {
  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return fecha;
  }

  return valor.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function obtenerNombre(
  usuario: UsuarioAPI
): string {
  return [
    usuario.nombre,
    usuario.apellido ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function obtenerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Ocurrió un error inesperado.';
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function UsuariosLocales({
  onVolver,
}: Props) {

  // ========================================
  // SESION
  // ========================================

  const [sesion, setSesion] =
    useState<SesionMovil | null>(null);

  // ========================================
  // USUARIOS
  // ========================================

  const [usuarios, setUsuarios] =
    useState<UsuarioAPI[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [actualizando, setActualizando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  // ========================================
  // BUSQUEDA Y FILTROS
  // ========================================

  const [busqueda, setBusqueda] =
    useState('');

  const [filtroRol, setFiltroRol] =
    useState<FiltroRol>('TODOS');

  // ========================================
  // DETALLE
  // ========================================

  const [seleccionado, setSeleccionado] =
    useState<UsuarioAPI | null>(null);

  const [detalleCargando, setDetalleCargando] =
    useState(false);

  const [detalleError, setDetalleError] =
    useState<string | null>(null);

  // ========================================
  // FORMULARIO
  // ========================================

  const [modalVisible, setModalVisible] =
    useState(false);

  const [modoFormulario, setModoFormulario] =
    useState<ModoFormulario>('CREAR');

  const [usuarioEditando, setUsuarioEditando] =
    useState<UsuarioAPI | null>(null);

  const [nombre, setNombre] =
    useState('');

  const [apellido, setApellido] =
    useState('');

  const [email, setEmail] =
    useState('');

  const [rol, setRol] =
    useState<RolUsuario>('APICULTOR');

  const [password, setPassword] =
    useState('');

  const [guardando, setGuardando] =
    useState(false);

  // ========================================
  // CARGAR USUARIOS
  // ========================================

  const cargarUsuarios = useCallback(
    async (
      token: string,
      refrescar = false
    ) => {

      if (refrescar) {
        setActualizando(true);
      } else {
        setCargando(true);
      }

      setError(null);

      try {

        const respuesta =
          await listarUsuarios(token);

        setUsuarios(respuesta);

        setSeleccionado((actual) => {
          if (!actual) return null;

          return (
            respuesta.find(
              (u) => u.id === actual.id
            ) ?? null
          );
        });

      } catch (err) {

        setError(obtenerError(err));

      } finally {

        setCargando(false);
        setActualizando(false);

      }

    },
    []
  );

  // ========================================
  // INICIAR MODULO
  // ========================================

  useEffect(() => {

    let activo = true;

    const iniciar = async () => {

      try {

        const guardada =
          await leerSesionGuardada();

        if (!guardada) {
          throw new Error(
            'No se encontró una sesión. Inicia sesión nuevamente.'
          );
        }

        if (guardada.usuario.rol !== 'ADMIN') {
          throw new Error(
            'No tienes permisos para administrar usuarios.'
          );
        }

        if (!activo) return;

        setSesion(guardada);

        const respuesta =
          await listarUsuarios(
            guardada.accessToken
          );

        if (activo) {
          setUsuarios(respuesta);
        }

      } catch (err) {

        if (activo) {
          setError(obtenerError(err));
        }

      } finally {

        if (activo) {
          setCargando(false);
        }

      }

    };

    void iniciar();

    return () => {
      activo = false;
    };

  }, []);

  // ========================================
  // ACTUALIZAR LISTADO
  // ========================================

  const refrescar = useCallback(() => {

    if (!sesion) return;

    void cargarUsuarios(
      sesion.accessToken,
      true
    );

  }, [sesion, cargarUsuarios]);

  // ========================================
  // ESTADISTICAS
  // ========================================

  const totalUsuarios = usuarios.length;

  const totalAdmin = usuarios.filter(
    (u) => u.rol === 'ADMIN'
  ).length;

  const totalApicultores = usuarios.filter(
    (u) => u.rol === 'APICULTOR'
  ).length;

  // ========================================
  // BUSQUEDA Y FILTRADO
  // ========================================

  const usuariosFiltrados = useMemo(() => {

    const texto = busqueda
      .trim()
      .toLowerCase();

    return usuarios.filter((usuario) => {

      const coincideBusqueda =
        !texto ||
        [
          usuario.nombre,
          usuario.apellido ?? '',
          usuario.email,
          String(usuario.id),
        ]
          .join(' ')
          .toLowerCase()
          .includes(texto);

      const coincideRol =
        filtroRol === 'TODOS' ||
        usuario.rol === filtroRol;

      return coincideBusqueda && coincideRol;

    });

  }, [usuarios, busqueda, filtroRol]);

  // ========================================
  // ABRIR DETALLE
  // ========================================

  const abrirDetalle = async (
    usuario: UsuarioAPI
  ) => {

    setSeleccionado(usuario);
    setDetalleError(null);

    if (!sesion) return;

    setDetalleCargando(true);

    try {

      const detalle =
        await obtenerUsuario(
          sesion.accessToken,
          usuario.id
        );

      setSeleccionado(detalle);

    } catch (err) {

      setDetalleError(obtenerError(err));

    } finally {

      setDetalleCargando(false);

    }

  };

  // ========================================
  // ABRIR FORMULARIO NUEVO
  // ========================================

  const abrirCrear = () => {

    setModoFormulario('CREAR');
    setUsuarioEditando(null);

    setNombre('');
    setApellido('');
    setEmail('');
    setRol('APICULTOR');
    setPassword('');

    setModalVisible(true);

  };

  // ========================================
  // ABRIR FORMULARIO EDICION
  // ========================================

  const abrirEditar = (
    usuario: UsuarioAPI
  ) => {

    setModoFormulario('EDITAR');
    setUsuarioEditando(usuario);

    setNombre(usuario.nombre);
    setApellido(usuario.apellido ?? '');
    setEmail(usuario.email);
    setRol(usuario.rol);
    setPassword('');

    setModalVisible(true);

  };

  // ========================================
  // CERRAR FORMULARIO
  // ========================================

  const cerrarFormulario = () => {

    if (guardando) return;

    setModalVisible(false);
    setUsuarioEditando(null);
    setPassword('');

  };

  // ========================================
  // GUARDAR USUARIO
  // ========================================

  const guardarUsuario = async () => {

    if (!sesion) return;

    const nombreLimpio = nombre.trim();
    const apellidoLimpio =
      apellido.trim();

    const emailLimpio = email
      .trim()
      .toLowerCase();

    if (nombreLimpio.length < 2) {
      Alert.alert(
        'Nombre inválido',
        'El nombre debe tener al menos 2 caracteres.'
      );
      return;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        emailLimpio
      )
    ) {
      Alert.alert(
        'Correo inválido',
        'Ingresa un correo electrónico válido.'
      );
      return;
    }

    if (
      modoFormulario === 'CREAR' &&
      (password.length < 8 || password.length > 128)
    ) {
      Alert.alert(
        'Contraseña inválida',
        'La contraseña debe tener entre 8 y 128 caracteres.'
      );
      return;
    }

    setGuardando(true);

    try {

      if (modoFormulario === 'CREAR') {

        await crearUsuario(
          sesion.accessToken,
          {
            nombre: nombreLimpio,
            apellido: apellidoLimpio || null,
            email: emailLimpio,
            rol,
            password,
          }
        );

      } else {

        if (!usuarioEditando) {
          throw new Error(
            'No se encontró el usuario que deseas editar.'
          );
        }

        await actualizarUsuario(
          sesion.accessToken,
          usuarioEditando.id,
          {
            nombre: nombreLimpio,
            apellido: apellidoLimpio || null,
            email: emailLimpio,
            rol,
          }
        );

      }

      setModalVisible(false);
      setUsuarioEditando(null);
      setSeleccionado(null);

      await cargarUsuarios(
        sesion.accessToken,
        true
      );

      Alert.alert(
        'Operación exitosa',
        modoFormulario === 'CREAR'
          ? 'El usuario fue creado correctamente.'
          : 'Los datos del usuario fueron actualizados.'
      );

    } catch (err) {

      Alert.alert(
        'No fue posible guardar',
        obtenerError(err)
      );

    } finally {

      setGuardando(false);

    }

  };

  // ========================================
  // DESACTIVAR USUARIO
  // ========================================

  const ejecutarDesactivacion = async (
    usuario: UsuarioAPI
  ) => {

    if (!sesion) return;

    try {

      await desactivarUsuario(
        sesion.accessToken,
        usuario.id
      );

      setUsuarios((actuales) =>
        actuales.filter(
          (u) => u.id !== usuario.id
        )
      );

      setSeleccionado(null);

      Alert.alert(
        'Usuario desactivado',
        'El usuario ya no tendrá acceso al sistema.'
      );

    } catch (err) {

      Alert.alert(
        'No fue posible desactivar',
        obtenerError(err)
      );

    }

  };

  const confirmarDesactivacion = (
    usuario: UsuarioAPI
  ) => {

    Alert.alert(
      'Desactivar usuario',
      `¿Estás seguro de que deseas desactivar a ${obtenerNombre(usuario)}?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Desactivar',
          style: 'destructive',
          onPress: () => {
            void ejecutarDesactivacion(usuario);
          },
        },
      ]
    );

  };

  // ========================================
  // PANTALLA DE CARGA
  // ========================================

  if (cargando) {

    return (
      <View style={styles.estado}>

        <ActivityIndicator
          size="large"
          color="#D99A16"
        />

        <Text style={styles.estadoTexto}>
          Cargando usuarios...
        </Text>

      </View>
    );

  }

  // ========================================
  // INTERFAZ PRINCIPAL
  // ========================================

  return (

    <View style={styles.container}>

      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={refrescar}
            colors={['#D99A16']}
          />
        }
        keyboardShouldPersistTaps="handled"
      >

        {/* CABECERA */}

        <View style={styles.cabecera}>

          <View style={styles.cabeceraSuperior}>

            <Pressable
              style={styles.botonVolver}
              onPress={onVolver}
            >
              <Text style={styles.botonVolverTexto}>
                ← Volver
              </Text>
            </Pressable>

            <View style={styles.adminChip}>
              <Text style={styles.adminChipTexto}>
                ADMINISTRADOR
              </Text>
            </View>

          </View>

          <Text style={styles.titulo}>
            Gestión de usuarios
          </Text>

          <Text style={styles.subtitulo}>
            Administra las cuentas, permisos y roles
            de los integrantes de Colmenares Tres Pinos.
          </Text>

        </View>

        {/* ERROR GENERAL */}

        {error && (

          <View style={styles.errorCard}>

            <Text style={styles.errorTitulo}>
              No fue posible cargar los usuarios
            </Text>

            <Text style={styles.errorTexto}>
              {error}
            </Text>

            <Pressable
              style={styles.botonReintentar}
              onPress={() => {
                if (sesion) {
                  void cargarUsuarios(
                    sesion.accessToken
                  );
                }
              }}
            >
              <Text style={styles.botonReintentarTexto}>
                Reintentar
              </Text>
            </Pressable>

          </View>

        )}

        {/* ESTADISTICAS */}

        <Text style={styles.seccionTitulo}>
          Resumen de usuarios
        </Text>

        <View style={styles.resumenGrid}>

          <View style={styles.resumenCard}>
            <Text style={styles.resumenNumero}>
              {totalUsuarios}
            </Text>
            <Text style={styles.resumenEtiqueta}>
              Usuarios activos
            </Text>
          </View>

          <View style={styles.resumenCard}>
            <Text style={[
              styles.resumenNumero,
              { color: '#1D4ED8' },
            ]}>
              {totalAdmin}
            </Text>
            <Text style={styles.resumenEtiqueta}>
              Administradores
            </Text>
          </View>

          <View style={styles.resumenCard}>
            <Text style={[
              styles.resumenNumero,
              { color: '#15803D' },
            ]}>
              {totalApicultores}
            </Text>
            <Text style={styles.resumenEtiqueta}>
              Apicultores
            </Text>
          </View>

        </View>

        {/* LISTADO */}

        <View style={styles.seccionCabecera}>

          <Text style={styles.seccionTitulo}>
            Usuarios registrados
          </Text>

          <Pressable
            style={styles.botonNuevo}
            onPress={abrirCrear}
          >
            <Text style={styles.botonNuevoTexto}>
              + Nuevo usuario
            </Text>
          </Pressable>

        </View>

        {/* BUSCADOR */}

        <TextInput
          style={styles.busqueda}
          placeholder="Buscar por nombre, correo o ID..."
          placeholderTextColor="#94A3B8"
          value={busqueda}
          onChangeText={setBusqueda}
          autoCapitalize="none"
        />

        {/* FILTROS */}

        <Text style={styles.filtroTitulo}>
          Filtrar por rol
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtros}
        >

          {FILTROS.map((filtro) => (

            <Pressable
              key={filtro}
              onPress={() => setFiltroRol(filtro)}
              style={[
                styles.filtroBoton,
                filtroRol === filtro &&
                  styles.filtroActivo,
              ]}
            >

              <Text
                style={[
                  styles.filtroTexto,
                  filtroRol === filtro &&
                    styles.filtroTextoActivo,
                ]}
              >
                {filtro === 'TODOS'
                  ? 'Todos'
                  : filtro}
              </Text>

            </Pressable>

          ))}

        </ScrollView>

        {/* DETALLE */}

        {seleccionado && (

          <View style={styles.detalleCard}>

            <View style={styles.detalleCabecera}>

              <Text style={styles.detalleTitulo}>
                Detalle del usuario #{seleccionado.id}
              </Text>

              <Pressable
                style={styles.cerrarDetalle}
                onPress={() => {
                  setSeleccionado(null);
                  setDetalleError(null);
                }}
              >
                <Text style={styles.cerrarDetalleTexto}>
                  ✕
                </Text>
              </Pressable>

            </View>

            {detalleCargando ? (

              <ActivityIndicator
                color="#D99A16"
                style={{ marginVertical: 18 }}
              />

            ) : (

              <>

                <Text style={styles.detalleDato}>
                  Nombre
                </Text>

                <Text style={styles.detalleValor}>
                  {obtenerNombre(seleccionado)}
                </Text>

                <Text style={styles.detalleDato}>
                  Correo electrónico
                </Text>

                <Text style={styles.detalleValor}>
                  {seleccionado.email}
                </Text>

                <Text style={styles.detalleDato}>
                  Rol
                </Text>

                <Text style={styles.detalleValor}>
                  {seleccionado.rol}
                </Text>

                <Text style={styles.detalleDato}>
                  Estado
                </Text>

                <Text style={styles.detalleValor}>
                  {seleccionado.activo
                    ? 'Activo'
                    : 'Inactivo'}
                </Text>

                <Text style={styles.detalleDato}>
                  Fecha de creación
                </Text>

                <Text style={styles.detalleValor}>
                  {formatearFecha(
                    seleccionado.fecha_creacion
                  )}
                </Text>

                <Text style={styles.detalleDato}>
                  Última actualización
                </Text>

                <Text style={styles.detalleValor}>
                  {formatearFecha(
                    seleccionado.fecha_actualizacion
                  )}
                </Text>

                {detalleError && (
                  <Text style={styles.errorTexto}>
                    {detalleError}
                  </Text>
                )}

                <View style={styles.detalleAcciones}>

                  <Pressable
                    style={styles.botonEditar}
                    onPress={() => {
                      abrirEditar(seleccionado);
                    }}
                  >
                    <Text style={styles.botonEditarTexto}>
                      Editar usuario
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.botonDesactivar}
                    onPress={() => {
                      confirmarDesactivacion(
                        seleccionado
                      );
                    }}
                  >
                    <Text style={styles.botonDesactivarTexto}>
                      Desactivar
                    </Text>
                  </Pressable>

                </View>

              </>

            )}

          </View>

        )}

        {/* RESULTADOS */}

        {!error && usuariosFiltrados.length === 0 ? (

          <View style={styles.vacioCard}>

            <Text style={styles.vacioIcono}>
              👥
            </Text>

            <Text style={styles.vacioTitulo}>
              No hay usuarios
            </Text>

            <Text style={styles.vacioTexto}>
              No encontramos usuarios con los
              filtros seleccionados.
            </Text>

          </View>

        ) : (

          usuariosFiltrados.map((usuario) => (

            <Pressable
              key={usuario.id}
              style={styles.usuarioCard}
              onPress={() => {
                void abrirDetalle(usuario);
              }}
            >

              <View style={styles.usuarioSuperior}>

                <View style={{ flex: 1 }}>

                  <Text style={styles.usuarioNombre}>
                    {obtenerNombre(usuario)}
                  </Text>

                  <Text style={styles.usuarioEmail}>
                    {usuario.email}
                  </Text>

                </View>

                <View
                  style={[
                    styles.rolBadge,
                    usuario.rol === 'ADMIN'
                      ? styles.rolBadgeAdmin
                      : styles.rolBadgeApicultor,
                  ]}
                >

                  <Text style={styles.rolTexto}>
                    {usuario.rol}
                  </Text>

                </View>

              </View>

              <View style={styles.usuarioMeta}>

                <Text style={styles.usuarioMetaTexto}>
                  Usuario #{usuario.id}
                </Text>

                <Text style={styles.usuarioMetaTexto}>
                  Creado: {formatearFecha(
                    usuario.fecha_creacion
                  )}
                </Text>

              </View>

              <Text style={styles.verDetalle}>
                Ver detalles →
              </Text>

            </Pressable>

          ))

        )}

        {/* PIE */}

        <View style={styles.pie}>
          <Text style={styles.pieTexto}>
            Administración de usuarios
            · Colmenares Tres Pinos
          </Text>
        </View>

      </ScrollView>

      {/* ================================== */}
      {/* MODAL CREAR / EDITAR */}
      {/* ================================== */}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={cerrarFormulario}
      >

        <View style={styles.modalFondo}>

          <View style={styles.modalCard}>

            <ScrollView
              keyboardShouldPersistTaps="handled"
            >

              <Text style={styles.modalTitulo}>
                {modoFormulario === 'CREAR'
                  ? 'Crear usuario'
                  : 'Editar usuario'}
              </Text>

              <Text style={styles.modalSubtitulo}>
                {modoFormulario === 'CREAR'
                  ? 'Completa los datos para registrar una nueva cuenta.'
                  : 'Modifica los datos de la cuenta seleccionada.'}
              </Text>

              {/* NOMBRE */}

              <Text style={styles.formLabel}>
                Nombre *
              </Text>

              <TextInput
                style={styles.formInput}
                placeholder="Nombre"
                placeholderTextColor="#94A3B8"
                value={nombre}
                onChangeText={setNombre}
                maxLength={100}
              />

              {/* APELLIDO */}

              <Text style={styles.formLabel}>
                Apellido
              </Text>

              <TextInput
                style={styles.formInput}
                placeholder="Apellido"
                placeholderTextColor="#94A3B8"
                value={apellido}
                onChangeText={setApellido}
                maxLength={100}
              />

              {/* CORREO */}

              <Text style={styles.formLabel}>
                Correo electrónico *
              </Text>

              <TextInput
                style={styles.formInput}
                placeholder="correo@ejemplo.cl"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={150}
              />

              {/* CONTRASEÑA */}

              {modoFormulario === 'CREAR' && (

                <>

                  <Text style={styles.formLabel}>
                    Contraseña *
                  </Text>

                  <TextInput
                    style={styles.formInput}
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    maxLength={128}
                  />

                </>

              )}

              {/* ROL */}

              <Text style={styles.formLabel}>
                Rol del usuario *
              </Text>

              <View style={styles.rolOpciones}>

                {(['ADMIN', 'APICULTOR'] as RolUsuario[]).map(
                  (opcion) => (

                    <Pressable
                      key={opcion}
                      onPress={() => setRol(opcion)}
                      style={[
                        styles.rolOpcion,
                        rol === opcion &&
                          styles.rolOpcionActivo,
                      ]}
                    >

                      <Text
                        style={[
                          styles.rolOpcionTexto,
                          rol === opcion &&
                            styles.rolOpcionTextoActivo,
                        ]}
                      >
                        {opcion}
                      </Text>

                    </Pressable>

                  )
                )}

              </View>

              {/* BOTONES */}

              <View style={styles.modalFooter}>

                <Pressable
                  style={styles.botonCancelar}
                  onPress={cerrarFormulario}
                  disabled={guardando}
                >
                  <Text style={styles.botonCancelarTexto}>
                    Cancelar
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.botonGuardar,
                    guardando && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    void guardarUsuario();
                  }}
                  disabled={guardando}
                >

                  {guardando ? (

                    <ActivityIndicator color="#FFFFFF" />

                  ) : (

                    <Text style={styles.botonGuardarTexto}>
                      {modoFormulario === 'CREAR'
                        ? 'Crear usuario'
                        : 'Guardar cambios'}
                    </Text>

                  )}

                </Pressable>

              </View>

            </ScrollView>

          </View>

        </View>

      </Modal>

    </View>

  );

}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  contenido: {
    padding: 18,
    paddingBottom: 35,
  },

  cabecera: {
    marginBottom: 25,
  },

  cabeceraSuperior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  botonVolver: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  botonVolverTexto: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },

  adminChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },

  adminChipTexto: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '800',
  },

  titulo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
  },

  subtitulo: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 7,
    lineHeight: 21,
  },

  seccionTitulo: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },

  resumenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 27,
  },

  resumenCard: {
    flex: 1,
    minWidth: '28%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 90,
    justifyContent: 'center',
  },

  resumenNumero: {
    fontSize: 27,
    fontWeight: '900',
    color: '#0F172A',
  },

  resumenEtiqueta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },

  seccionCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },

  botonNuevo: {
    backgroundColor: '#172554',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
  },

  botonNuevoTexto: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  busqueda: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 17,
  },

  filtroTitulo: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },

  filtros: {
    gap: 8,
    paddingBottom: 18,
  },

  filtroBoton: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },

  filtroActivo: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },

  filtroTexto: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },

  filtroTextoActivo: {
    color: '#FFFFFF',
  },

  usuarioCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 15,
    marginBottom: 11,
  },

  usuarioSuperior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },

  usuarioNombre: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
  },

  usuarioEmail: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 6,
  },

  rolBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },

  rolBadgeAdmin: {
    backgroundColor: '#DBEAFE',
  },

  rolBadgeApicultor: {
    backgroundColor: '#DCFCE7',
  },

  rolTexto: {
    fontSize: 10,
    color: '#334155',
    fontWeight: '900',
  },

  usuarioMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 13,
  },

  usuarioMetaTexto: {
    fontSize: 10,
    color: '#64748B',
  },

  verDetalle: {
    fontSize: 12,
    color: '#B7791F',
    fontWeight: '800',
    marginTop: 13,
  },

  detalleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 16,
    marginBottom: 20,
  },

  detalleCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },

  detalleTitulo: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },

  cerrarDetalle: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cerrarDetalleTexto: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '800',
  },

  detalleDato: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '800',
    marginTop: 12,
  },

  detalleValor: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 4,
  },

  detalleAcciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 20,
  },

  botonEditar: {
    flex: 1,
    backgroundColor: '#172554',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  botonEditarTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

  botonDesactivar: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  botonDesactivarTexto: {
    color: '#B91C1C',
    fontWeight: '800',
    fontSize: 12,
  },

  vacioCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  vacioIcono: {
    fontSize: 34,
    marginBottom: 12,
  },

  vacioTitulo: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },

  vacioTexto: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },

  estado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    gap: 15,
  },

  estadoTexto: {
    color: '#64748B',
    fontSize: 13,
  },

  errorCard: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 20,
  },

  errorTitulo: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '900',
  },

  errorTexto: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 9,
    lineHeight: 19,
  },

  botonReintentar: {
    backgroundColor: '#172554',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 17,
  },

  botonReintentarTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  pie: {
    alignItems: 'center',
    paddingVertical: 25,
  },

  pieTexto: {
    color: '#94A3B8',
    fontSize: 10,
  },

  // ========================================
  // MODAL
  // ========================================

  modalFondo: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: 18,
  },

  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    maxHeight: '90%',
  },

  modalTitulo: {
    fontSize: 22,
    color: '#0F172A',
    fontWeight: '900',
  },

  modalSubtitulo: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
    marginBottom: 18,
  },

  formLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 7,
    marginTop: 12,
  },

  formInput: {
    height: 47,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    fontSize: 13,
  },

  rolOpciones: {
    flexDirection: 'row',
    gap: 10,
  },

  rolOpcion: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },

  rolOpcionActivo: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },

  rolOpcionTexto: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },

  rolOpcionTextoActivo: {
    color: '#FFFFFF',
  },

  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 25,
    marginBottom: 5,
  },

  botonCancelar: {
    flex: 1,
    padding: 13,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },

  botonCancelarTexto: {
    color: '#475569',
    fontWeight: '800',
    fontSize: 12,
  },

  botonGuardar: {
    flex: 1,
    padding: 13,
    borderRadius: 10,
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
  },

  botonGuardarTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

});
