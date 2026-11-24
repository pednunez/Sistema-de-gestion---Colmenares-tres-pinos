import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import { COLORS } from './theme';

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
  cambiarEstadoTratamientoLocal,
  fechaLocalISO,
  guardarTratamientoLocal,
  limpiarTexto,
} from './database/tratamientos';

import {
  leerSesionGuardada,
} from './api/auth';

import {
  leerCatalogoLocal,
} from './database/catalogo';

import type { InspeccionApi } from './api/inspecciones';

import { listarInspeccionesLocales } from './database/inspecciones';
import { ejecutarControlador } from './sincronizacion/controlador';

// ==========================================
// COLMENARES TRES PINOS
// FORMULARIO DE INSPECCIÓN
// ==========================================

type Props = {
  codigoQR: string;
  onVolver: () => void;
  modoModal?: boolean;
  apiarioNombre?: string;
  codigoColmena?: string;
  inspeccionEditar?: InspeccionApi | null;
  onGuardarEdicion?: (datos: InspeccionAvanzada) => Promise<void>;

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

function formularioDesdeInspeccion(
  codigoQR: string,
  inspeccion: InspeccionApi
): InspeccionAvanzada {
  return {
    codigoQR,
    estadoGeneral: (inspeccion.estado_general as EstadoGeneral | null) ?? null,
    reinaObservada: inspeccion.reina_observada,
    presenciaCria: inspeccion.presencia_cria,
    postura: inspeccion.postura,
    nivelPoblacion: (inspeccion.nivel_poblacion as Nivel | null) ?? null,
    reservasAlimento: (inspeccion.reservas_alimento as Nivel | null) ?? null,
    nivelMiel: (inspeccion.miel as NivelMiel | null) ?? null,
    alimentacion: inspeccion.alimentacion_suministrada ?? '',
    signosEnfermedad: Boolean(inspeccion.signos_enfermedad),
    enfermedadObservada: inspeccion.enfermedad_observada ?? '',
    tirasMedicamento: inspeccion.tiras_medicamento,
    observaciones: inspeccion.observaciones ?? '',
    tieneAlza: Boolean(inspeccion.tiene_alza),
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
  modoModal = false,
  apiarioNombre = '',
  codigoColmena = '',
  inspeccionEditar = null,
  onGuardarEdicion,
  onGuardarEnRevision,
  onGuardado,
}: Props) {
  const esEdicion = Boolean(inspeccionEditar);
  const [datos, setDatos] =
    useState<InspeccionAvanzada>(
      () => inspeccionEditar
        ? formularioDesdeInspeccion(codigoQR, inspeccionEditar)
        : formularioVacio(codigoQR)
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

  const [marcoMenuVisible, setMarcoMenuVisible] = useState(false);
  const [cajaCompletarActiva, setCajaCompletarActiva] = useState<Caja | null>(null);
  const [registrarTratamiento, setRegistrarTratamiento] = useState(false);
  const [tratamientoInspeccion, setTratamientoInspeccion] = useState({
    tipoTratamiento: '',
    producto: '',
    dosis: '',
    estado: 'EN_CURSO' as 'EN_CURSO' | 'FINALIZADO',
    observaciones: '',
  });

  const bloqueo = useRef(false);

  const esRevision = Boolean(
    onGuardarEnRevision
  );

  // ========================================
  // REINICIAR AL CAMBIAR DE COLMENA
  // ========================================

  useEffect(() => {
    setDatos(
      inspeccionEditar
        ? formularioDesdeInspeccion(codigoQR, inspeccionEditar)
        : formularioVacio(codigoQR)
    );

    setMarcoActivo({
      caja: 'camara',
      numero: 1,
    });
    setMarcoMenuVisible(false);
    setCajaCompletarActiva(null);
    setRegistrarTratamiento(false);
    setTratamientoInspeccion({
      tipoTratamiento: '',
      producto: '',
      dosis: '',
      estado: 'EN_CURSO',
      observaciones: '',
    });
  }, [codigoQR, inspeccionEditar?.id]);

  // ========================================
  // CARGAR DESTINOS OFICIALES
  // ========================================

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      if (esEdicion) {
        setDestinos([]);
        setErrorCatalogo('');
        setCargandoCatalogo(false);
        return;
      }

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
  }, [codigoQR, esEdicion]);

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

      if (!esEdicion && cargandoCatalogo) {
        throw new Error(
          'El catálogo todavía se está cargando.'
        );
      }

      if (!esEdicion && errorCatalogo) {
        throw new Error(
          'Necesitas una sesión y un catálogo oficial para guardar esta inspección.'
        );
      }

      if (esEdicion) {
        if (!inspeccionEditar || !onGuardarEdicion) {
          throw new Error('No se pudo preparar la edición de esta inspección.');
        }
        if (!datos.estadoGeneral) {
          throw new Error('Selecciona el estado actual de la colmena.');
        }
        await onGuardarEdicion(datos);
      } else {
        validarInspeccionAvanzada(
          datos,
          destinos.map(destino => destino.codigoQR)
        );
      }

      // Las nuevas inspecciones se guardan en SQLite. Las históricas se
      // actualizan mediante PATCH y no generan movimientos de marcos nuevos.
      if (
        modoModal &&
        datos.signosEnfermedad &&
        registrarTratamiento &&
        tratamientoInspeccion.tipoTratamiento.trim().length < 2
      ) {
        throw new Error('Indica el tipo de tratamiento que se aplicó.');
      }

      const id = esEdicion
        ? inspeccionEditar?.id ?? 0
        : onGuardarEnRevision
          ? await onGuardarEnRevision(datos)
          : await guardarInspeccionAvanzada(datos);

      let avisoTratamiento = '';
      if (
        !esEdicion &&
        modoModal &&
        datos.signosEnfermedad &&
        registrarTratamiento
      ) {
        try {
          const tratamientoId = await guardarTratamientoLocal({
            codigoQR,
            inspeccionLocalId: id,
            tipoTratamiento: limpiarTexto(tratamientoInspeccion.tipoTratamiento, 100).trim(),
            producto: limpiarTexto(tratamientoInspeccion.producto, 150).trim(),
            dosis: limpiarTexto(tratamientoInspeccion.dosis, 100).trim() ||
              (datos.tirasMedicamento ? `${datos.tirasMedicamento} ${datos.tirasMedicamento === 1 ? 'tira' : 'tiras'}` : ''),
            motivo: limpiarTexto(datos.enfermedadObservada, 500).trim(),
            fechaInicio: fechaLocalISO(),
            fechaFin: null,
            estado: 'EN_CURSO',
            observaciones: limpiarTexto(tratamientoInspeccion.observaciones, 1000).trim(),
          });

          if (tratamientoInspeccion.estado === 'FINALIZADO') {
            await cambiarEstadoTratamientoLocal(tratamientoId, 'FINALIZADO');
          }
        } catch (errorTratamiento) {
          avisoTratamiento = ` La inspección quedó guardada, pero no se pudo registrar el tratamiento: ${
            errorTratamiento instanceof Error ? errorTratamiento.message : 'error desconocido'
          }`;
        }
      }

      // Una inspección nueva se guarda primero en SQLite para no perder
      // información. Si hay conexión, intentar enviarla inmediatamente.
      // Si falla la red o el servidor, se conserva como PENDIENTE.
      let inspeccionSincronizada = false;

      if (!esEdicion) {
        try {
          await ejecutarControlador();

          const registrosLocales = await listarInspeccionesLocales();
          inspeccionSincronizada =
            registrosLocales.find(registro => registro.id === id)?.estado ===
            'SINCRONIZADO';
        } catch (errorSincronizacion) {
          console.warn(
            '[Colmenares] La inspección quedó guardada localmente; no se pudo completar el envío inmediato:',
            errorSincronizacion
          );
        }
      }

      const mensajeInspeccion = esEdicion
        ? 'Los datos de la inspección se actualizaron en el servidor. Los movimientos históricos de marcos se conservaron.'
        : inspeccionSincronizada
          ? 'La inspección se guardó y se sincronizó correctamente con el servidor.'
          : esRevision
            ? 'La inspección quedó guardada y vinculada a la revisión. Se conservará en SQLite hasta completar la sincronización.'
            : 'La inspección quedó guardada en SQLite y permanece pendiente de sincronización. Se reintentará automáticamente cuando el servidor esté disponible.';

      Alert.alert(
        esEdicion ? 'Inspección actualizada' : 'Inspección guardada',
        mensajeInspeccion + avisoTratamiento,
        [
          {
            text: esRevision && !esEdicion ? 'Guardar y siguiente' : 'Aceptar',
            onPress: () => {
              if (onGuardado && !esEdicion) {
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
        texto={modoModal ? 'No revisado' : 'Sin evaluar'}
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

  const etiquetaConteudoMarco = (contenido: ContenidoMarco | '') =>
    contenido === ''
      ? 'Sin registrar'
      : OPCIONES_MARCOS.find(opcion => opcion.valor === contenido)?.texto ?? contenido;

  const mostrarCajaModal = (caja: Caja, titulo: string) => {
    const sinRegistrar = datos[caja].filter(marco => marco.contenido === '').length;
    const registrados = datos[caja].filter(marco => marco.contenido !== '' && marco.contenido !== 'SIN_MARCO').length;
    const transferidos = datos[caja].filter(marco => marco.transferir).length;

    return (
      <View style={styles.tarjeta}>
        <View style={styles.cajaModalEncabezado}>
          <View style={{ flex: 1 }}>
            <Text style={styles.tituloSeccion}>{titulo}</Text>
            <Text style={styles.ayuda}>
              {sinRegistrar === 10
                ? 'Sin registrar'
                : `${registrados} marcos registrados${transferidos ? ` · ${transferidos} para transferir` : ''}`}
            </Text>
          </View>
          {sinRegistrar > 0 && (
            <Pressable
              style={styles.botonCompletarMarcos}
              onPress={() => setCajaCompletarActiva(actual => actual === caja ? null : caja)}
            >
              <Text style={styles.botonCompletarMarcosTexto}>
                Completar {sinRegistrar} faltantes
              </Text>
            </Pressable>
          )}
        </View>

        {cajaCompletarActiva === caja && (
          <View style={styles.marcoModalOpciones}>
            {OPCIONES_MARCOS.map(opcion => (
              <Opcion
                key={`completar-${caja}-${opcion.valor}`}
                texto={opcion.texto}
                activa={false}
                onPress={() => {
                  setDatos(actual => ({
                    ...actual,
                    [caja]: actual[caja].map(marco =>
                      marco.contenido === ''
                        ? { ...marco, contenido: opcion.valor }
                        : marco
                    ),
                  }));
                  setCajaCompletarActiva(null);
                }}
              />
            ))}
          </View>
        )}

        {datos[caja].map(marco => {
          const activo = marcoActivo.caja === caja && marcoActivo.numero === marco.numero;
          return (
            <View key={`${caja}-modal-${marco.numero}`} style={styles.marcoModalContenedor}>
              <View style={styles.marcoModalFila}>
                <Text style={styles.marcoModalNombre}>Marco {marco.numero}</Text>
                <Pressable
                  style={styles.marcoModalSelector}
                  onPress={() => {
                    setMarcoActivo({ caja, numero: marco.numero });
                    setMarcoMenuVisible(actual => !(activo && actual));
                    setCajaCompletarActiva(null);
                  }}
                >
                  <Text style={styles.marcoModalSelectorTexto} numberOfLines={1}>
                    {etiquetaConteudoMarco(marco.contenido)}
                  </Text>
                  <Text style={styles.marcoModalFlecha}>⌄</Text>
                </Pressable>
                <Pressable
                  disabled={!marco.contenido || marco.contenido === 'SIN_MARCO'}
                  style={[
                    styles.marcoModalTransferir,
                    marco.transferir && styles.marcoModalTransferirActivo,
                    (!marco.contenido || marco.contenido === 'SIN_MARCO') && styles.deshabilitado,
                  ]}
                  onPress={() => {
                    if (!marco.contenido || marco.contenido === 'SIN_MARCO') return;
                    cambiarMarco(caja, marco.numero, {
                      transferir: !marco.transferir,
                      destino: '',
                    });
                  }}
                >
                  <Text style={[
                    styles.marcoModalTransferirTexto,
                    marco.transferir && styles.marcoModalTransferirTextoActivo,
                  ]}>
                    {marco.transferir ? 'Quitar' : 'Transferir'}
                  </Text>
                </Pressable>
              </View>

              {activo && marcoMenuVisible && (
                <View style={styles.marcoModalOpciones}>
                  {OPCIONES_MARCOS.map(opcion => (
                    <Opcion
                      key={`${caja}-${marco.numero}-${opcion.valor}`}
                      texto={opcion.texto}
                      activa={marco.contenido === opcion.valor}
                      onPress={() => {
                        cambiarMarco(caja, marco.numero, {
                          contenido: opcion.valor,
                          ...(opcion.valor === 'SIN_MARCO'
                            ? { transferir: false, destino: '' }
                            : {}),
                        });
                        setMarcoMenuVisible(false);
                      }}
                    />
                  ))}
                </View>
              )}

              {marco.transferir && (
                <View style={styles.marcoModalDestino}>
                  <Text style={styles.label}>Colmena de destino *</Text>
                  {destinos.length === 0 ? (
                    <Text style={styles.ayuda}>No hay otras colmenas oficiales disponibles en el catálogo.</Text>
                  ) : (
                    <View style={styles.marcoModalOpciones}>
                      {destinos.map(destino => (
                        <Opcion
                          key={`${caja}-${marco.numero}-${destino.codigoQR}`}
                          texto={destino.etiqueta}
                          activa={marco.destino === destino.codigoQR}
                          onPress={() => cambiarMarco(caja, marco.numero, { destino: destino.codigoQR })}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <View style={modoModal ? styles.modalFormularioRoot : styles.pantalla}>
      <ScrollView
        style={styles.scrollFormulario}
        contentContainerStyle={modoModal ? styles.contenidoModalFormulario : styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="dark-content" />

        {!modoModal && (
          <>
            <Pressable disabled={guardando} onPress={onVolver}>
              <Text style={styles.enlace}>‹ Volver</Text>
            </Pressable>

            <Text style={styles.titulo}>
              {esEdicion
                ? 'Editar inspección'
                : esRevision
                  ? 'Inspección de grupo'
                  : 'Nueva inspección'}
            </Text>
          </>
        )}

        {modoModal && (
          <View style={[styles.tarjeta, styles.tarjetaSelectorModal]}>
            <View style={styles.filaDatosModal}>
              <View style={styles.campoDatoModal}>
                <Text style={styles.label}>Apiario *</Text>
                <View style={styles.valorDatoModal}>
                  <Text style={styles.valorDatoModalTexto} numberOfLines={1}>
                    {apiarioNombre || 'Sin apiario'}
                  </Text>
                </View>
              </View>
              <View style={styles.campoDatoModal}>
                <Text style={styles.label}>Colmena *</Text>
                <View style={styles.valorDatoModal}>
                  <Text style={styles.valorDatoModalTexto} numberOfLines={1}>
                    {codigoColmena || codigoQR}
                  </Text>
                </View>
              </View>
            </View>
            {cargandoCatalogo && <ActivityIndicator color={COLORS.gold} style={{ marginTop: 8 }} />}
            {!!errorCatalogo && <Text style={styles.avisoTexto}>{errorCatalogo}</Text>}
          </View>
        )}

        {!modoModal && (
          <View style={styles.tarjeta}>
            <Text style={styles.label}>Código QR de la colmena</Text>
            <Text style={styles.codigo}>{codigoQR}</Text>
            <Text style={styles.ayuda}>
              Los datos se guardan en el teléfono. La sincronización se realizará posteriormente.
            </Text>
            {cargandoCatalogo && <ActivityIndicator color={COLORS.gold} />}
            {!!errorCatalogo && <Text style={styles.avisoTexto}>{errorCatalogo}</Text>}
          </View>
        )}

      {/* ESTADO GENERAL */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          {modoModal ? 'Estado de la colmena *' : 'Estado general *'}
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
          {modoModal ? '¿Hay cría?' : '¿Hay presencia de cría?'}
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
          {modoModal ? 'Población' : 'Nivel de población'}
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto={modoModal ? 'No revisado' : 'Sin evaluar'}
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
            texto={modoModal ? 'No revisado' : 'Sin evaluar'}
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
          {modoModal ? 'Miel' : 'Nivel de miel'}
        </Text>

        <View style={styles.fila}>
          <Opcion
            texto={modoModal ? 'No revisado' : 'Sin evaluar'}
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
        {modoModal && (
          <Text style={styles.ayuda}>Déjalo vacío si no se alimentó la colmena.</Text>
        )}
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
              {modoModal ? '¿Qué se observó? *' : 'Enfermedad o signos observados *'}
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
              {modoModal ? 'Tiras de medicamento aplicadas' : 'Tiras de medicamento'}
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
                        ? (modoModal ? 'No se aplicaron' : 'Sin registrar')
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

      {modoModal && datos.signosEnfermedad && (
        <View style={styles.tarjeta}>
          <Text style={styles.tituloSeccion}>Tratamiento asociado</Text>
          <Text style={styles.label}>¿Se aplicó un tratamiento?</Text>
          <View style={styles.fila}>
            <Opcion
              texto="No"
              activa={!registrarTratamiento}
              onPress={() => setRegistrarTratamiento(false)}
            />
            <Opcion
              texto="Sí, registrar"
              activa={registrarTratamiento}
              onPress={() => setRegistrarTratamiento(true)}
            />
          </View>

          {registrarTratamiento && (
            <>
              <Text style={styles.label}>Tipo de tratamiento *</Text>
              <TextInput
                style={styles.input}
                value={tratamientoInspeccion.tipoTratamiento}
                onChangeText={valor => setTratamientoInspeccion(actual => ({
                  ...actual,
                  tipoTratamiento: limpiarTexto(valor, 100),
                }))}
                placeholder="Por ejemplo: Control de varroa"
                maxLength={100}
              />

              <View style={styles.filaDatosModal}>
                <View style={styles.campoDatoModal}>
                  <Text style={styles.label}>Producto</Text>
                  <TextInput
                    style={styles.input}
                    value={tratamientoInspeccion.producto}
                    onChangeText={valor => setTratamientoInspeccion(actual => ({
                      ...actual,
                      producto: limpiarTexto(valor, 150),
                    }))}
                    placeholder="Producto utilizado"
                    maxLength={150}
                  />
                </View>
                <View style={styles.campoDatoModal}>
                  <Text style={styles.label}>Dosis</Text>
                  <TextInput
                    style={styles.input}
                    value={tratamientoInspeccion.dosis}
                    onChangeText={valor => setTratamientoInspeccion(actual => ({
                      ...actual,
                      dosis: limpiarTexto(valor, 100),
                    }))}
                    placeholder={datos.tirasMedicamento ? `${datos.tirasMedicamento} tiras` : 'Dosis aplicada'}
                    maxLength={100}
                  />
                </View>
              </View>

              <Text style={styles.label}>Estado del tratamiento</Text>
              <View style={styles.fila}>
                <Opcion
                  texto="En curso"
                  activa={tratamientoInspeccion.estado === 'EN_CURSO'}
                  onPress={() => setTratamientoInspeccion(actual => ({ ...actual, estado: 'EN_CURSO' }))}
                />
                <Opcion
                  texto="Finalizado"
                  activa={tratamientoInspeccion.estado === 'FINALIZADO'}
                  onPress={() => setTratamientoInspeccion(actual => ({ ...actual, estado: 'FINALIZADO' }))}
                />
              </View>
              <Text style={styles.ayuda}>
                Se registrará asociado a esta inspección. Si lo marcas como finalizado, se utilizará la fecha de hoy.
              </Text>

              <Text style={styles.label}>Observaciones del tratamiento</Text>
              <TextInput
                style={[styles.input, styles.area]}
                value={tratamientoInspeccion.observaciones}
                onChangeText={valor => setTratamientoInspeccion(actual => ({
                  ...actual,
                  observaciones: limpiarTexto(valor, 1000),
                }))}
                multiline
                textAlignVertical="top"
                placeholder="Observaciones adicionales"
                maxLength={1000}
              />
            </>
          )}
        </View>
      )}

      {!esEdicion ? (
        <>
          {/* CÁMARAS */}
          {modoModal && (
            <View style={{ marginBottom: 4 }}>
              <Text style={styles.tituloSeccion}>Revisión de marcos</Text>
              <Text style={styles.ayuda}>
                Indica qué contiene cada marco. Si mueves un marco a otra colmena del apiario, márcalo con Transferir.
              </Text>
            </View>
          )}
          {!modoModal && (
            <View style={styles.tarjeta}>
              <Text style={styles.tituloSeccion}>Configuración de cajas</Text>
              <Text style={styles.label}>¿La colmena tiene alza?</Text>
              <View style={styles.fila}>
                <Opcion texto="No" activa={!datos.tieneAlza} onPress={() => cambiarAlza(false)} />
                <Opcion texto="Sí" activa={datos.tieneAlza} onPress={() => cambiarAlza(true)} />
              </View>
            </View>
          )}

          {modoModal
            ? mostrarCajaModal('camara', 'Cámara de cría')
            : mostrarCaja('camara', 'Cámara de cría · 10 posiciones')}

          {modoModal && (
            <View style={styles.tarjeta}>
              <Text style={styles.label}>¿La colmena tiene alza?</Text>
              <View style={styles.fila}>
                <Opcion texto="No" activa={!datos.tieneAlza} onPress={() => cambiarAlza(false)} />
                <Opcion texto="Sí" activa={datos.tieneAlza} onPress={() => cambiarAlza(true)} />
              </View>
            </View>
          )}

          {datos.tieneAlza && (
            modoModal
              ? mostrarCajaModal('alza', 'Alza')
              : mostrarCaja('alza', 'Alza · 10 posiciones')
          )}

          {/* RESUMEN */}
          {!modoModal && <View style={styles.tarjeta}>
            <Text style={styles.tituloSeccion}>
              Resumen automático
            </Text>

            <View style={styles.resumen}>
              <View>
                <Text style={styles.resumenNumero}>{resumen.total}</Text>
                <Text style={styles.ayuda}>Marcos</Text>
              </View>
              <View>
                <Text style={styles.resumenNumero}>{resumen.cria}</Text>
                <Text style={styles.ayuda}>Con cría</Text>
              </View>
              <View>
                <Text style={styles.resumenNumero}>{resumen.miel}</Text>
                <Text style={styles.ayuda}>Con miel</Text>
              </View>
              <View>
                <Text style={styles.resumenNumero}>{resumen.transferencias}</Text>
                <Text style={styles.ayuda}>Transferencias</Text>
              </View>
            </View>

            <Text style={styles.ayuda}>
              Posiciones sin registrar: {resumen.sinRegistrar}
            </Text>
          </View>}
        </>
      ) : (
        <View style={styles.tarjeta}>
          <Text style={styles.tituloSeccion}>Revisión de marcos</Text>
          <Text style={styles.ayuda}>
            La información de marcos y las transferencias históricas se conserva tal como fue registrada. Esta edición modifica los datos generales y sanitarios, sin crear movimientos nuevos.
          </Text>
        </View>
      )}

      {/* OBSERVACIONES */}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          {modoModal ? 'Observaciones' : 'Observaciones generales'}
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

        {!modoModal && (
          <>
            <Pressable
              style={[styles.botonGuardar, guardando && styles.deshabilitado]}
              disabled={guardando}
              onPress={() => void guardar()}
            >
              <Text style={styles.botonTexto}>
                {guardando
                  ? 'Guardando...'
                  : esEdicion
                    ? 'Guardar cambios'
                    : esRevision
                      ? 'Guardar y siguiente'
                      : 'Guardar inspección'}
              </Text>
            </Pressable>

            <Text style={styles.pie}>
              Colmenares Tres Pinos · {esEdicion ? 'Edición sincronizada en FastAPI' : 'Registro local SQLite'}
            </Text>
          </>
        )}
      </ScrollView>

      {modoModal && (
        <View style={styles.modalFormularioFooter}>
          <Pressable
            style={styles.modalFormularioCancelar}
            onPress={onVolver}
            disabled={guardando}
          >
            <Text style={styles.modalFormularioCancelarTexto}>Cancelar</Text>
          </Pressable>
          <Pressable
            style={[styles.modalFormularioGuardar, guardando && styles.deshabilitado]}
            onPress={() => void guardar()}
            disabled={guardando}
          >
            <Text style={styles.modalFormularioGuardarTexto}>
              {guardando ? 'Guardando…' : 'Registrar inspección'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: COLORS.backgroundSoft,
  },

  modalFormularioRoot: {
    flex: 1,
    backgroundColor: COLORS.backgroundSoft,
  },

  scrollFormulario: {
    flex: 1,
  },

  contenidoModalFormulario: {
    padding: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },

  tarjetaSelectorModal: {
    marginBottom: 10,
  },

  filaDatosModal: {
    flexDirection: 'row',
    gap: 9,
  },

  campoDatoModal: {
    flex: 1,
    minWidth: 0,
  },

  valorDatoModal: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },

  valorDatoModalTexto: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },

  modalFormularioFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },

  modalFormularioCancelar: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  modalFormularioCancelarTexto: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },

  modalFormularioGuardar: {
    flex: 1.35,
    minHeight: 44,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  modalFormularioGuardarTexto: {
    color: COLORS.forestDeep,
    fontSize: 13,
    fontWeight: '900',
  },

  cajaModalEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },

  botonCompletarMarcos: {
    borderWidth: 1,
    borderColor: COLORS.goldBorder,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.goldSoft,
  },

  botonCompletarMarcosTexto: {
    color: COLORS.goldText,
    fontSize: 11,
    fontWeight: '800',
  },

  marcoModalContenedor: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    paddingBottom: 4,
  },

  marcoModalFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  marcoModalNombre: {
    width: 57,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },

  marcoModalSelector: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },

  marcoModalSelectorTexto: {
    flex: 1,
    color: COLORS.text,
    fontSize: 11,
  },

  marcoModalFlecha: {
    color: COLORS.forest,
    fontSize: 17,
    fontWeight: '800',
  },

  marcoModalTransferir: {
    minWidth: 72,
    minHeight: 40,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 9,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },

  marcoModalTransferirActivo: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldSoft,
  },

  marcoModalTransferirTexto: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },

  marcoModalTransferirTextoActivo: {
    color: COLORS.goldText,
  },

  marcoModalOpciones: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
  },

  marcoModalDestino: {
    marginTop: 8,
    marginLeft: 60,
    padding: 9,
    borderRadius: 10,
    backgroundColor: COLORS.goldSoft,
  },

  contenido: {
    padding: 18,
    paddingTop: 60,
    paddingBottom: 55,
  },

  titulo: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.forestDeep,
    marginBottom: 18,
  },

  tituloSeccion: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.forestDeep,
    marginBottom: 12,
  },

  subtitulo: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.forestDeep,
    marginBottom: 10,
  },

  tarjeta: {
    backgroundColor: COLORS.surface,
    padding: 17,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 15,
  },

  label: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
    marginBottom: 8,
  },

  codigo: {
    color: COLORS.goldText,
    fontSize: 13,
    fontWeight: '700',
    marginVertical: 8,
  },

  ayuda: {
    color: COLORS.textSecondary,
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
    borderColor: COLORS.goldBorder,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 11,
    marginBottom: 5,
  },

  opcionActiva: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldSoft,
  },

  opcionTexto: {
    color: COLORS.goldText,
    fontWeight: '600',
    fontSize: 13,
  },

  opcionTextoActivo: {
    fontWeight: '800',
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 13,
    color: COLORS.forestDeep,
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
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.backgroundSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },

  numeroMarcoCompleto: {
    backgroundColor: COLORS.successBg,
    borderColor: COLORS.successBg,
  },

  numeroMarcoActivo: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.goldText,
  },

  numeroMarcoTexto: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },

  numeroMarcoTextoActivo: {
    color: COLORS.surface,
  },

  numeroMarcoEstado: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  detalleMarco: {
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  resumen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },

  resumenNumero: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.goldText,
    textAlign: 'center',
  },

  enlace: {
    color: COLORS.goldText,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 20,
  },

  avisoTexto: {
    color: COLORS.warning,
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 10,
  },

  botonGuardar: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginVertical: 12,
  },

  botonTexto: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '800',
  },

  deshabilitado: {
    opacity: 0.5,
  },

  pie: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
});
