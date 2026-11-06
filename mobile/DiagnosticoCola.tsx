
import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  consultarResumenCola,
  listarColaRevisiones,
  prepararColaRevisiones,
} from './sincronizacion/colaRevisiones';

import type {
  OperacionEnCola,
  ResumenColaRevisiones,
} from './sincronizacion/colaRevisiones';

import {
  generarPlanRevisiones,
} from './sincronizacion/planificadorRevisiones';

// ==========================================
// COLMENARES TRES PINOS
// DIAGNÓSTICO VISUAL DE SINCRONIZACIÓN
// ==========================================
//
// SOLO PARA DESARROLLO
//
// No envía datos a FastAPI.
// No cambia el estado de inspecciones.
// No modifica revisiones oficiales.
//
// El botón "Preparar cola" solamente
// actualiza la cola local en SQLite.
// ==========================================

type Props = {
  children: React.ReactNode;
};

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Error desconocido.';
}

function nombreOperacion(
  tipo: OperacionEnCola['tipo']
): string {
  switch (tipo) {
    case 'CREAR_SESION':
      return 'Crear sesión de revisión';

    case 'ENVIAR_INSPECCION':
      return 'Enviar inspección';

    case 'OMITIR_COLMENA':
      return 'Registrar omisión';

    case 'FINALIZAR_SESION':
      return 'Finalizar revisión';
  }
}

// ==========================================
// COMPONENTE
// ==========================================

export default function DiagnosticoCola({
  children,
}: Props) {

  const [abierto, setAbierto] =
    useState(false);

  const [cargando, setCargando] =
    useState(false);

  const [resumen, setResumen] =
    useState<ResumenColaRevisiones | null>(
      null
    );

  const [operaciones, setOperaciones] =
    useState<OperacionEnCola[]>([]);

  const [problemas, setProblemas] =
    useState<string[]>([]);

  const [error, setError] =
    useState('');

  const [mensaje, setMensaje] =
    useState('');

  // ========================================
  // CONSULTAR / PREPARAR COLA
  // ========================================

  const cargar = useCallback(
    async (
      preparar: boolean
    ) => {

      setCargando(true);
      setError('');

      try {

        // Consultar no cambia la cola.
        //
        // Preparar sí actualiza las
        // operaciones locales, pero
        // NO realiza envíos al servidor.

        const resultado = preparar
          ? await prepararColaRevisiones()
          : await consultarResumenCola();

        const items =
          await listarColaRevisiones();

        setResumen(resultado);
        setOperaciones(items);

        // Obtener los problemas desde
        // el planificador existente.
        if (
          resultado.estado ===
          'PREPARADA'
        ) {
          const plan =
            await generarPlanRevisiones();

          const errores =
            plan.planes.flatMap(
              revision =>
                revision.problemas.map(
                  problema =>
                    `Revisión ${problema.revisionLocalId}: ${problema.mensaje}`
                )
            );

          setProblemas(errores);
        } else {
          setProblemas([]);
        }

        setMensaje(
          preparar
            ? 'Cola local preparada. No se enviaron registros.'
            : 'Diagnóstico local actualizado.'
        );

      } catch (e) {

        setError(
          mensajeError(e)
        );

      } finally {
        setCargando(false);
      }
    },
    []
  );

  // ========================================
  // ACTUALIZAR AL ABRIR
  // ========================================

  useEffect(() => {
    if (abierto) {
      void cargar(false);
    }
  }, [abierto, cargar]);

  // ========================================
  // ESTADO DE SESIÓN
  // ========================================

  const sinSesion =
    resumen?.estado === 'SIN_SESION';

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <View style={styles.contenedor}>

      {/* APP EXISTENTE */}

      {children}

      {/* BOTÓN FLOTANTE DE DESARROLLO */}

      <Pressable
        style={styles.botonFlotante}
        onPress={() =>
          setAbierto(true)
        }
      >
        <Text style={styles.botonFlotanteTexto}>
          🛠️ COLA
        </Text>
      </Pressable>

      {/* PANTALLA DE DIAGNÓSTICO */}

      <Modal
        visible={abierto}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() =>
          setAbierto(false)
        }
      >
        <View style={styles.pantalla}>

          <StatusBar
            barStyle="dark-content"
          />

          <ScrollView
            contentContainerStyle={
              styles.contenido
            }
          >

            {/* CABECERA */}

            <Pressable
              style={styles.volver}
              onPress={() =>
                setAbierto(false)
              }
            >
              <Text style={styles.volverTexto}>
                ‹ Volver a la app
              </Text>
            </Pressable>

            <Text style={styles.titulo}>
              🛠️ Diagnóstico de cola
            </Text>

            <Text style={styles.subtitulo}>
              Colmenares Tres Pinos
            </Text>

            <View style={styles.aviso}>
              <Text style={styles.avisoTitulo}>
                Modo seguro de desarrollo
              </Text>

              <Text style={styles.avisoTexto}>
                Este módulo solo consulta y
                prepara operaciones locales
                en SQLite.

                {'\n\n'}

                Los envíos reales a FastAPI
                permanecen desactivados.
              </Text>
            </View>

            {/* ACCIONES */}

            <Pressable
              style={[
                styles.boton,
                cargando &&
                  styles.deshabilitado,
              ]}
              disabled={cargando}
              onPress={() =>
                void cargar(false)
              }
            >
              <Text style={styles.botonTexto}>
                Actualizar diagnóstico
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.botonSecundario,
                cargando &&
                  styles.deshabilitado,
              ]}
              disabled={cargando}
              onPress={() =>
                void cargar(true)
              }
            >
              <Text style={styles.textoSecundario}>
                Preparar cola SQLite
              </Text>
            </Pressable>

            {cargando && (
              <View style={styles.cargando}>
                <ActivityIndicator
                  size="large"
                  color="#D99A24"
                />

                <Text style={styles.detalle}>
                  Consultando registros locales...
                </Text>
              </View>
            )}

            {!!error && (
              <View style={styles.errorCaja}>
                <Text style={styles.error}>
                  {error}
                </Text>
              </View>
            )}

            {!!mensaje && !cargando && (
              <Text style={styles.mensaje}>
                {mensaje}
              </Text>
            )}

            {/* SESIÓN */}

            {sinSesion && (
              <View style={styles.aviso}>
                <Text style={styles.avisoTitulo}>
                  Sin sesión iniciada
                </Text>

                <Text style={styles.avisoTexto}>
                  Actualmente estamos entrando
                  directamente al menú para
                  desarrollar la app.

                  {'\n\n'}

                  No hay un usuario autenticado.
                  Por seguridad, no podemos
                  mostrar ni preparar operaciones
                  pertenecientes a otros usuarios.
                </Text>
              </View>
            )}

            {/* RESUMEN */}

            {resumen && (
              <View style={styles.tarjeta}>

                <Text style={styles.seccion}>
                  Estado de sincronización
                </Text>

                <Text style={styles.detalle}>
                  Estado: {resumen.estado}
                </Text>

                <Text style={styles.detalle}>
                  Revisiones analizadas: {
                    resumen.revisionesAnalizadas
                  }
                </Text>

                <Text style={styles.detalle}>
                  Operaciones pendientes: {
                    resumen.operacionesPendientes
                  }
                </Text>

                <Text style={styles.detalle}>
                  Operaciones confirmadas: {
                    resumen.operacionesConfirmadas
                  }
                </Text>

                <Text style={styles.detalle}>
                  Operaciones con error: {
                    resumen.operacionesConError
                  }
                </Text>

                <Text style={styles.detalle}>
                  Problemas del último plan: {
                    problemas.length
                  }
                </Text>

                <Text style={styles.envios}>
                  Envíos reales: DESACTIVADOS
                </Text>
              </View>
            )}

            {/* OPERACIONES */}

            <Text style={styles.seccionExterior}>
              Operaciones en cola
            </Text>

            {operaciones.length === 0 ? (
              <View style={styles.tarjeta}>
                <Text style={styles.detalle}>
                  No hay operaciones activas
                  disponibles para mostrar.
                </Text>
              </View>
            ) : (
              operaciones.map(
                operacion => (
                  <View
                    key={operacion.clave}
                    style={styles.tarjeta}
                  >
                    <Text
                      style={styles.operacionTitulo}
                    >
                      {nombreOperacion(
                        operacion.tipo
                      )}
                    </Text>

                    <Text style={styles.detalle}>
                      Estado: {
                        operacion.estado
                      }
                    </Text>

                    <Text style={styles.detalle}>
                      Revisión local: {
                        operacion.revision_local_id
                      }
                    </Text>

                    <Text style={styles.detalle}>
                      Grupo: {
                        operacion.grupo_id
                      }
                    </Text>

                    {operacion.colmena_id !==
                      null && (
                      <Text style={styles.detalle}>
                        Colmena: {
                          operacion.colmena_id
                        }
                      </Text>
                    )}

                    {operacion.inspeccion_local_id !==
                      null && (
                      <Text style={styles.detalle}>
                        Inspección local: {
                          operacion.inspeccion_local_id
                        }
                      </Text>
                    )}

                    <Text style={styles.detalle}>
                      Intentos: {
                        operacion.intentos
                      }
                    </Text>

                    {!!operacion.ultimo_error && (
                      <Text style={styles.error}>
                        Último error: {
                          operacion.ultimo_error
                        }
                      </Text>
                    )}

                    <Text style={styles.clave}>
                      {operacion.clave}
                    </Text>
                  </View>
                )
              )
            )}

            {/* PROBLEMAS */}

            {problemas.length > 0 && (
              <>
                <Text style={styles.seccionExterior}>
                  Problemas detectados
                </Text>

                {problemas.map(
                  (problema, indice) => (
                    <View
                      key={indice}
                      style={styles.errorCaja}
                    >
                      <Text style={styles.error}>
                        {problema}
                      </Text>
                    </View>
                  )
                )}
              </>
            )}

            {/* PIE */}

            <Text style={styles.pie}>
              Diagnóstico local de desarrollo
              {'\n'}
              Expo + SQLite
              {'\n'}
              Sin envío HTTP
            </Text>

          </ScrollView>
        </View>
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
  },

  botonFlotante: {
    position: 'absolute',
    right: 15,
    bottom: 24,
    zIndex: 100,
    elevation: 10,
    backgroundColor: '#172337',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D99A24',
  },

  botonFlotanteTexto: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  pantalla: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  contenido: {
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === 'ios'
        ? 65
        : 45,
    paddingBottom: 60,
  },

  volver: {
    marginBottom: 24,
  },

  volverTexto: {
    color: '#92400E',
    fontSize: 15,
    fontWeight: '700',
  },

  titulo: {
    fontSize: 25,
    fontWeight: '800',
    color: '#172337',
  },

  subtitulo: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 5,
    marginBottom: 20,
  },

  aviso: {
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#F4D393',
    borderRadius: 12,
    padding: 15,
    marginBottom: 16,
  },

  avisoTitulo: {
    color: '#92400E',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 7,
  },

  avisoTexto: {
    color: '#775315',
    fontSize: 13,
    lineHeight: 20,
  },

  boton: {
    backgroundColor: '#D99A24',
    borderRadius: 11,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },

  botonTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  botonSecundario: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D99A24',
    borderRadius: 11,
    padding: 16,
    alignItems: 'center',
    marginBottom: 15,
  },

  textoSecundario: {
    color: '#92400E',
    fontSize: 15,
    fontWeight: '800',
  },

  deshabilitado: {
    opacity: 0.5,
  },

  cargando: {
    alignItems: 'center',
    padding: 20,
    gap: 10,
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 13,
    padding: 17,
    marginBottom: 12,
  },

  seccion: {
    color: '#172337',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 15,
  },

  seccionExterior: {
    color: '#172337',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 20,
    marginBottom: 12,
  },

  detalle: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 5,
  },

  operacionTitulo: {
    color: '#172337',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },

  clave: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 10,
  },

  envios: {
    color: '#92400E',
    fontWeight: '800',
    fontSize: 13,
    marginTop: 12,
  },

  mensaje: {
    color: '#166534',
    fontSize: 13,
    marginBottom: 14,
  },

  errorCaja: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
  },

  error: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 20,
  },

  pie: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 30,
  },
});
