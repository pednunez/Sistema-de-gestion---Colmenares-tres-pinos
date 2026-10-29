
import React, {
  useCallback,
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

import FormularioInspeccion from './FormularioInspeccion';

import type {
  InspeccionAvanzada,
} from './database/inspeccionesAvanzadas';

import {
  leerSesionGuardada,
} from './api/auth';

import {
  leerCatalogoLocal,
} from './database/catalogo';

import {
  iniciarRevisionLocal,
  listarRevisionesLocales,
  obtenerRevisionLocal,
  omitirColmenaLocal,
  recuperarColmenaOmitida,
  finalizarRevisionLocal,
} from './database/revisiones';

import type {
  RevisionGuardada,
  DetalleRevisionLocal,
  EstadoColmenaRevision,
} from './database/revisiones';

import {
  guardarYSiguiente,
  recuperarVinculacion,
  ErrorVinculacionRevision,
} from './database/guardarYSiguiente';

import {
  prepararPlanRevisiones,
} from './sincronizacion/planRevisiones';

import type {
  ResultadoPlanRevisiones,
} from './sincronizacion/planRevisiones';

// ==========================================
// COLMENARES TRES PINOS
// REVISIONES POR GRUPO
// PASO 29: PANEL DE DIAGNÓSTICO
// ==========================================

type Props = {
  onVolver: () => void;
};

type CatalogoLocal = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

type ContextoFormulario = {
  revisionId: number;
  colmenaId: number;
  codigoQR: string;
};

type VinculacionPendiente = {
  revisionId: number;
  colmenaId: number;
  inspeccionLocalId: number;
};

const NOMBRES_ESTADOS: Record<
  EstadoColmenaRevision,
  string
> = {
  PENDIENTE: 'Pendiente',
  REVISADA: 'Revisada',
  OMITIDA: 'Omitida',
};

function mensajeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación.';
}

function fechaCorta(fecha: string): string {
  const fechaReal = new Date(fecha);

  return Number.isNaN(fechaReal.getTime())
    ? fecha
    : fechaReal.toLocaleString('es-CL');
}

// ==========================================
// BOTÓN REUTILIZABLE
// ==========================================

function Boton({
  titulo,
  onPress,
  secundario = false,
  peligro = false,
  disabled = false,
}: {
  titulo: string;
  onPress: () => void;
  secundario?: boolean;
  peligro?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.boton,
        secundario && styles.botonBorde,
        peligro && styles.botonPeligro,
        disabled && styles.deshabilitado,
      ]}
    >
      <Text
        style={[
          styles.textoBoton,
          secundario && styles.textoBorde,
        ]}
      >
        {titulo}
      </Text>
    </Pressable>
  );
}

// ==========================================
// PANEL DE DIAGNÓSTICO
// ==========================================

function PanelDiagnostico({
  resultado,
  cargando,
  error,
  onActualizar,
}: {
  resultado: ResultadoPlanRevisiones | null;
  cargando: boolean;
  error: string;
  onActualizar: () => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.tituloTarjeta}>
        🔎 Diagnóstico de sincronización
      </Text>

      <Text style={styles.aviso}>
        Solo lectura. Este diagnóstico no
        envía información ni modifica SQLite.
      </Text>

      <Boton
        titulo={
          cargando
            ? 'Analizando registros...'
            : 'Actualizar diagnóstico'
        }
        onPress={onActualizar}
        disabled={cargando}
      />

      {cargando && (
        <ActivityIndicator
          color="#D99A24"
          style={styles.cargando}
        />
      )}

      {!!error && (
        <Text style={styles.error}>
          {error}
        </Text>
      )}

      {resultado && (
        <>
          <Text style={styles.subtitulo}>
            Estado: {resultado.estado}
          </Text>

          <Text style={styles.detalle}>
            {resultado.mensaje}
          </Text>

          <View style={styles.estadisticas}>
            <View style={styles.estadistica}>
              <Text style={styles.cifra}>
                {resultado.totalRevisiones}
              </Text>
              <Text style={styles.etiqueta}>
                Revisiones
              </Text>
            </View>

            <View style={styles.estadistica}>
              <Text style={styles.cifra}>
                {resultado.totalOperaciones}
              </Text>
              <Text style={styles.etiqueta}>
                Operaciones
              </Text>
            </View>

            <View style={styles.estadistica}>
              <Text style={styles.cifra}>
                {resultado.totalBloqueadas}
              </Text>
              <Text style={styles.etiqueta}>
                Bloqueadas
              </Text>
            </View>
          </View>

          {resultado.planes.map(plan => (
            <View
              key={plan.revisionLocalId}
              style={styles.tarjetaInterna}
            >
              <Text style={styles.tituloTarjeta}>
                {plan.grupoNombre}
              </Text>

              <Text style={styles.detalle}>
                Revisión local N.º {
                  plan.revisionLocalId
                }
              </Text>

              <Text style={styles.detalle}>
                Estado local: {
                  plan.estadoLocal
                }
              </Text>

              <Text
                style={[
                  styles.estado,
                  plan.estadoPlan === 'BLOQUEADO'
                    ? styles.rojo
                    : plan.estadoPlan === 'PREPARADO'
                      ? styles.verde
                      : styles.gris,
                ]}
              >
                {plan.estadoPlan === 'PREPARADO'
                  ? 'Plan local preparado'
                  : plan.estadoPlan === 'BLOQUEADO'
                    ? 'Plan bloqueado'
                    : 'Sin operaciones'}
              </Text>

              <Text style={styles.detalle}>
                Revisadas: {plan.revisadas}
              </Text>

              <Text style={styles.detalle}>
                Omitidas: {plan.omitidas}
              </Text>

              <Text style={styles.detalle}>
                Pendientes: {plan.pendientes}
              </Text>

              {plan.problemas.length > 0 && (
                <>
                  <Text style={styles.subtitulo}>
                    Problemas encontrados
                  </Text>

                  {plan.problemas.map(
                    (problema, indice) => (
                      <Text
                        key={indice}
                        style={styles.error}
                      >
                        • {problema}
                      </Text>
                    )
                  )}
                </>
              )}

              {plan.pasos.length > 0 && (
                <>
                  <Text style={styles.subtitulo}>
                    Orden previsto de operaciones
                  </Text>

                  {plan.pasos.map(paso => (
                    <View
                      key={paso.orden}
                      style={styles.paso}
                    >
                      <Text style={styles.pasoTitulo}>
                        {paso.orden}. {paso.tipo}
                      </Text>

                      <Text style={styles.detalle}>
                        {paso.descripcion}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          ))}

          <Text style={styles.nota}>
            Un plan preparado no confirma que
            FastAPI esté disponible ni que el
            servidor acepte las operaciones.
            Los envíos reales siguen
            desactivados.
          </Text>
        </>
      )}
    </View>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function RevisionesGrupos({
  onVolver,
}: Props) {
  const [catalogo, setCatalogo] =
    useState<CatalogoLocal | null>(null);

  const [sesionDisponible, setSesionDisponible] =
    useState(false);

  const [revisiones, setRevisiones] =
    useState<RevisionGuardada[]>([]);

  const [revisionId, setRevisionId] =
    useState<number | null>(null);

  const [detalle, setDetalle] =
    useState<DetalleRevisionLocal | null>(null);

  const [formulario, setFormulario] =
    useState<ContextoFormulario | null>(null);

  const [cargando, setCargando] =
    useState(true);

  const [accionando, setAccionando] =
    useState(false);

  const [error, setError] =
    useState('');

  const [mostrarEjemplo, setMostrarEjemplo] =
    useState(false);

  const [omitiendoId, setOmitiendoId] =
    useState<number | null>(null);

  const [motivo, setMotivo] =
    useState('');

  // ========================================
  // DIAGNÓSTICO
  // ========================================

  const [
    mostrarDiagnostico,
    setMostrarDiagnostico,
  ] = useState(false);

  const [
    resultadoDiagnostico,
    setResultadoDiagnostico,
  ] = useState<ResultadoPlanRevisiones | null>(
    null
  );

  const [
    cargandoDiagnostico,
    setCargandoDiagnostico,
  ] = useState(false);

  const [
    errorDiagnostico,
    setErrorDiagnostico,
  ] = useState('');

  // ========================================
  // RECUPERACIÓN DE VINCULACIONES
  // ========================================

  const vinculacionPendiente =
    useRef<VinculacionPendiente | null>(null);

  // ========================================
  // CARGAR DATOS LOCALES
  // ========================================

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');

    try {
      const sesion =
        await leerSesionGuardada();

      setSesionDisponible(Boolean(sesion));

      if (!sesion) {
        setCatalogo(null);
        setRevisiones([]);
        setDetalle(null);
        return;
      }

      const [catalogoLocal, registros] =
        await Promise.all([
          leerCatalogoLocal(sesion.usuario.id),
          listarRevisionesLocales(),
        ]);

      setCatalogo(catalogoLocal);
      setRevisiones(registros);

      if (revisionId !== null) {
        const revision =
          await obtenerRevisionLocal(revisionId);

        setDetalle(revision);
      } else {
        setDetalle(null);
      }
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [revisionId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // ========================================
  // CONSULTAR DIAGNÓSTICO
  // ========================================

  const consultarDiagnostico = async () => {
    if (cargandoDiagnostico) return;

    setCargandoDiagnostico(true);
    setErrorDiagnostico('');

    try {
      const resultado =
        await prepararPlanRevisiones();

      setResultadoDiagnostico(resultado);
    } catch (e) {
      setResultadoDiagnostico(null);
      setErrorDiagnostico(mensajeError(e));
    } finally {
      setCargandoDiagnostico(false);
    }
  };

  const alternarDiagnostico = () => {
    if (mostrarDiagnostico) {
      setMostrarDiagnostico(false);
      return;
    }

    setMostrarDiagnostico(true);
    void consultarDiagnostico();
  };

  // ========================================
  // EJECUTAR OPERACIONES LOCALES
  // ========================================

  const ejecutar = async (
    accion: () => Promise<void>
  ) => {
    if (accionando) return;

    setAccionando(true);

    try {
      await accion();
      await recargar();
    } catch (e) {
      Alert.alert(
        'No se pudo completar',
        mensajeError(e)
      );
    } finally {
      setAccionando(false);
    }
  };

  // ========================================
  // INICIAR REVISIÓN POR GRUPO
  // ========================================

  const iniciar = async (grupoId: number) => {
    if (accionando) return;

    setAccionando(true);

    try {
      const id =
        await iniciarRevisionLocal(grupoId);

      setRevisionId(id);
      setMostrarEjemplo(false);
    } catch (e) {
      Alert.alert(
        'No se pudo iniciar la revisión',
        mensajeError(e)
      );
    } finally {
      setAccionando(false);
    }
  };

  // ========================================
  // GUARDAR Y SIGUIENTE
  // ========================================

  const guardarDesdeRevision = async (
    datos: InspeccionAvanzada
  ): Promise<number> => {
    if (!formulario) {
      throw new Error(
        'No hay una colmena seleccionada.'
      );
    }

    const {
      revisionId: idRevision,
      colmenaId,
    } = formulario;

    const pendiente =
      vinculacionPendiente.current;

    // Recuperar inspección ya guardada
    // para evitar crear duplicados.
    if (pendiente) {
      if (
        pendiente.revisionId !== idRevision ||
        pendiente.colmenaId !== colmenaId
      ) {
        throw new Error(
          'Existe una vinculación pendiente de otra colmena.'
        );
      }

      const resultado =
        await recuperarVinculacion(
          idRevision,
          colmenaId,
          pendiente.inspeccionLocalId
        );

      vinculacionPendiente.current = null;

      return resultado.inspeccionLocalId;
    }

    try {
      const resultado =
        await guardarYSiguiente(
          idRevision,
          colmenaId,
          datos
        );

      return resultado.inspeccionLocalId;
    } catch (e) {
      if (e instanceof ErrorVinculacionRevision) {
        vinculacionPendiente.current = {
          revisionId: idRevision,
          colmenaId,
          inspeccionLocalId:
            e.inspeccionLocalId,
        };
      }

      throw e;
    }
  };

  // ========================================
  // AVANZAR DESPUÉS DE GUARDAR
  // ========================================

  const despuesDeGuardar = async () => {
    if (!formulario) return;

    try {
      const actualizada =
        await obtenerRevisionLocal(
          formulario.revisionId
        );

      setDetalle(actualizada);

      if (
        actualizada.revision.estado === 'EN_CURSO' &&
        actualizada.siguiente
      ) {
        setFormulario({
          revisionId: actualizada.revision.id,
          colmenaId:
            actualizada.siguiente.colmena_id,
          codigoQR:
            actualizada.siguiente.codigo_qr,
        });
      } else {
        setFormulario(null);
        await recargar();
      }
    } catch {
      setFormulario(null);

      Alert.alert(
        'Inspección guardada',
        'La inspección se guardó, pero no fue posible actualizar el recorrido.'
      );
    }
  };

  // ========================================
  // OMITIR COLMENA
  // ========================================

  const confirmarOmitir = (colmenaId: number) => {
    if (revisionId === null) return;

    if (!motivo.trim()) {
      Alert.alert(
        'Motivo requerido',
        'Indica por qué se omitió esta colmena.'
      );
      return;
    }

    void ejecutar(async () => {
      await omitirColmenaLocal(
        revisionId,
        colmenaId,
        motivo
      );

      setOmitiendoId(null);
      setMotivo('');
    });
  };

  // ========================================
  // RECUPERAR COLMENA OMITIDA
  // ========================================

  const recuperar = (colmenaId: number) => {
    if (revisionId === null) return;

    void ejecutar(async () => {
      await recuperarColmenaOmitida(
        revisionId,
        colmenaId
      );
    });
  };

  // ========================================
  // FINALIZAR REVISIÓN
  // ========================================

  const finalizar = () => {
    if (revisionId === null || !detalle) {
      return;
    }

    Alert.alert(
      'Finalizar revisión',
      `¿Quieres finalizar esta revisión? Quedan ${detalle.progreso.pendientes} colmenas pendientes.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Finalizar',
          onPress: () => {
            void ejecutar(async () => {
              await finalizarRevisionLocal(revisionId);
            });
          },
        },
      ]
    );
  };

  // ========================================
  // VISTA PREVIA DE RECORRIDO
  // ========================================

  const vistaPrevia = () => (
    <View style={styles.tarjeta}>
      <Text style={styles.tituloTarjeta}>
        Vista previa de recorrido
      </Text>

      <Text style={styles.aviso}>
        Ejemplo visual. No representa
        colmenas reales y no guarda
        información en SQLite.
      </Text>

      <Text style={styles.subtitulo}>
        Progreso de ejemplo: 2 de 5 revisadas
      </Text>

      {Array.from(
        { length: 5 },
        (_, indice) => {
          const estado: EstadoColmenaRevision =
            indice < 2
              ? 'REVISADA'
              : indice === 2
                ? 'OMITIDA'
                : 'PENDIENTE';

          return (
            <View
              key={indice}
              style={styles.filaColmena}
            >
              <Text style={styles.texto}>
                Colmena {indice + 1} de 5
              </Text>

              <Text
                style={[
                  styles.estado,
                  estado === 'REVISADA'
                    ? styles.verde
                    : estado === 'OMITIDA'
                      ? styles.naranja
                      : styles.gris,
                ]}
              >
                {NOMBRES_ESTADOS[estado]}
              </Text>
            </View>
          );
        }
      )}

      <Text style={styles.nota}>
        Cuando tengamos un catálogo oficial,
        aquí se mostrará el recorrido real.
      </Text>
    </View>
  );

  // ========================================
  // FORMULARIO DE INSPECCIÓN
  // ========================================

  if (formulario) {
    return (
      <FormularioInspeccion
        key={
          `${formulario.revisionId}-` +
          `${formulario.colmenaId}`
        }
        codigoQR={formulario.codigoQR}
        onVolver={() => {
          if (vinculacionPendiente.current) {
            Alert.alert(
              'Vinculación pendiente',
              'La inspección ya está guardada. Presiona Guardar y siguiente para recuperar su vínculo sin duplicarla.'
            );
            return;
          }

          setFormulario(null);
        }}
        onGuardarEnRevision={guardarDesdeRevision}
        onGuardado={() => {
          void despuesDeGuardar();
        }}
      />
    );
  }

  // ========================================
  // DETALLE DE REVISIÓN
  // ========================================

  if (revisionId !== null) {
    return (
      <ScrollView
        style={styles.pantalla}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar barStyle="dark-content" />

        <Pressable
          onPress={() => {
            setRevisionId(null);
            setOmitiendoId(null);
          }}
        >
          <Text style={styles.enlace}>
            ‹ Volver a grupos
          </Text>
        </Pressable>

        <Text style={styles.titulo}>
          Revisión de grupo
        </Text>

        {cargando ? (
          <ActivityIndicator
            color="#D99A24"
            size="large"
          />
        ) : error ? (
          <Text style={styles.error}>
            {error}
          </Text>
        ) : detalle ? (
          <>
            <View style={styles.tarjeta}>
              <Text style={styles.tituloTarjeta}>
                {detalle.revision.grupo_nombre}
              </Text>

              <Text style={styles.detalle}>
                Inicio: {
                  fechaCorta(
                    detalle.revision.fecha_inicio
                  )
                }
              </Text>

              <Text style={styles.detalle}>
                Estado: {
                  detalle.revision.estado === 'EN_CURSO'
                    ? 'En curso'
                    : 'Finalizada'
                }
              </Text>

              <Text style={styles.subtitulo}>
                Avance del recorrido
              </Text>

              <View style={styles.estadisticas}>
                <View style={styles.estadistica}>
                  <Text style={styles.cifra}>
                    {detalle.progreso.total}
                  </Text>
                  <Text style={styles.etiqueta}>
                    Total
                  </Text>
                </View>

                <View style={styles.estadistica}>
                  <Text style={styles.cifra}>
                    {detalle.progreso.revisadas}
                  </Text>
                  <Text style={styles.etiqueta}>
                    Revisadas
                  </Text>
                </View>

                <View style={styles.estadistica}>
                  <Text style={styles.cifra}>
                    {detalle.progreso.omitidas}
                  </Text>
                  <Text style={styles.etiqueta}>
                    Omitidas
                  </Text>
                </View>

                <View style={styles.estadistica}>
                  <Text style={styles.cifra}>
                    {detalle.progreso.pendientes}
                  </Text>
                  <Text style={styles.etiqueta}>
                    Pendientes
                  </Text>
                </View>
              </View>

              {detalle.siguiente && (
                <Text style={styles.aviso}>
                  Siguiente colmena: {
                    detalle.siguiente.codigo
                  } (posición {
                    detalle.siguiente.orden
                  } de {detalle.progreso.total})
                </Text>
              )}
            </View>

            <Text style={styles.seccion}>
              Recorrido
            </Text>

            {detalle.colmenas.map(colmena => (
              <View
                key={colmena.id}
                style={styles.tarjeta}
              >
                <Text style={styles.tituloTarjeta}>
                  Colmena {colmena.orden} de {
                    detalle.progreso.total
                  }
                </Text>

                <Text style={styles.detalle}>
                  Código: {colmena.codigo}
                </Text>

                <Text
                  style={[
                    styles.estado,
                    colmena.estado === 'REVISADA'
                      ? styles.verde
                      : colmena.estado === 'OMITIDA'
                        ? styles.naranja
                        : styles.gris,
                  ]}
                >
                  {NOMBRES_ESTADOS[colmena.estado]}
                </Text>

                {colmena.estado === 'REVISADA' && (
                  <Text style={styles.detalle}>
                    Inspección local N.º {
                      colmena.inspeccion_local_id
                    }
                  </Text>
                )}

                {!!colmena.motivo_omision && (
                  <Text style={styles.detalle}>
                    Motivo: {colmena.motivo_omision}
                  </Text>
                )}

                {detalle.revision.estado ===
                  'EN_CURSO' && (
                  <>
                    {colmena.estado ===
                      'PENDIENTE' && (
                      <>
                        <Boton
                          titulo="Iniciar inspección"
                          disabled={accionando}
                          onPress={() => {
                            setFormulario({
                              revisionId,
                              colmenaId:
                                colmena.colmena_id,
                              codigoQR:
                                colmena.codigo_qr,
                            });
                          }}
                        />

                        <Boton
                          titulo="Omitir colmena"
                          secundario
                          disabled={accionando}
                          onPress={() => {
                            setOmitiendoId(
                              colmena.colmena_id
                            );
                            setMotivo('');
                          }}
                        />
                      </>
                    )}

                    {colmena.estado === 'OMITIDA' && (
                      <Boton
                        titulo="Recuperar colmena"
                        secundario
                        disabled={accionando}
                        onPress={() =>
                          recuperar(colmena.colmena_id)
                        }
                      />
                    )}

                    {omitiendoId ===
                      colmena.colmena_id && (
                      <View>
                        <Text style={styles.label}>
                          Motivo de omisión
                        </Text>

                        <TextInput
                          style={styles.input}
                          value={motivo}
                          onChangeText={setMotivo}
                          maxLength={300}
                          placeholder="Ejemplo: lluvia"
                          multiline
                        />

                        <Boton
                          titulo="Confirmar omisión"
                          disabled={accionando}
                          onPress={() =>
                            confirmarOmitir(
                              colmena.colmena_id
                            )
                          }
                        />

                        <Boton
                          titulo="Cancelar"
                          secundario
                          onPress={() => {
                            setOmitiendoId(null);
                            setMotivo('');
                          }}
                        />
                      </View>
                    )}
                  </>
                )}
              </View>
            ))}

            {detalle.revision.estado ===
              'EN_CURSO' && (
              <Boton
                titulo="Finalizar revisión"
                peligro
                disabled={accionando}
                onPress={finalizar}
              />
            )}

            <Boton
              titulo="Actualizar progreso"
              secundario
              onPress={() => void recargar()}
            />
          </>
        ) : null}
      </ScrollView>
    );
  }

  // ========================================
  // PANTALLA PRINCIPAL
  // ========================================

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      <Pressable onPress={onVolver}>
        <Text style={styles.enlace}>
          ‹ Volver al inicio
        </Text>
      </Pressable>

      <Text style={styles.titulo}>
        🐝 Revisiones por grupo
      </Text>

      <Text style={styles.subtitulo}>
        Recorre las colmenas de un grupo
        y conserva su progreso en SQLite.
      </Text>

      {/* DIAGNÓSTICO DE SINCRONIZACIÓN */}

      <Boton
        titulo={
          mostrarDiagnostico
            ? 'Ocultar diagnóstico'
            : '🔎 Diagnóstico de sincronización'
        }
        secundario
        onPress={alternarDiagnostico}
      />

      {mostrarDiagnostico && (
        <PanelDiagnostico
          resultado={resultadoDiagnostico}
          cargando={cargandoDiagnostico}
          error={errorDiagnostico}
          onActualizar={() =>
            void consultarDiagnostico()
          }
        />
      )}

      {/* CARGA LOCAL */}

      {cargando ? (
        <ActivityIndicator
          size="large"
          color="#D99A24"
        />
      ) : (
        <>
          {!!error && (
            <Text style={styles.error}>
              {error}
            </Text>
          )}

          {!sesionDisponible && (
            <View style={styles.avisoCaja}>
              <Text style={styles.tituloTarjeta}>
                Sin sesión iniciada
              </Text>

              <Text style={styles.detalle}>
                Estamos trabajando sin login.
                Para registrar revisiones
                oficiales necesitamos una sesión
                y el catálogo descargado
                desde FastAPI.
              </Text>
            </View>
          )}

          {sesionDisponible && !catalogo && (
            <View style={styles.avisoCaja}>
              <Text style={styles.detalle}>
                No hay un catálogo oficial
                descargado para este usuario.
              </Text>
            </View>
          )}

          {/* REVISIONES GUARDADAS */}

          {revisiones.length > 0 && (
            <>
              <Text style={styles.seccion}>
                Mis revisiones locales
              </Text>

              {revisiones.map(revision => (
                <View
                  key={revision.id}
                  style={styles.tarjeta}
                >
                  <Text style={styles.tituloTarjeta}>
                    {revision.grupo_nombre}
                  </Text>

                  <Text style={styles.detalle}>
                    {revision.estado === 'EN_CURSO'
                      ? 'En curso'
                      : 'Finalizada'}
                  </Text>

                  <Text style={styles.detalle}>
                    Inicio: {
                      fechaCorta(
                        revision.fecha_inicio
                      )
                    }
                  </Text>

                  <Boton
                    titulo="Ver progreso"
                    onPress={() =>
                      setRevisionId(revision.id)
                    }
                  />
                </View>
              ))}
            </>
          )}

          {/* GRUPOS OFICIALES */}

          {catalogo && (
            <>
              <Text style={styles.seccion}>
                Grupos disponibles
              </Text>

              {catalogo.grupos.length === 0 && (
                <Text style={styles.detalle}>
                  No hay grupos en el catálogo.
                </Text>
              )}

              {catalogo.grupos.map(grupo => {
                const apiario =
                  catalogo.apiarios.find(
                    item =>
                      item.id === grupo.apiario_id
                  );

                const enCurso =
                  revisiones.find(
                    item =>
                      item.grupo_id === grupo.id &&
                      item.estado === 'EN_CURSO'
                  );

                return (
                  <View
                    key={grupo.id}
                    style={styles.tarjeta}
                  >
                    <Text style={styles.tituloTarjeta}>
                      {grupo.nombre}
                    </Text>

                    <Text style={styles.detalle}>
                      Apiario: {
                        apiario?.nombre ?? 'Sin nombre'
                      }
                    </Text>

                    <Text style={styles.detalle}>
                      Colmenas: {
                        grupo.colmena_ids.length
                      }
                    </Text>

                    <Boton
                      titulo={
                        enCurso
                          ? 'Continuar revisión'
                          : 'Iniciar revisión'
                      }
                      disabled={
                        accionando ||
                        grupo.colmena_ids.length === 0
                      }
                      onPress={() => {
                        if (enCurso) {
                          setRevisionId(enCurso.id);
                        } else {
                          void iniciar(grupo.id);
                        }
                      }}
                    />
                  </View>
                );
              })}
            </>
          )}

          {/* VISTA PREVIA SIN LOGIN */}

          {!catalogo && (
            <>
              <Boton
                titulo={
                  mostrarEjemplo
                    ? 'Ocultar vista previa'
                    : 'Ver diseño de recorrido'
                }
                secundario
                onPress={() =>
                  setMostrarEjemplo(
                    valor => !valor
                  )
                }
              />

              {mostrarEjemplo && vistaPrevia()}
            </>
          )}

          <Boton
            titulo="Actualizar datos locales"
            secundario
            onPress={() => void recargar()}
          />
        </>
      )}
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
    padding: 20,
    paddingTop: 58,
    paddingBottom: 55,
  },

  titulo: {
    fontSize: 25,
    fontWeight: '800',
    color: '#172337',
    marginBottom: 12,
  },

  subtitulo: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 14,
  },

  seccion: {
    fontSize: 18,
    fontWeight: '800',
    color: '#172337',
    marginTop: 22,
    marginBottom: 12,
  },

  enlace: {
    color: '#92400E',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 20,
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 13,
  },

  tarjetaInterna: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 13,
  },

  panel: {
    backgroundColor: '#FFFBEB',
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F4D393',
    marginTop: 12,
    marginBottom: 10,
  },

  tituloTarjeta: {
    fontSize: 17,
    fontWeight: '800',
    color: '#172337',
    marginBottom: 10,
  },

  detalle: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
    marginBottom: 7,
  },

  avisoCaja: {
    backgroundColor: '#FFF7E6',
    borderColor: '#F4D393',
    borderWidth: 1,
    borderRadius: 13,
    padding: 17,
    marginVertical: 14,
  },

  aviso: {
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 10,
  },

  nota: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 15,
  },

  estadisticas: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
  },

  estadistica: {
    flex: 1,
    alignItems: 'center',
  },

  cifra: {
    color: '#92400E',
    fontSize: 23,
    fontWeight: '800',
  },

  etiqueta: {
    color: '#64748B',
    fontSize: 11,
    textAlign: 'center',
  },

  filaColmena: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  texto: {
    color: '#172337',
    fontSize: 14,
    fontWeight: '600',
  },

  estado: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: '700',
    alignSelf: 'flex-start',
    marginVertical: 7,
  },

  verde: {
    color: '#166534',
    backgroundColor: '#DCFCE7',
  },

  naranja: {
    color: '#92400E',
    backgroundColor: '#FEF3C7',
  },

  gris: {
    color: '#475569',
    backgroundColor: '#E2E8F0',
  },

  rojo: {
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
  },

  boton: {
    backgroundColor: '#D99A24',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },

  botonBorde: {
    borderColor: '#D99A24',
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },

  botonPeligro: {
    backgroundColor: '#9F3131',
  },

  textoBoton: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  textoBorde: {
    color: '#92400E',
  },

  deshabilitado: {
    opacity: 0.45,
  },

  label: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 13,
    fontSize: 14,
    color: '#172337',
    minHeight: 55,
  },

  error: {
    color: '#B91C1C',
    fontSize: 13,
    marginVertical: 8,
  },

  paso: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  pasoTitulo: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 5,
  },

  cargando: {
    marginVertical: 12,
  },
});
