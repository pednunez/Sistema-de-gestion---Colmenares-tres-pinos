
import React, { useEffect, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
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
    await descargarCatalogo(sesion);
    return '';

  } catch (error) {

    if (
      error instanceof ErrorAPI &&
      (error.estado === 401 || error.estado === 403)
    ) {
      throw error;
    }

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

        // VERIFICAR USUARIO CON FASTAPI
        try {
          await verificarUsuario(guardada);

        } catch (error) {

          if (!activo) return;

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

          // MODO SIN CONEXION
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

        // ACTUALIZAR CATALOGO
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
  // ========================================

  const ingresar = async (
    email: string,
    password: string
  ): Promise<void> => {

    const nuevaSesion = await iniciarSesion(
      email,
      password
    );

    let aviso = '';

    try {

      aviso = await actualizarCatalogo(
        nuevaSesion
      );

    } catch (error) {

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

      await verificarUsuario(sesion);

      const aviso = await actualizarCatalogo(
        sesion
      );

      setAvisoCatalogo(aviso);
      setEstado('AUTENTICADO');

    } catch (error) {

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
          // No habilitar una sesión inválida.
        }

        setSesion(null);

        setMensajeLogin(
          'Tu sesión ya no es válida. ' +
          'Inicia sesión nuevamente.'
        );

        setEstado('LOGIN');
        return;
      }

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
          color="#FBBF24"
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

      <App
        usuario={sesion.usuario}
        sinConexion={estado === 'SIN_CONEXION'}
        avisoCatalogo={avisoCatalogo}
        onReintentarConexion={() => {
          void reintentarConexion();
        }}
        onCerrarSesion={cerrarSesion}
      />

    </SafeAreaView>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  contenedor: {
    flex: 1,
    backgroundColor: '#F1F4FA',
  },

  cargando: {
    flex: 1,
    backgroundColor: '#F1F4FA',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cargandoTexto: {
    marginTop: 15,
    fontSize: 14,
    color: '#475569',
  },

});
