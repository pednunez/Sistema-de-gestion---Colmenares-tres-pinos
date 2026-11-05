
import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  crearCaja,
  guardarInspeccionAvanzada,
  limpiarObservacion,
  listarDestinosLocales,
  OPCIONES_MARCOS,
  resumenMarcos,
  validarInspeccionAvanzada,
} from './database/inspeccionesAvanzadas';

import type {
  InspeccionAvanzada,
  MarcoLocal,
  EstadoGeneral,
  Nivel,
  NivelMiel,
  ContenidoMarco,
} from './database/inspeccionesAvanzadas';

import {
  leerSesionGuardada,
} from './api/auth';

import {
  leerCatalogoLocal,
} from './database/catalogo';

// ==========================================
// COLMENARES TRES PINOS
// FORMULARIO DE INSPECCIÓN
// ==========================================

type Props = {
  codigoQR: string;
  onVolver: () => void;

  // Solo se usa en revisiones por grupo.
  onGuardarEnRevision?: (
    datos: InspeccionAvanzada
  ) => Promise<number>;

  onGuardado?: (id: number) => void;
};

type Destino = {
  codigoQR: string;
  etiqueta: string;
};

type Caja = 'camara' | 'alza';

type MarcoActivo = {
  caja: Caja;
  numero: number;
};

// ==========================================
// OPCIONES
// ==========================================

const ESTADOS: {
  valor: EstadoGeneral;
  texto: string;
}[] = [
  { valor: 'COMPLETA', texto: 'Completa' },
  {
    valor: 'EN_DESARROLLO',
    texto: 'En desarrollo',
  },
  { valor: 'DONANTE', texto: 'Donante' },
  { valor: 'DEBIL', texto: 'Débil' },
  {
    valor: 'REQUIERE_REVISION',
    texto: 'Requiere revisión',
  },
];

const NIVELES: {
  valor: Nivel;
  texto: string;
}[] = [
  { valor: 'BAJO', texto: 'Bajo' },
  { valor: 'MEDIO', texto: 'Medio' },
  { valor: 'ALTO', texto: 'Alto' },
];

const NIVELES_MIEL: {
  valor: NivelMiel;
  texto: string;
}[] = [
  { valor: 'SIN_MIEL', texto: 'Sin miel' },
  { valor: 'POCA', texto: 'Poca' },
  { valor: 'MEDIA', texto: 'Media' },
  { valor: 'ABUNDANTE', texto: 'Abundante' },
];

// ==========================================
// FORMULARIO VACÍO
// ==========================================

function formularioVacio(
  codigoQR: string
): InspeccionAvanzada {
  return {
    codigoQR,
    estadoGeneral: null,
    reinaObservada: null,
    presenciaCria: null,
    postura: null,
    nivelPoblacion: null,
    reservasAlimento: null,
    nivelMiel: null,
    alimentacion: '',
    signosEnfermedad: false,
    enfermedadObservada: '',
    tirasMedicamento: null,
    observaciones: '',
    tieneAlza: false,
    camara: crearCaja(),
    alza: crearCaja(),
  };
}

// ==========================================
// OPCIÓN SELECCIONABLE
// ==========================================

type OpcionProps = {
  texto: string;
  activa: boolean;
  onPress: () => void;
  disabled?: boolean;
};

function Opcion({
  texto,
  activa,
  onPress,
  disabled = false,
}: OpcionProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.opcion,
        activa && styles.opcionActiva,
        disabled && styles.deshabilitado,
      ]}
    >
      <Text
        style={[
          styles.opcionTexto,
          activa && styles.opcionTextoActivo,
        ]}
      >
        {activa ? '● ' : '○ '}
        {texto}
      </Text>
    </Pressable>
  );
}

// ==========================================
// FORMULARIO PRINCIPAL
// ==========================================

export default function FormularioInspeccion({
  codigoQR,
  onVolver,
  onGuardarEnRevision,
  onGuardado,
}: Props) {
  const [datos, setDatos] =
    useState<InspeccionAvanzada>(
      () => formularioVacio(codigoQR)
    );

  const [destinos, setDestinos] =
    useState<Destino[]>([]);

  const [errorCatalogo, setErrorCatalogo] =
    useState('');

  const [cargandoCatalogo, setCargandoCatalogo] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [marcoActivo, setMarcoActivo] =
    useState<MarcoActivo>({
      caja: 'camara',
      numero: 1,
    });

  const bloqueo = useRef(false);

  const esRevision = Boolean(
    onGuardarEnRevision
  );

  // ========================================
  // REINICIAR AL CAMBIAR DE COLMENA
  // ========================================

  useEffect(() => {
    setDatos(formularioVacio(codigoQR));

    setMarcoActivo({
      caja: 'camara',
      numero: 1,
    });
  }, [codigoQR]);

  // ========================================
  // CARGAR DESTINOS OFICIALES
  // ========================================

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      setCargandoCatalogo(true);
      setErrorCatalogo('');

      try {
        const codigos =
          await listarDestinosLocales(
            codigoQR
          );

        const sesion =
          await leerSesionGuardada();

        const catalogo = sesion
          ? await leerCatalogoLocal(
              sesion.usuario.id
            )
          : null;

        const opciones: Destino[] =
          codigos.map(codigo => {
            const colmena =
              catalogo?.colmenas.find(
                item =>
                  item.codigo_qr
                    .toLowerCase() ===
                  codigo.toLowerCase()
              );

            const apiario =
              catalogo?.apiarios.find(
                item =>
                  item.id ===
                  colmena?.apiario_id
              );

            return {
              codigoQR: codigo,
              etiqueta:
                colmena
                  ? `${colmena.codigo} · ${
                      apiario?.nombre ??
                      'Apiario'
                    }`
                  : codigo,
            };
          });

        if (activo) {
          setDestinos(opciones);
        }
      } catch (error) {
        if (!activo) return;

        setDestinos([]);

        setErrorCatalogo(
          error instanceof Error
            ? error.message
            : 'No se pudo cargar el catálogo.'
        );
      } finally {
        if (activo) {
          setCargandoCatalogo(false);
        }
      }
    };

    void cargar();

    return () => {
      activo = false;
    };
  }, [codigoQR]);

  // ========================================
  // MODIFICAR DATOS GENERALES
  // ========================================

  const cambiar = <
    K extends keyof InspeccionAvanzada
  >(
    campo: K,
    valor: InspeccionAvanzada[K]
  ) => {
    setDatos(actual => ({
      ...actual,
      [campo]: valor,
    }));
  };

  // ========================================
  // MODIFICAR UN MARCO
  // ========================================

  const cambiarMarco = (
    caja: Caja,
    numero: number,
    cambios: Partial<MarcoLocal>
  ) => {
    setDatos(actual => ({
      ...actual,

      [caja]: actual[caja].map(marco =>
        marco.numero === numero
          ? {
              ...marco,
              ...cambios,
            }
          : marco
      ),
    }));
  };

  // ========================================
  // SELECCIONAR CONTENIDO DE MARCO
  // ========================================

  const seleccionarContenido = (
    contenido: ContenidoMarco
  ) => {
    cambiarMarco(
      marcoActivo.caja,
      marcoActivo.numero,
      contenido === 'SIN_MARCO'
        ? {
            contenido,
            transferir: false,
            destino: '',
          }
        : {
            contenido,
          }
    );
  };

  // ========================================
  // MOSTRAR U OCULTAR ALZA
  // ========================================

  const cambiarAlza = (
    tieneAlza: boolean
  ) => {
    setDatos(actual => ({
      ...actual,
      tieneAlza,
      alza: tieneAlza
        ? actual.alza
        : crearCaja(),
    }));

    if (!tieneAlza) {
      setMarcoActivo({
        caja: 'camara',
        numero: 1,
      });
    }
  };

  // ========================================
  // MARCO ACTUAL
  // ========================================

  const marcoSeleccionado =
    datos[marcoActivo.caja].find(
      marco =>
        marco.numero === marcoActivo.numero
    );

  const resumen = resumenMarcos(datos);

  // ========================================
  // GUARDAR
  // ========================================

  const guardar = async () => {
    if (bloqueo.current) {
      return;
    }

    bloqueo.current = true;
    setGuardando(true);

    try {
      if (!codigoQR.trim()) {
        throw new Error(
          'No hay una colmena seleccionada.'
        );
      }

      if (cargandoCatalogo) {
        throw new Error(
          'El catálogo todavía se está cargando.'
        );
      }

      if (errorCatalogo) {
        throw new Error(
          'Necesitas una sesión y un catálogo oficial para guardar esta inspección.'
        );
      }

      // Validar antes de guardar.
      validarInspeccionAvanzada(
        datos,
        destinos.map(
          destino => destino.codigoQR
        )
      );

      // Inspección normal:
      // guardarInspeccionAvanzada()
      //
      // Revisión por grupo:
      // onGuardarEnRevision()
      //
      // Solo se ejecuta una de las dos.
      const id = onGuardarEnRevision
        ? await onGuardarEnRevision(datos)
        : await guardarInspeccionAvanzada(
            datos
          );

      Alert.alert(
        'Inspección guardada',
        esRevision
          ? 'La inspección quedó guardada y vinculada a la revisión. Continuaremos con la siguiente colmena disponible.'
          : 'La inspección quedó guardada en SQLite, pendiente de sincronización.',
        [
          {
            text: esRevision
              ? 'Guardar y siguiente'
              : 'Aceptar',
            onPress: () => {
              if (onGuardado) {
                onGuardado(id);
              } else {
                onVolver();
              }
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error
          ? error.message
          : 'Ocurrió un error desconocido.'
      );
    } finally {
      bloqueo.current = false;
      setGuardando(false);
    }
  };

  // ========================================
  // BOTONES DE RESPUESTA BOOLEANA
  // ========================================

  const opcionesSiNo = (
    valor: boolean | null,
    onChange: (
      siguiente: boolean | null
    ) => void
  ) => (
    <View style={styles.fila}>
      <Opcion
        texto="Sí"
        activa={valor === true}
        onPress={() => onChange(true)}
      />

      <Opcion
        texto="No"
        activa={valor === false}
        onPress={() => onChange(false)}
      />

      <Opcion
        texto="Sin evaluar"
        activa={valor === null}
        onPress={() => onChange(null)}
      />
    </View>
  );

  // ========================================
  // CAMPOS DE MARCOS
  // ========================================

  const mostrarCaja = (
    caja: Caja,
    titulo: string
  ) => (
    <View style={styles.tarjeta}>
      <Text style={styles.tituloSeccion}>
        {titulo}
      </Text>

      <Text style={styles.ayuda}>
        Selecciona una posición y registra
        el contenido observado.
      </Text>

      <View style={styles.mallaMarcos}>
        {datos[caja].map(marco => {
          const activa =
            marcoActivo.caja === caja &&
            marcoActivo.numero === marco.numero;

          const completo =
            marco.contenido !== '';

          return (
            <Pressable
              key={`${caja}-${marco.numero}`}
              onPress={() =>
                setMarcoActivo({
                  caja,
                  numero: marco.numero,
                })
              }
              style={[
                styles.numeroMarco,
                completo &&
                  styles.numeroMarcoCompleto,
                activa &&
                  styles.numeroMarcoActivo,
              ]}
            >
              <Text
                style={[
                  styles.numeroMarcoTexto,
                  activa &&
                    styles.numeroMarcoTextoActivo,
                ]}
              >
                {marco.numero}
              </Text>

              <Text
                style={[
                  styles.numeroMarcoEstado,
                  activa &&
                    styles.numeroMarcoTextoActivo,
                ]}
              >
                {marco.contenido === ''
                  ? '○'
                  : marco.contenido ===
                      'SIN_MARCO'
                    ? '−'
                    : '✓'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {marcoActivo.caja === caja &&
        marcoSeleccionado && (
          <View style={styles.detalleMarco}>
            <Text style={styles.subtitulo}>
              Posición {
                marcoSeleccionado.numero
              }
            </Text>

            <Text style={styles.label}>
              Contenido del marco *
            </Text>

            <View style={styles.fila}>
              {OPCIONES_MARCOS.map(opcion => (
                <Opcion
                  key={opcion.valor}
                  texto={opcion.texto}
                  activa={
                    marcoSeleccionado.contenido ===
                    opcion.valor
                  }
                  onPress={() =>
                    seleccionarContenido(
                      opcion.valor
                    )
                  }
                />
              ))}
            </View>

            {marcoSeleccionado.contenido !==
              '' &&
              marcoSeleccionado.contenido !==
                'SIN_MARCO' && (
                <>
                  <Text style={styles.label}>
                    ¿Transferir este marco?
                  </Text>

                  <View style={styles.fila}>
                    <Opcion
                      texto="No"
                      activa={
                        !marcoSeleccionado.transferir
                      }
                      onPress={() =>
                        cambiarMarco(
                          caja,
                          marcoSeleccionado.numero,
                          {
                            transferir: false,
                            destino: '',
                          }
                        )
                      }
                    />

                    <Opcion
                      texto="Sí"
                      activa={
                        marcoSeleccionado.transferir
                      }
                      onPress={() =>
                        cambiarMarco(
                          caja,
                          marcoSeleccionado.numero,
                          {
                            transferir: true,
                          }
                        )
                      }
                    />
                  </View>
                </>
              )}

            {marcoSeleccionado.transferir && (
              <>
                <Text style={styles.label}>
                  Colmena de destino *
                </Text>

                {destinos.length === 0 ? (
                  <Text style={styles.avisoTexto}>
                    No hay destinos oficiales
                    disponibles.
                  </Text>
                ) : (
                  destinos.map(destino => (
                    <Opcion
                      key={destino.codigoQR}
                      texto={destino.etiqueta}
                      activa={
                        marcoSeleccionado.destino ===
                        destino.codigoQR
                      }
                      onPress={() =>
                        cambiarMarco(
                          caja,
                          marcoSeleccionado.numero,
                          {
                            destino:
                              destino.codigoQR,
                          }
                        )
                      }
                    />
                  ))
                )}
              </>
            )}
          </View>
        )}
    </View>
  );

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      <Pressable
        disabled={guardando}
        onPress={onVolver}
      >
        <Text style={styles.enlace}>
          ‹ Volver
        </Text>
      </Pressable>

      <Text style={styles.titulo}>
        {esRevision
          ? 'Inspección de grupo'
          : 'Nueva inspección'}
      </Text>

      <View style={styles.tarjeta}>
        <Text style={styles.label}>
          Código QR de la colmena
        </Text>

        <Text style={styles.codigo}>
          {codigoQR}
        </Text>

        <Text style={styles.ayuda}>
          Los datos se guardan en el
          teléfono. La sincronización
          se realizará posteriormente.
        </Text>

        {cargandoCatalogo && (
          <ActivityIndicator
            color="#D99A24"
          />
        )}

        {!!errorCatalogo && (
          <Text style={styles.avisoTexto}>
            {errorCatalogo}
          </Text>
        )}
      </View>

      {/* ESTADO GENERAL */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Estado general *
        </Text>

        <View style={styles.fila}>
          {ESTADOS.map(estado => (
            <Opcion
              key={estado.valor}
              texto={estado.texto}
              activa={
                datos.estadoGeneral ===
                estado.valor
              }
              onPress={() =>
                cambiar(
                  'estadoGeneral',
                  estado.valor
                )
              }
            />
          ))}
        </View>
      </View>

      {/* REINA Y CRÍA */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Evaluación de la colmena
        </Text>

        <Text style={styles.label}>
          ¿Se observó la reina?
        </Text>

        {opcionesSiNo(
          datos.reinaObservada,
          valor =>
            cambiar(
              'reinaObservada',
              valor
            )
        )}

        <Text style={styles.label}>
          ¿Hay presencia de cría?
        </Text>

        {opcionesSiNo(
          datos.presenciaCria,
          valor =>
            cambiar(
              'presenciaCria',
              valor
            )
        )}

        <Text style={styles.label}>
          ¿Hay postura?
        </Text>

        {opcionesSiNo(
          datos.postura,
          valor =>
            cambiar(
              'postura',
              valor
            )
        )}
      </View>

      {/* POBLACIÓN Y ALIMENTO */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Población y reservas
        </Text>

        <Text style={styles.label}>
          Nivel de población
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto="Sin evaluar"
            activa={
              datos.nivelPoblacion === null
            }
            onPress={() =>
              cambiar(
                'nivelPoblacion',
                null
              )
            }
          />

          {NIVELES.map(nivel => (
            <Opcion
              key={nivel.valor}
              texto={nivel.texto}
              activa={
                datos.nivelPoblacion ===
                nivel.valor
              }
              onPress={() =>
                cambiar(
                  'nivelPoblacion',
                  nivel.valor
                )
              }
            />
          ))}
        </View>

        <Text style={styles.label}>
          Reservas de alimento
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto="Sin evaluar"
            activa={
              datos.reservasAlimento ===
              null
            }
            onPress={() =>
              cambiar(
                'reservasAlimento',
                null
              )
            }
          />

          {NIVELES.map(nivel => (
            <Opcion
              key={nivel.valor}
              texto={nivel.texto}
              activa={
                datos.reservasAlimento ===
                nivel.valor
              }
              onPress={() =>
                cambiar(
                  'reservasAlimento',
                  nivel.valor
                )
              }
            />
          ))}
        </View>

        <Text style={styles.label}>
          Nivel de miel
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto="Sin evaluar"
            activa={
              datos.nivelMiel === null
            }
            onPress={() =>
              cambiar(
                'nivelMiel',
                null
              )
            }
          />

          {NIVELES_MIEL.map(nivel => (
            <Opcion
              key={nivel.valor}
              texto={nivel.texto}
              activa={
                datos.nivelMiel ===
                nivel.valor
              }
              onPress={() =>
                cambiar(
                  'nivelMiel',
                  nivel.valor
                )
              }
            />
          ))}
        </View>

        <Text style={styles.label}>
          Alimentación suministrada
        </Text>

        <TextInput
          style={styles.input}
          value={datos.alimentacion}
          maxLength={500}
          multiline
          placeholder="Opcional"
          onChangeText={valor =>
            cambiar(
              'alimentacion',
              limpiarObservacion(
                valor,
                500
              )
            )
          }
        />
      </View>

      {/* SALUD */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Evaluación sanitaria
        </Text>

        <Text style={styles.label}>
          ¿Hay signos de enfermedad?
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto="No"
            activa={
              !datos.signosEnfermedad
            }
            onPress={() =>
              setDatos(actual => ({
                ...actual,
                signosEnfermedad: false,
                enfermedadObservada: '',
                tirasMedicamento: null,
              }))
            }
          />

          <Opcion
            texto="Sí"
            activa={
              datos.signosEnfermedad
            }
            onPress={() =>
              cambiar(
                'signosEnfermedad',
                true
              )
            }
          />
        </View>

        {datos.signosEnfermedad && (
          <>
            <Text style={styles.label}>
              Enfermedad o signos observados *
            </Text>

            <TextInput
              style={styles.input}
              value={
                datos.enfermedadObservada
              }
              maxLength={500}
              multiline
              placeholder="Describe lo observado"
              onChangeText={valor =>
                cambiar(
                  'enfermedadObservada',
                  limpiarObservacion(
                    valor,
                    500
                  )
                )
              }
            />

            <Text style={styles.label}>
              Tiras de medicamento
            </Text>

            <View style={styles.fila}>
              {[null, 1, 2, 3].map(
                cantidad => (
                  <Opcion
                    key={
                      cantidad === null
                        ? 'ninguna'
                        : String(cantidad)
                    }
                    texto={
                      cantidad === null
                        ? 'Sin registrar'
                        : String(cantidad)
                    }
                    activa={
                      datos.tirasMedicamento ===
                      cantidad
                    }
                    onPress={() =>
                      cambiar(
                        'tirasMedicamento',
                        cantidad
                      )
                    }
                  />
                )
              )}
            </View>
          </>
        )}
      </View>

      {/* CÁMARAS */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Configuración de cajas
        </Text>

        <Text style={styles.label}>
          ¿La colmena tiene alza?
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto="No"
            activa={!datos.tieneAlza}
            onPress={() =>
              cambiarAlza(false)
            }
          />

          <Opcion
            texto="Sí"
            activa={datos.tieneAlza}
            onPress={() =>
              cambiarAlza(true)
            }
          />
        </View>
      </View>

      {mostrarCaja(
        'camara',
        'Cámara de cría · 10 posiciones'
      )}

      {datos.tieneAlza &&
        mostrarCaja(
          'alza',
          'Alza · 10 posiciones'
        )}

      {/* RESUMEN */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Resumen automático
        </Text>

        <View style={styles.resumen}>
          <View>
            <Text style={styles.resumenNumero}>
              {resumen.total}
            </Text>
            <Text style={styles.ayuda}>
              Marcos
            </Text>
          </View>

          <View>
            <Text style={styles.resumenNumero}>
              {resumen.cria}
            </Text>
            <Text style={styles.ayuda}>
              Con cría
            </Text>
          </View>

          <View>
            <Text style={styles.resumenNumero}>
              {resumen.miel}
            </Text>
            <Text style={styles.ayuda}>
              Con miel
            </Text>
          </View>

          <View>
            <Text style={styles.resumenNumero}>
              {resumen.transferencias}
            </Text>
            <Text style={styles.ayuda}>
              Transferencias
            </Text>
          </View>
        </View>

        <Text style={styles.ayuda}>
          Posiciones sin registrar: {
            resumen.sinRegistrar
          }
        </Text>
      </View>

      {/* OBSERVACIONES */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Observaciones generales
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.area,
          ]}
          value={datos.observaciones}
          maxLength={1000}
          multiline
          textAlignVertical="top"
          placeholder="Escribe tus observaciones"
          onChangeText={valor =>
            cambiar(
              'observaciones',
              limpiarObservacion(
                valor,
                1000
              )
            )
          }
        />
      </View>

      {/* GUARDAR */}

      <Pressable
        style={[
          styles.botonGuardar,
          guardando &&
            styles.deshabilitado,
        ]}
        disabled={guardando}
        onPress={() =>
          void guardar()
        }
      >
        <Text style={styles.botonTexto}>
          {guardando
            ? 'Guardando...'
            : esRevision
              ? 'Guardar y siguiente'
              : 'Guardar inspección'}
        </Text>
      </Pressable>

      <Text style={styles.pie}>
        Colmenares Tres Pinos ·
        Registro local SQLite
      </Text>
    </ScrollView>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  contenido: {
    padding: 18,
    paddingTop: 60,
    paddingBottom: 55,
  },

  titulo: {
    fontSize: 26,
    fontWeight: '800',
    color: '#172337',
    marginBottom: 18,
  },

  tituloSeccion: {
    fontSize: 18,
    fontWeight: '800',
    color: '#172337',
    marginBottom: 12,
  },

  subtitulo: {
    fontSize: 15,
    fontWeight: '800',
    color: '#172337',
    marginBottom: 10,
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 15,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
    marginBottom: 8,
  },

  codigo: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
    marginVertical: 8,
  },

  ayuda: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
  },

  fila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },

  opcion: {
    borderWidth: 1,
    borderColor: '#D6C29E',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 11,
    marginBottom: 5,
  },

  opcionActiva: {
    borderColor: '#D99A24',
    backgroundColor: '#FEF3C7',
  },

  opcionTexto: {
    color: '#775315',
    fontWeight: '600',
    fontSize: 13,
  },

  opcionTextoActivo: {
    fontWeight: '800',
  },

  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 13,
    color: '#172337',
    fontSize: 14,
    minHeight: 48,
  },

  area: {
    minHeight: 110,
  },

  mallaMarcos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },

  numeroMarco: {
    width: '17%',
    minHeight: 57,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  numeroMarcoCompleto: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },

  numeroMarcoActivo: {
    backgroundColor: '#D99A24',
    borderColor: '#92400E',
  },

  numeroMarcoTexto: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },

  numeroMarcoTextoActivo: {
    color: '#FFFFFF',
  },

  numeroMarcoEstado: {
    fontSize: 12,
    color: '#475569',
  },

  detalleMarco: {
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  resumen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },

  resumenNumero: {
    fontSize: 23,
    fontWeight: '800',
    color: '#92400E',
    textAlign: 'center',
  },

  enlace: {
    color: '#92400E',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 20,
  },

  avisoTexto: {
    color: '#B45309',
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 10,
  },

  botonGuardar: {
    backgroundColor: '#D99A24',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginVertical: 12,
  },

  botonTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  deshabilitado: {
    opacity: 0.5,
  },

  pie: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});
