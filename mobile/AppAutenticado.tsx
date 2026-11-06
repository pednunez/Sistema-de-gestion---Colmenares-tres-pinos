
import React, { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import App from './App';
import Login from './Login';

import {
  iniciarSesion,
  leerSesionGuardada,
  salirDeEsteDispositivo,
  tokenVigente,
  verificarUsuario,
} from './api/auth';

import type { SesionMovil } from './api/auth';

import { ErrorAPI } from './api/cliente';

import {
  descargarCatalogo,
  leerCatalogoLocal,
} from './database/catalogo';

// ==========================================
// COLMENARES TRES PINOS
// AUTENTICACION Y CATALOGO MOVIL
// ==========================================

type EstadoAplicacion =
  | 'CARGANDO'
  | 'LOGIN'
  | 'AUTENTICADO'
  | 'SIN_CONEXION';

// ==========================================
// DESCARGAR CATALOGO DESDE FASTAPI
// ==========================================

async function actualizarCatalogo(
  sesion: SesionMovil
): Promise<string> {
  try {
    // GET /movil/catalogo
    // La funcion valida y guarda en SQLite.
    await descargarCatalogo(sesion);

    return '';

  } catch (error) {

    // Si el servidor rechaza la sesión,
    // no debemos ignorar ese rechazo.
    if (
      error instanceof ErrorAPI &&
      (error.estado === 401 || error.estado === 403)
    ) {
      throw error;
    }

    // Comprobar si existe un catálogo
    // previamente descargado.
    const catalogoLocal =
      await leerCatalogoLocal(
        sesion.usuario.id
      ).catch(() => null);

    if (
      error instanceof ErrorAPI &&
      error.estado === 404
    ) {
      return (
        'El servidor todavía no tiene disponible ' +
        '/movil/catalogo. Se necesita la versión ' +
        'actualizada de la API.'
      );
    }

    if (catalogoLocal) {
      return (
        'No se pudo actualizar el catálogo. ' +
        'Se conserva la última versión guardada ' +
        'en SQLite.'
      );
    }

    return (
      'No se pudo descargar el catálogo oficial. ' +
      'Todavía no hay colmenas oficiales ' +
      'disponibles sin conexión.'
    );
  }
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function AppAutenticado() {

  const [estado, setEstado] =
    useState<EstadoAplicacion>('CARGANDO');

  const [sesion, setSesion] =
    useState<SesionMovil | null>(null);

  const [mensajeLogin, setMensajeLogin] =
    useState('');

  const [avisoCatalogo, setAvisoCatalogo] =
    useState('');

  // ========================================
  // RECUPERAR SESION AL ABRIR EXPO
  // ========================================

  useEffect(() => {

    let activo = true;

    const recuperarSesion = async () => {

      try {
        const guardada =
          await leerSesionGuardada();

        if (!activo) return;

        if (!guardada) {
          setEstado('LOGIN');
          return;
        }

        // No permitir una sesión vencida.
        if (!tokenVigente(guardada)) {

          await salirDeEsteDispositivo();

          if (!activo) return;

          setMensajeLogin(
            'Tu sesión ha vencido. ' +
            'Debes iniciar sesión nuevamente.'
          );

          setEstado('LOGIN');
          return;
        }

        // Verificar usuario con FastAPI.
        try {
          await verificarUsuario(guardada);

        } catch (error) {

          if (!activo) return;

          // Token rechazado.
          if (
            error instanceof ErrorAPI &&
            (
              error.estado === 401 ||
              error.estado === 403
            )
          ) {

            await salirDeEsteDispositivo();

            if (!activo) return;

            setSesion(null);
            setMensajeLogin(
              'Tu sesión ya no es válida. ' +
              'Inicia sesión nuevamente.'
            );

            setEstado('LOGIN');
            return;
          }

          // Servidor inaccesible.
          if (
            error instanceof ErrorAPI &&
            error.estado === 0 &&
            tokenVigente(guardada)
          ) {

            const local =
              await leerCatalogoLocal(
                guardada.usuario.id
              ).catch(() => null);

            if (!activo) return;

            setSesion(guardada);

            setAvisoCatalogo(
              local
                ? 'Se utilizará el catálogo local guardado.'
                : 'No hay un catálogo oficial descargado.'
            );

            setEstado('SIN_CONEXION');
            return;
          }

          setMensajeLogin(
            'No se pudo verificar la sesión. ' +
            'Intenta iniciar sesión nuevamente.'
          );

          setEstado('LOGIN');
          return;
        }

        // ====================================
        // SESION VALIDA: DESCARGAR CATALOGO
        // ====================================

        let aviso = '';

        try {
          aviso = await actualizarCatalogo(
            guardada
          );

        } catch (error) {

          if (
            error instanceof ErrorAPI &&
            (
              error.estado === 401 ||
              error.estado === 403
            )
          ) {

            await salirDeEsteDispositivo();

            if (!activo) return;

            setSesion(null);
            setMensajeLogin(
              'El servidor rechazó tu sesión. ' +
              'Debes iniciar sesión nuevamente.'
            );

            setEstado('LOGIN');
            return;
          }

          aviso =
            'No se pudo comprobar el catálogo oficial.';
        }

        if (!activo) return;

        setSesion(guardada);
        setAvisoCatalogo(aviso);
        setEstado('AUTENTICADO');

      } catch {

        if (!activo) return;

        setMensajeLogin(
          'No se pudo recuperar la sesión guardada.'
        );

        setEstado('LOGIN');
      }
    };

    void recuperarSesion();

    return () => {
      activo = false;
    };

  }, []);

  // ========================================
  // INICIAR SESION
  // POST /auth/token
  // ========================================

  const ingresar = async (
    email: string,
    password: string
  ): Promise<void> => {

    // 1. Autenticar con FastAPI.
    const nuevaSesion = await iniciarSesion(
      email,
      password
    );

    // 2. Descargar catálogo oficial.
    let aviso = '';

    try {

      aviso = await actualizarCatalogo(
        nuevaSesion
      );

    } catch (error) {

      // No permitir una sesión rechazada.
      await salirDeEsteDispositivo();

      if (
        error instanceof ErrorAPI &&
        (
          error.estado === 401 ||
          error.estado === 403
        )
      ) {
        throw new Error(
          'El servidor rechazó la sesión al ' +
          'consultar el catálogo.'
        );
      }

      throw error;
    }

    // 3. Abrir la aplicación.
    setSesion(nuevaSesion);
    setMensajeLogin('');
    setAvisoCatalogo(aviso);
    setEstado('AUTENTICADO');
  };

  // ========================================
  // REINTENTAR CONEXION
  // ========================================

  const reintentarConexion = async () => {

    if (!sesion) return;

    setEstado('CARGANDO');

    try {

      // Comprobar sesión antes de consultar.
      await verificarUsuario(sesion);

      // Descargar catálogo nuevamente.
      const aviso = await actualizarCatalogo(
        sesion
      );

      setAvisoCatalogo(aviso);
      setEstado('AUTENTICADO');

    } catch (error) {

      // Token vencido o rechazado.
      if (
        !tokenVigente(sesion) ||
        (
          error instanceof ErrorAPI &&
          (
            error.estado === 401 ||
            error.estado === 403
          )
        )
      ) {

        try {
          await salirDeEsteDispositivo();
        } catch {
          // No habilitar sesión inválida.
        }

        setSesion(null);
        setMensajeLogin(
          'Tu sesión ya no es válida. ' +
          'Inicia sesión nuevamente.'
        );

        setEstado('LOGIN');
        return;
      }

      // Sin acceso al servidor.
      if (
        error instanceof ErrorAPI &&
        error.estado === 0
      ) {

        setEstado('SIN_CONEXION');

        Alert.alert(
          'Sin conexión',
          'FastAPI no está disponible. ' +
          'Tus registros locales se conservan.'
        );

        return;
      }

      setEstado('SIN_CONEXION');

      Alert.alert(
        'No se pudo verificar',
        'No fue posible comprobar el servidor.'
      );
    }
  };

  // ========================================
  // CERRAR SESION LOCAL
  // ========================================

  const cerrarSesion = () => {

    Alert.alert(
      'Cerrar sesión',
      'Se cerrará la sesión en este dispositivo. ' +
      'Los registros SQLite no se eliminarán.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Cerrar sesión',
          style: 'destructive',

          onPress: () => {

            void (async () => {

              try {

                await salirDeEsteDispositivo();

                setSesion(null);
                setAvisoCatalogo('');
                setMensajeLogin('');
                setEstado('LOGIN');

              } catch {

                Alert.alert(
                  'Error',
                  'No fue posible cerrar la sesión.'
                );
              }

            })();
          },
        },
      ]
    );
  };

  // ========================================
  // PANTALLA DE CARGA
  // ========================================

  if (estado === 'CARGANDO') {

    return (
      <View style={styles.cargando}>

        <ActivityIndicator
          size="large"
          color="#D99A24"
        />

        <Text style={styles.cargandoTexto}>
          Comprobando sesión y catálogo...
        </Text>

      </View>
    );
  }

  // ========================================
  // PANTALLA DE LOGIN
  // ========================================

  if (
    estado === 'LOGIN' ||
    !sesion
  ) {

    return (
      <Login
        onIngresar={ingresar}
        mensaje={mensajeLogin}
      />
    );
  }

  // ========================================
  // APLICACION AUTENTICADA
  // ========================================

  return (
    <SafeAreaView style={styles.contenedor}>

      <View style={styles.barraUsuario}>

        <View style={styles.infoUsuario}>

          <Text
            style={styles.nombreUsuario}
            numberOfLines={1}
          >
            {sesion.usuario.nombre}
          </Text>

          <Text style={styles.rolUsuario}>
            {sesion.usuario.rol}
          </Text>

        </View>

        {estado === 'SIN_CONEXION' && (

          <Pressable
            style={styles.botonReintentar}
            onPress={() => {
              void reintentarConexion();
            }}
          >
            <Text style={styles.textoBoton}>
              Reintentar
            </Text>
          </Pressable>

        )}

        <Pressable
          style={styles.botonSalir}
          onPress={cerrarSesion}
        >
          <Text style={styles.textoBoton}>
            Salir
          </Text>
        </Pressable>

      </View>

      {estado === 'SIN_CONEXION' && (

        <View style={styles.avisoOffline}>

          <Text style={styles.textoOffline}>
            Sin conexión con FastAPI.
            Los registros locales se conservan.
            La sincronización automática
            aún está pendiente.
          </Text>

        </View>

      )}

      {avisoCatalogo !== '' && (

        <View style={styles.avisoCatalogo}>

          <Text style={styles.textoAviso}>
            {avisoCatalogo}
          </Text>

        </View>

      )}

      <View style={styles.contenidoApp}>
        <App />
      </View>

    </SafeAreaView>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  contenedor: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  cargando: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cargandoTexto: {
    marginTop: 15,
    fontSize: 14,
    color: '#475569',
  },

  barraUsuario: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 15,
    paddingVertical: 11,
  },

  infoUsuario: {
    flex: 1,
    paddingRight: 10,
  },

  nombreUsuario: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  rolUsuario: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 3,
  },

  botonReintentar: {
    backgroundColor: '#475569',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginRight: 8,
  },

  botonSalir: {
    backgroundColor: '#92400E',
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  textoBoton: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  avisoOffline: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },

  textoOffline: {
    color: '#78350F',
    fontSize: 12,
    lineHeight: 18,
  },

  avisoCatalogo: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },

  textoAviso: {
    color: '#9A3412',
    fontSize: 12,
    lineHeight: 18,
  },

  contenidoApp: {
    flex: 1,
  },

});
