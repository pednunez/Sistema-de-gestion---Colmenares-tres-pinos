
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { COLORS } from './theme';

import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import App from './App';
import Login from './Login';

import {
  iniciarSesion,
  leerSesionGuardada,
  renovarSesion,
  salirDeEsteDispositivo,
  sesionPuedeMantenerseOffline,
  tokenVigente,
  verificarUsuario,
} from './api/auth';

import type { SesionMovil } from './api/auth';

import { ErrorAPI } from './api/cliente';
import { ejecutarControlador } from './sincronizacion/controlador';

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

  const [catalogoVersion, setCatalogoVersion] =
    useState(0);

  const sesionActivaRef =
    useRef<SesionMovil | null>(null);

  // Renovar el access token antes de que venza mientras la app permanece abierta.
  // Si no hay conexión, se conserva la sesión local y se reintenta más tarde.
  useEffect(() => {
    if (!sesion || !sesionPuedeMantenerseOffline(sesion)) return;

    let cancelado = false;
    let temporizador: ReturnType<typeof setTimeout>;

    const intentarRenovacion = async () => {
      try {
        const renovada = await renovarSesion(sesion);
        if (cancelado) return;
        if (sesionActivaRef.current?.refreshToken !== sesion.refreshToken) return;

        sesionActivaRef.current = renovada;
        setSesion(renovada);
      } catch (error) {
        if (cancelado) return;

        if (error instanceof ErrorAPI && (error.estado === 401 || error.estado === 403)) {
          await salirDeEsteDispositivo().catch(() => undefined);
          if (cancelado) return;
          sesionActivaRef.current = null;
          setSesion(null);
          setMensajeLogin('Tu sesión venció o fue revocada. Inicia sesión nuevamente.');
          setEstado('LOGIN');
          return;
        }

        setEstado('SIN_CONEXION');
        setAvisoCatalogo('Sin conexión con el servidor. Se conservará la información local y se reintentará renovar la sesión.');
        temporizador = setTimeout(() => {
          void intentarRenovacion();
        }, 60_000);
      }
    };

    const espera = Math.max(1000, sesion.expiraEn - Date.now() - 2 * 60 * 1000);
    temporizador = setTimeout(() => {
      void intentarRenovacion();
    }, espera);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [sesion]);

  // La descarga del catálogo nunca debe bloquear la entrada
  // cuando ya existe una sesión válida. Se actualiza en segundo plano.
  const refrescarCatalogoEnSegundoPlano = useCallback(
    (sesionObjetivo: SesionMovil): void => {
      void actualizarCatalogo(sesionObjetivo)
        .then((aviso) => {
          if (
            sesionActivaRef.current?.accessToken !==
            sesionObjetivo.accessToken
          ) {
            return;
          }

          setAvisoCatalogo(aviso);

          if (!aviso) {
            setCatalogoVersion((actual) => actual + 1);

            // El controlador pudo ejecutarse antes de que existiera
            // el catálogo local. Se vuelve a revisar ahora que está listo.
            void ejecutarControlador().catch((error) => {
              console.warn(
                '[Colmenares] No se pudo iniciar la revisión posterior al catálogo:',
                error
              );
            });
          }
        })
        .catch(async (error: unknown) => {
          if (
            sesionActivaRef.current?.accessToken !==
            sesionObjetivo.accessToken
          ) {
            return;
          }

          if (
            error instanceof ErrorAPI &&
            (error.estado === 401 || error.estado === 403)
          ) {
            try {
              await salirDeEsteDispositivo();
            } catch {
              // La sesión local se invalida igualmente en memoria.
            }

            if (
              sesionActivaRef.current?.accessToken !==
              sesionObjetivo.accessToken
            ) {
              return;
            }

            sesionActivaRef.current = null;
            setSesion(null);
            setMensajeLogin(
              'Tu sesión ya no es válida. Inicia sesión nuevamente.'
            );
            setEstado('LOGIN');
            return;
          }

          setAvisoCatalogo(
            'No se pudo actualizar el catálogo. Se conserva la información local disponible.'
          );
        });
    },
    []
  );

  // ========================================
  // RECUPERAR SESIÓN AL ABRIR LA APLICACIÓN
  // ========================================

  useEffect(() => {
    let activo = true;

    const recuperarSesion = async () => {
      try {
        const guardada = await leerSesionGuardada();

        if (!activo) return;

        if (!guardada) {
          sesionActivaRef.current = null;
          setEstado('LOGIN');
          return;
        }

        if (!tokenVigente(guardada)) {
          if (sesionPuedeMantenerseOffline(guardada)) {
            const local = await leerCatalogoLocal(
              guardada.usuario.id
            ).catch(() => null);

            if (!activo) return;
            sesionActivaRef.current = guardada;
            setSesion(guardada);
            setAvisoCatalogo(
              local
                ? 'Sin conexión: la sesión se renovará cuando vuelva Internet. Se utilizará el catálogo local.'
                : 'Sin conexión: la sesión se renovará cuando vuelva Internet. No hay catálogo local disponible.'
            );
            setEstado('SIN_CONEXION');
            return;
          }

          await salirDeEsteDispositivo();
          if (!activo) return;
          sesionActivaRef.current = null;
          setMensajeLogin(
            'Tu sesión ha vencido. Debes iniciar sesión nuevamente.'
          );
          setEstado('LOGIN');
          return;
        }

        try {
          await verificarUsuario(guardada);
        } catch (error) {
          if (!activo) return;

          if (
            error instanceof ErrorAPI &&
            (error.estado === 401 || error.estado === 403)
          ) {
            await salirDeEsteDispositivo();

            if (!activo) return;

            sesionActivaRef.current = null;
            setSesion(null);
            setMensajeLogin(
              'Tu sesión ya no es válida. Inicia sesión nuevamente.'
            );
            setEstado('LOGIN');
            return;
          }

          // Sin internet se permite trabajar con la sesión y el
          // catálogo previamente guardados en el dispositivo.
          if (
            error instanceof ErrorAPI &&
            error.estado === 0 &&
            (tokenVigente(guardada) || sesionPuedeMantenerseOffline(guardada))
          ) {
            const local = await leerCatalogoLocal(
              guardada.usuario.id
            ).catch(() => null);

            if (!activo) return;

            sesionActivaRef.current = guardada;
            setSesion(guardada);
            setAvisoCatalogo(
              local
                ? 'Sin conexión: se utilizará el catálogo local guardado.'
                : 'Sin conexión: todavía no hay un catálogo oficial descargado.'
            );
            setEstado('SIN_CONEXION');
            return;
          }

          sesionActivaRef.current = null;
          setMensajeLogin(
            'No se pudo verificar la sesión. Intenta iniciar sesión nuevamente.'
          );
          setEstado('LOGIN');
          return;
        }

        if (!activo) return;

        // Mostrar la aplicación inmediatamente después de validar
        // la sesión. La descarga grande del catálogo queda en segundo plano.
        sesionActivaRef.current = guardada;
        setSesion(guardada);
        setMensajeLogin('');
        setAvisoCatalogo('');
        setEstado('AUTENTICADO');
        refrescarCatalogoEnSegundoPlano(guardada);
      } catch (error) {
        if (!activo) return;

        console.error(
          '[Colmenares] No se pudo recuperar la sesión:',
          error
        );

        sesionActivaRef.current = null;
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
  }, [refrescarCatalogoEnSegundoPlano]);

  // ========================================
  // INICIAR SESIÓN
  // ========================================

  const ingresar = async (
    email: string,
    password: string,
    mantenerSesion: boolean
  ): Promise<void> => {
    const nuevaSesion = await iniciarSesion(email, password, mantenerSesion);

    sesionActivaRef.current = nuevaSesion;
    setSesion(nuevaSesion);
    setMensajeLogin('');
    setAvisoCatalogo(
      'Actualizando el catálogo en segundo plano...'
    );
    setEstado('AUTENTICADO');

    refrescarCatalogoEnSegundoPlano(nuevaSesion);
  };

  // ========================================
  // REINTENTAR CONEXIÓN
  // ========================================

  const reintentarConexion = async () => {
    if (!sesion) return;

    setEstado('CARGANDO');

    try {
      const sesionActualizada = await leerSesionGuardada();
      if (!sesionActualizada) {
        throw new ErrorAPI(401, 'La sesión ya no es válida.');
      }
      await verificarUsuario(sesionActualizada);

      sesionActivaRef.current = sesionActualizada;
      setSesion(sesionActualizada);
      setAvisoCatalogo(
        'Conexión restablecida. Actualizando el catálogo...'
      );
      setEstado('AUTENTICADO');
      refrescarCatalogoEnSegundoPlano(sesionActualizada);
    } catch (error) {
      if (
        error instanceof ErrorAPI &&
        (error.estado === 401 || error.estado === 403)
      ) {
        try {
          await salirDeEsteDispositivo();
        } catch {
          // No habilitar una sesión inválida.
        }

        sesionActivaRef.current = null;
        setSesion(null);
        setMensajeLogin(
          'Tu sesión ya no es válida. Inicia sesión nuevamente.'
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
          'FastAPI no está disponible. Tus registros locales se conservan.'
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
  // CERRAR SESIÓN LOCAL
  // ========================================

  const cerrarSesion = () => {
    Alert.alert(
      'Cerrar sesión',
      'Se cerrará la sesión en este dispositivo. Los registros SQLite no se eliminarán.',
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

                sesionActivaRef.current = null;
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
          color={COLORS.gold}
        />

        <Text style={styles.cargandoTexto}>
          Comprobando sesión...
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
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.contenedor}>

      <App
        usuario={sesion.usuario}
        sinConexion={estado === 'SIN_CONEXION'}
        avisoCatalogo={avisoCatalogo}
        catalogoVersion={catalogoVersion}
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
    backgroundColor: COLORS.background,
  },

  cargando: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  cargandoTexto: {
    marginTop: 15,
    fontSize: 14,
    color: COLORS.textSecondary,
  },

});
