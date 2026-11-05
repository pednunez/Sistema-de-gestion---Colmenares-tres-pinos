
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import DateTimePicker from
  '@react-native-community/datetimepicker';

import {
  actualizarTratamientoLocal,
  cambiarEstadoTratamientoLocal,
  fechaLocalISO,
  guardarTratamientoLocal,
  limpiarTexto,
  listarTratamientosLocales,
  PRODUCTOS_TRATAMIENTO,
  TIPOS_TRATAMIENTO,
  UNIDADES_DOSIS,
} from './database/tratamientos';

import type {
  DatosTratamiento,
  EstadoTratamiento,
  TratamientoGuardado,
} from './database/tratamientos';

import {
  listarInspeccionesLocales,
} from './database/inspecciones';

import type {
  InspeccionGuardada,
} from './database/inspecciones';

import {
  leerSesionGuardada,
} from './api/auth';

import {
  leerCatalogoLocal,
} from './database/catalogo';

// ==========================================
// TIPOS
// ==========================================

type Props = {
  onVolver: () => void;
};

type CatalogoLocal =
  Awaited<ReturnType<typeof leerCatalogoLocal>>;

const NOMBRES: Record<EstadoTratamiento, string> = {
  PLANIFICADO: 'Planificado',
  EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado',
};

// ==========================================
// FECHAS
// ==========================================

function fechaADate(valor: string): Date {
  const [a, m, d] = valor.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

function dateAFecha(valor: Date): string {
  const a = valor.getFullYear();
  const m = String(
    valor.getMonth() + 1
  ).padStart(2, '0');

  const d = String(
    valor.getDate()
  ).padStart(2, '0');

  return `${a}-${m}-${d}`;
}

function moverAnios(
  valor: string,
  cantidad: number
): string {
  const fecha = fechaADate(valor);
  fecha.setFullYear(
    fecha.getFullYear() + cantidad
  );

  return dateAFecha(fecha);
}

// ==========================================
// FORMULARIO VACÍO
// ==========================================

function formularioVacio(): DatosTratamiento {
  return {
    codigoQR: '',
    inspeccionLocalId: null,
    tipoTratamiento: '',
    producto: '',
    dosis: '',
    motivo: '',
    fechaInicio: fechaLocalISO(),
    fechaFin: null,
    estado: 'EN_CURSO',
    observaciones: '',
  };
}

// ==========================================
// SELECTOR DE FECHA
// ==========================================

type SelectorFechaProps = {
  titulo: string;
  valor: string | null;
  minimo: string;
  maximo: string;
  deshabilitado?: boolean;
  onChange: (valor: string | null) => void;
};

function SelectorFecha({
  titulo,
  valor,
  minimo,
  maximo,
  deshabilitado = false,
  onChange,
}: SelectorFechaProps) {
  const [abierto, setAbierto] = useState(false);
  const [temporal, setTemporal] =
    useState(new Date());

  const abrir = () => {
    if (deshabilitado) return;

    const inicial = valor || fechaLocalISO();

    const ajustada =
      inicial < minimo
        ? minimo
        : inicial > maximo
          ? maximo
          : inicial;

    setTemporal(fechaADate(ajustada));
    setAbierto(true);
  };

  const cambiar = (
    evento: { type: string },
    seleccion?: Date
  ) => {
    if (Platform.OS === 'android') {
      setAbierto(false);

      if (
        evento.type === 'set' &&
        seleccion
      ) {
        onChange(dateAFecha(seleccion));
      }
    } else if (seleccion) {
      setTemporal(seleccion);
    }
  };

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.label}>
        {titulo}
      </Text>

      <Pressable
        disabled={deshabilitado}
        style={[
          styles.input,
          deshabilitado &&
            styles.deshabilitado,
        ]}
        onPress={abrir}
      >
        <Text style={styles.texto}>
          📅 {valor ?? 'Seleccionar fecha'}
        </Text>
      </Pressable>

      {valor && !deshabilitado && (
        <Pressable
          onPress={() => onChange(null)}
        >
          <Text style={styles.enlace}>
            Quitar fecha
          </Text>
        </Pressable>
      )}

      {abierto &&
        Platform.OS === 'android' && (
          <DateTimePicker
            value={temporal}
            mode="date"
            minimumDate={
              fechaADate(minimo)
            }
            maximumDate={
              fechaADate(maximo)
            }
            onChange={cambiar}
          />
        )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={abierto}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setAbierto(false)
          }
        >
          <View style={styles.modalFondo}>
            <View style={styles.modalCaja}>
              <Text
                style={styles.tituloSeccion}
              >
                {titulo}
              </Text>

              <DateTimePicker
                value={temporal}
                mode="date"
                display="spinner"
                locale="es-CL"
                minimumDate={
                  fechaADate(minimo)
                }
                maximumDate={
                  fechaADate(maximo)
                }
                onChange={cambiar}
                style={{ height: 190 }}
              />

              <View style={styles.fila}>
                <Pressable
                  style={styles.botonBorde}
                  onPress={() =>
                    setAbierto(false)
                  }
                >
                  <Text
                    style={styles.textoBorde}
                  >
                    Cancelar
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.boton}
                  onPress={() => {
                    onChange(
                      dateAFecha(temporal)
                    );
                    setAbierto(false);
                  }}
                >
                  <Text
                    style={styles.textoBoton}
                  >
                    Confirmar
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ==========================================
// COMPONENTE OPCIÓN
// ==========================================

type OpcionProps = {
  etiqueta: string;
  activa: boolean;
  onPress: () => void;
  disabled?: boolean;
};

function Opcion({
  etiqueta,
  activa,
  onPress,
  disabled = false,
}: OpcionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.opcion,
        activa && styles.opcionActiva,
        disabled &&
          styles.deshabilitado,
      ]}
    >
      <Text style={styles.textoOpcion}>
        {activa ? '● ' : '○ '}
        {etiqueta}
      </Text>
    </Pressable>
  );
}

// ==========================================
// PANTALLA PRINCIPAL
// ==========================================

export default function TratamientosLocales({
  onVolver,
}: Props) {
  const [tratamientos, setTratamientos] =
    useState<TratamientoGuardado[]>([]);

  const [inspecciones, setInspecciones] =
    useState<InspeccionGuardada[]>([]);

  const [catalogo, setCatalogo] =
    useState<CatalogoLocal>(null);

  const [cargando, setCargando] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const [error, setError] = useState('');

  const [
    formularioVisible,
    setFormularioVisible,
  ] = useState(false);

  const [editandoId, setEditandoId] =
    useState<number | null>(null);

  const [datos, setDatos] =
    useState<DatosTratamiento>(
      formularioVacio()
    );

  const [cantidad, setCantidad] =
    useState('');

  const [unidad, setUnidad] =
    useState('mg');

  const [busqueda, setBusqueda] =
    useState('');

  const [filtro, setFiltro] =
    useState('TODOS');

  const bloqueo = useRef(false);

  // ========================================
  // CARGAR SQLITE Y CATÁLOGO
  // ========================================

  const recargar = useCallback(
    async () => {
      setCargando(true);
      setError('');

      try {
        const sesion =
          await leerSesionGuardada();

        // Inicializar primero las tablas
        // de inspecciones.
        const i =
          await listarInspeccionesLocales();

        const [t, c] = await Promise.all([
          listarTratamientosLocales(),

          sesion
            ? leerCatalogoLocal(
                sesion.usuario.id
              )
            : Promise.resolve(null),
        ]);

        // Mostrar los registros propios.
        // Sin sesión solo se muestran
        // registros antiguos sin propietario.
        const propios = t.filter(
          registro =>
            sesion
              ? registro.usuario_local_id ===
                sesion.usuario.id
              : registro.usuario_local_id ===
                null
        );

        setTratamientos(propios);

        setInspecciones(
          i.filter(registro =>
            sesion
              ? registro.usuario_local_id ===
                sesion.usuario.id
              : registro.usuario_local_id ===
                null
          )
        );

        setCatalogo(c);
      } catch (e) {
        console.error(
          'Error SQLite:',
          e
        );

        setError(
          'Error al consultar registros locales.'
        );
      } finally {
        setCargando(false);
      }
    },
    []
  );

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // ========================================
  // COLMENAS OFICIALES
  // ========================================

  const colmenas = useMemo(
    () => catalogo?.colmenas ?? [],
    [catalogo]
  );

  const inspeccionesColmena =
    inspecciones.filter(
      inspeccion =>
        inspeccion.codigo_qr ===
        datos.codigoQR
    );

  // ========================================
  // FILTROS DEL HISTORIAL
  // ========================================

  const filtrados =
    tratamientos.filter(tratamiento => {
      const texto =
        busqueda.toLowerCase();

      return (
        (
          filtro === 'TODOS' ||
          tratamiento.estado === filtro
        ) &&
        (
          tratamiento.codigo_qr
            .toLowerCase()
            .includes(texto) ||
          tratamiento.tipo_tratamiento
            .toLowerCase()
            .includes(texto) ||
          tratamiento.producto
            .toLowerCase()
            .includes(texto)
        )
      );
    });

  // ========================================
  // CAMBIAR CAMPO
  // ========================================

  const cambiar = <
    K extends keyof DatosTratamiento
  >(
    campo: K,
    valor: DatosTratamiento[K]
  ) => {
    setDatos(actual => ({
      ...actual,
      [campo]: valor,
    }));
  };

  // ========================================
  // NUEVO TRATAMIENTO
  // ========================================

  const nuevo = () => {
    if (colmenas.length === 0) {
      Alert.alert(
        'Catálogo no disponible',
        'Debes iniciar sesión y descargar el catálogo oficial para registrar tratamientos.'
      );

      return;
    }

    setEditandoId(null);
    setDatos(formularioVacio());
    setCantidad('');
    setUnidad('mg');
    setFormularioVisible(true);
  };

  // ========================================
  // EDITAR TRATAMIENTO
  // ========================================

  const editar = (
    t: TratamientoGuardado
  ) => {
    if (!catalogo) {
      Alert.alert(
        'Catálogo no disponible',
        'Necesitas el catálogo oficial del usuario para editar este tratamiento.'
      );

      return;
    }

    if (
      t.sincronizacion !== 'PENDIENTE' ||
      ![
        'PLANIFICADO',
        'EN_CURSO',
      ].includes(t.estado)
    ) {
      Alert.alert(
        'Edición bloqueada',
        'Un tratamiento cerrado o sincronizado no se puede editar.'
      );

      return;
    }

    if (
      !catalogo.colmenas.some(
        c =>
          c.codigo_qr === t.codigo_qr
      )
    ) {
      Alert.alert(
        'Colmena no disponible',
        'La colmena no se encuentra en el catálogo oficial.'
      );

      return;
    }

    const coincidencia = t.dosis.match(
      /^(\d+(?:[.,]\d+)?) (mg|g|ml|l|tiras|unidades)$/
    );

    setCantidad(
      coincidencia?.[1] ?? ''
    );

    setUnidad(
      coincidencia?.[2] ?? 'mg'
    );

    setDatos({
      codigoQR: t.codigo_qr,
      inspeccionLocalId:
        t.inspeccion_local_id,
      tipoTratamiento:
        t.tipo_tratamiento,
      producto: t.producto,
      dosis: t.dosis,
      motivo: t.motivo,
      fechaInicio: t.fecha_inicio,
      fechaFin: t.fecha_fin,
      estado: t.estado,
      observaciones:
        t.observaciones,
    });

    setEditandoId(t.id);
    setFormularioVisible(true);
  };

  // ========================================
  // GUARDAR
  // ========================================

  const guardar = async () => {
    if (bloqueo.current) return;

    bloqueo.current = true;
    setGuardando(true);

    try {
      const dosis =
        datos.producto ===
        'Sin producto (prueba)'
          ? ''
          : cantidad.trim()
            ? `${cantidad.replace(',', '.')} ${unidad}`
            : '';

      const seguros = {
        ...datos,
        dosis,
      };

      if (editandoId === null) {
        await guardarTratamientoLocal(
          seguros
        );
      } else {
        await actualizarTratamientoLocal(
          editandoId,
          seguros
        );
      }

      await recargar();

      setFormularioVisible(false);

      Alert.alert(
        'Tratamiento guardado',
        'Registro local de prueba guardado en SQLite. La sincronización aún no está habilitada.'
      );
    } catch (e) {
      Alert.alert(
        'Datos inválidos',
        e instanceof Error
          ? e.message
          : 'No se pudo guardar.'
      );
    } finally {
      bloqueo.current = false;
      setGuardando(false);
    }
  };

  // ========================================
  // FINALIZAR O CANCELAR
  // ========================================

  const cambiarEstado = (
    t: TratamientoGuardado,
    estado:
      | 'FINALIZADO'
      | 'CANCELADO'
  ) => {
    Alert.alert(
      'Confirmar',
      `¿Quieres ${
        estado === 'FINALIZADO'
          ? 'finalizar'
          : 'cancelar'
      } este tratamiento?`,
      [
        {
          text: 'Volver',
          style: 'cancel',
        },
        {
          text: 'Confirmar',
          onPress: () => {
            void (async () => {
              try {
                await cambiarEstadoTratamientoLocal(
                  t.id,
                  estado
                );

                await recargar();
              } catch (e) {
                Alert.alert(
                  'Error',
                  e instanceof Error
                    ? e.message
                    : 'No se pudo actualizar.'
                );
              }
            })();
          },
        },
      ]
    );
  };

  // ========================================
  // FORMULARIO
  // ========================================

  if (formularioVisible) {
    const hoy = fechaLocalISO();
    const minimo =
      moverAnios(hoy, -5);

    const maximo =
      moverAnios(hoy, 1);

    return (
      <ScrollView
        style={styles.pantalla}
        contentContainerStyle={
          styles.contenido
        }
        keyboardShouldPersistTaps="handled"
      >
        <StatusBar
          barStyle="dark-content"
        />

        <Pressable
          disabled={guardando}
          onPress={() =>
            setFormularioVisible(false)
          }
        >
          <Text style={styles.enlace}>
            ‹ Volver a tratamientos
          </Text>
        </Pressable>

        <Text style={styles.titulo}>
          {editandoId === null
            ? 'Registrar tratamiento'
            : 'Editar tratamiento'}
        </Text>

        <View style={styles.aviso}>
          <Text
            style={styles.avisoTexto}
          >
            Modo de prueba.
            Los tipos y productos
            disponibles son simulados.
            No representan medicamentos
            autorizados ni aplicaciones
            reales.
          </Text>
        </View>

        <Text
          style={styles.tituloSeccion}
        >
          Colmena *
        </Text>

        {colmenas.map(colmena => {
          const apiario =
            catalogo?.apiarios.find(
              item =>
                item.id ===
                colmena.apiario_id
            );

          return (
            <Opcion
              key={colmena.id}
              etiqueta={
                `${colmena.codigo} · ${
                  apiario?.nombre ??
                  'Apiario sin nombre'
                }`
              }
              activa={
                datos.codigoQR ===
                colmena.codigo_qr
              }
              disabled={
                editandoId !== null
              }
              onPress={() => {
                setDatos(actual => ({
                  ...actual,
                  codigoQR:
                    colmena.codigo_qr,
                  inspeccionLocalId: null,
                }));
              }}
            />
          );
        })}

        {colmenas.length === 0 && (
          <View style={styles.aviso}>
            <Text
              style={styles.avisoTexto}
            >
              No hay colmenas
              oficiales disponibles.
              Inicia sesión para
              descargar el catálogo.
            </Text>
          </View>
        )}

        {editandoId === null &&
          inspeccionesColmena.length > 0 && (
            <>
              <Text
                style={styles.tituloSeccion}
              >
                Inspección asociada
              </Text>

              <Opcion
                etiqueta="Ninguna"
                activa={
                  datos.inspeccionLocalId ===
                  null
                }
                onPress={() =>
                  cambiar(
                    'inspeccionLocalId',
                    null
                  )
                }
              />

              {inspeccionesColmena.map(
                inspeccion => (
                  <Opcion
                    key={inspeccion.id}
                    etiqueta={
                      `Inspección N.º ${inspeccion.id}`
                    }
                    activa={
                      datos.inspeccionLocalId ===
                      inspeccion.id
                    }
                    onPress={() =>
                      cambiar(
                        'inspeccionLocalId',
                        inspeccion.id
                      )
                    }
                  />
                )
              )}
            </>
          )}

        <Text
          style={styles.tituloSeccion}
        >
          Tipo de tratamiento *
        </Text>

        {TIPOS_TRATAMIENTO.map(
          tipo => (
            <Opcion
              key={tipo}
              etiqueta={tipo}
              activa={
                datos.tipoTratamiento ===
                tipo
              }
              onPress={() =>
                cambiar(
                  'tipoTratamiento',
                  tipo
                )
              }
            />
          )
        )}

        <Text
          style={styles.tituloSeccion}
        >
          Producto *
        </Text>

        {PRODUCTOS_TRATAMIENTO.map(
          producto => (
            <Opcion
              key={producto}
              etiqueta={producto}
              activa={
                datos.producto ===
                producto
              }
              onPress={() => {
                cambiar(
                  'producto',
                  producto
                );

                if (
                  producto ===
                  'Sin producto (prueba)'
                ) {
                  setCantidad('');
                }
              }}
            />
          )
        )}

        {datos.producto ===
          'Producto simulado' && (
            <>
              <Text
                style={styles.tituloSeccion}
              >
                Dosis de prueba *
              </Text>

              <Text style={styles.label}>
                Cantidad
              </Text>

              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={cantidad}
                onChangeText={valor => {
                  const limpio = valor
                    .replace(
                      /[^0-9.,]/g,
                      ''
                    )
                    .replace(',', '.');

                  if (
                    /^\d{0,6}(?:\.\d{0,3})?$/.test(
                      limpio
                    )
                  ) {
                    setCantidad(limpio);
                  }
                }}
                placeholder="Ejemplo: 5"
              />

              <Text style={styles.label}>
                Unidad
              </Text>

              <View style={styles.fila}>
                {UNIDADES_DOSIS.map(
                  u => (
                    <Opcion
                      key={u}
                      etiqueta={u}
                      activa={
                        unidad === u
                      }
                      onPress={() =>
                        setUnidad(u)
                      }
                    />
                  )
                )}
              </View>
            </>
          )}

        <Text
          style={styles.tituloSeccion}
        >
          Estado *
        </Text>

        {(
          [
            'PLANIFICADO',
            'EN_CURSO',
          ] as const
        ).map(estado => (
          <Opcion
            key={estado}
            etiqueta={
              NOMBRES[estado]
            }
            activa={
              datos.estado === estado
            }
            disabled={
              editandoId !== null
            }
            onPress={() => {
              setDatos(actual => ({
                ...actual,
                estado,
                fechaFin:
                  estado === 'EN_CURSO'
                    ? null
                    : actual.fechaFin,
              }));
            }}
          />
        ))}

        <SelectorFecha
          titulo="Fecha de inicio *"
          valor={datos.fechaInicio}
          minimo={minimo}
          maximo={
            datos.estado ===
            'PLANIFICADO'
              ? maximo
              : hoy
          }
          deshabilitado={
            editandoId !== null
          }
          onChange={fecha => {
            if (!fecha) return;

            setDatos(actual => ({
              ...actual,
              fechaInicio: fecha,
              fechaFin:
                actual.fechaFin &&
                actual.fechaFin < fecha
                  ? null
                  : actual.fechaFin,
            }));
          }}
        />

        {datos.estado ===
          'PLANIFICADO' && (
            <SelectorFecha
              titulo="Fecha de término planificada"
              valor={datos.fechaFin}
              minimo={
                datos.fechaInicio
              }
              maximo={maximo}
              onChange={fecha =>
                cambiar(
                  'fechaFin',
                  fecha
                )
              }
            />
          )}

        <Text style={styles.label}>
          Motivo
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.area,
          ]}
          multiline
          textAlignVertical="top"
          maxLength={500}
          value={datos.motivo}
          onChangeText={valor =>
            cambiar(
              'motivo',
              limpiarTexto(valor, 500)
            )
          }
          placeholder="Describe el motivo"
        />

        <Text style={styles.label}>
          Observaciones
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.area,
          ]}
          multiline
          textAlignVertical="top"
          maxLength={1000}
          value={
            datos.observaciones
          }
          onChangeText={valor =>
            cambiar(
              'observaciones',
              limpiarTexto(valor, 1000)
            )
          }
          placeholder="Observaciones de prueba"
        />

        <Pressable
          style={[
            styles.botonAncho,
            guardando &&
              styles.deshabilitado,
          ]}
          disabled={guardando}
          onPress={() =>
            void guardar()
          }
        >
          <Text
            style={styles.textoBoton}
          >
            {guardando
              ? 'Guardando...'
              : 'Guardar tratamiento'}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ========================================
  // HISTORIAL
  // ========================================

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={
        styles.contenido
      }
    >
      <StatusBar
        barStyle="dark-content"
      />

      <Pressable
        onPress={onVolver}
      >
        <Text style={styles.enlace}>
          ‹ Volver al inicio
        </Text>
      </Pressable>

      <Text style={styles.titulo}>
        💊 Tratamientos
      </Text>

      <Text style={styles.subtitulo}>
        Registros locales
      </Text>

      <View style={styles.resumen}>
        <Text
          style={styles.resumenNumero}
        >
          {tratamientos.length} registros
        </Text>

        <Text style={styles.texto}>
          {
            tratamientos.filter(
              t =>
                t.sincronizacion ===
                'PENDIENTE'
            ).length
          } pendientes de sincronización
        </Text>
      </View>

      <Pressable
        style={styles.botonAncho}
        onPress={nuevo}
      >
        <Text
          style={styles.textoBoton}
        >
          + Registrar tratamiento
        </Text>
      </Pressable>

      <TextInput
        style={styles.input}
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar en el historial"
      />

      <View style={styles.fila}>
        {(
          [
            'TODOS',
            ...Object.keys(NOMBRES),
          ]
        ).map(estado => (
          <Opcion
            key={estado}
            etiqueta={
              estado === 'TODOS'
                ? 'Todos'
                : NOMBRES[
                    estado as
                      EstadoTratamiento
                  ]
            }
            activa={
              filtro === estado
            }
            onPress={() =>
              setFiltro(estado)
            }
          />
        ))}
      </View>

      <Pressable
        onPress={() =>
          void recargar()
        }
      >
        <Text style={styles.enlace}>
          Actualizar historial
        </Text>
      </Pressable>

      {cargando ? (
        <ActivityIndicator
          size="large"
          color="#D99A24"
        />
      ) : error ? (
        <Text style={styles.error}>
          {error}
        </Text>
      ) : filtrados.length === 0 ? (
        <View style={styles.tarjeta}>
          <Text>
            No hay resultados.
          </Text>
        </View>
      ) : (
        filtrados.map(t => {
          const editable =
            t.sincronizacion ===
              'PENDIENTE' &&
            [
              'PLANIFICADO',
              'EN_CURSO',
            ].includes(t.estado) &&
            t.usuario_local_id !== null;

          const codigoColmena =
            catalogo?.colmenas.find(
              c =>
                c.codigo_qr ===
                t.codigo_qr
            )?.codigo ?? t.codigo_qr;

          return (
            <View
              key={t.id}
              style={styles.tarjeta}
            >
              <Text
                style={
                  styles.tarjetaTitulo
                }
              >
                {t.tipo_tratamiento}
              </Text>

              <Text style={styles.codigo}>
                {codigoColmena}
              </Text>

              <View style={styles.aviso}>
                <Text
                  style={styles.avisoTexto}
                >
                  {NOMBRES[t.estado]}
                  {' · '}
                  {
                    t.sincronizacion ===
                    'PENDIENTE'
                      ? 'Pendiente de envío'
                      : 'Sincronizado'
                  }
                </Text>
              </View>

              <Text style={styles.detalle}>
                Producto: {
                  t.producto ||
                  'Sin registrar'
                }
              </Text>

              <Text style={styles.detalle}>
                Dosis: {
                  t.dosis ||
                  'Sin dosis'
                }
              </Text>

              <Text style={styles.detalle}>
                Inicio: {
                  t.fecha_inicio
                }
              </Text>

              <Text style={styles.detalle}>
                Término: {
                  t.fecha_fin ||
                  'Sin definir'
                }
              </Text>

              {!!t.motivo && (
                <Text
                  style={styles.detalle}
                >
                  Motivo: {t.motivo}
                </Text>
              )}

              {!!t.observaciones && (
                <Text
                  style={styles.detalle}
                >
                  Observaciones: {
                    t.observaciones
                  }
                </Text>
              )}

              {editable && (
                <View
                  style={styles.fila}
                >
                  <Pressable
                    style={
                      styles.botonBorde
                    }
                    onPress={() =>
                      editar(t)
                    }
                  >
                    <Text
                      style={
                        styles.textoBorde
                      }
                    >
                      Editar
                    </Text>
                  </Pressable>

                  <Pressable
                    style={
                      styles.botonBorde
                    }
                    onPress={() =>
                      cambiarEstado(
                        t,
                        'FINALIZADO'
                      )
                    }
                  >
                    <Text
                      style={
                        styles.textoBorde
                      }
                    >
                      Finalizar
                    </Text>
                  </Pressable>

                  <Pressable
                    style={
                      styles.botonBorde
                    }
                    onPress={() =>
                      cambiarEstado(
                        t,
                        'CANCELADO'
                      )
                    }
                  >
                    <Text
                      style={
                        styles.textoBorde
                      }
                    >
                      Cancelar
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })
      )}

      <Text style={styles.subtitulo}>
        La sincronización automática
        con FastAPI todavía no
        está implementada.
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
    padding: 20,
    paddingTop: 60,
    paddingBottom: 50,
  },

  titulo: {
    fontSize: 26,
    fontWeight: '800',
    color: '#182337',
    marginTop: 18,
    marginBottom: 15,
  },

  subtitulo: {
    color: '#64748B',
    fontSize: 13,
    marginVertical: 12,
  },

  tituloSeccion: {
    fontSize: 18,
    fontWeight: '800',
    color: '#182337',
    marginTop: 20,
    marginBottom: 12,
  },

  label: {
    fontWeight: '700',
    color: '#334155',
    fontSize: 14,
    marginTop: 12,
    marginBottom: 8,
  },

  texto: {
    color: '#334155',
    fontSize: 14,
  },

  enlace: {
    color: '#92400E',
    fontWeight: '700',
    marginVertical: 12,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 15,
    fontSize: 15,
    color: '#182337',
    marginBottom: 12,
  },

  area: {
    minHeight: 100,
  },

  fila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 10,
  },

  opcion: {
    borderWidth: 1,
    borderColor: '#D6C29E',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 7,
  },

  opcionActiva: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D99A24',
  },

  textoOpcion: {
    color: '#775315',
    fontSize: 13,
    fontWeight: '700',
  },

  boton: {
    backgroundColor: '#D99A24',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginVertical: 5,
  },

  botonAncho: {
    backgroundColor: '#D99A24',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 14,
  },

  textoBoton: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },

  botonBorde: {
    borderWidth: 1,
    borderColor: '#D99A24',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },

  textoBorde: {
    fontWeight: '700',
    color: '#92400E',
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },

  tarjetaTitulo: {
    fontWeight: '800',
    fontSize: 18,
    color: '#182337',
  },

  codigo: {
    color: '#92400E',
    fontWeight: '700',
    marginVertical: 10,
  },

  detalle: {
    color: '#475569',
    marginVertical: 4,
    fontSize: 14,
  },

  resumen: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 14,
    marginBottom: 10,
  },

  resumenNumero: {
    color: '#92400E',
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 8,
  },

  aviso: {
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 12,
    marginVertical: 12,
  },

  avisoTexto: {
    color: '#78350F',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },

  error: {
    color: '#B91C1C',
  },

  deshabilitado: {
    opacity: 0.45,
  },

  modalFondo: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    padding: 22,
  },

  modalCaja: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
  },
});
