
import React, {
  useEffect,
  useMemo,
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
} from './database/inspeccionesAvanzadas';

import type {
  EstadoGeneral,
  InspeccionAvanzada,
  MarcoLocal,
  Nivel,
  NivelMiel,
  UbicacionMarco,
} from './database/inspeccionesAvanzadas';

type Props = {
  codigoQR: string;
  onVolver: () => void;
};

type Respuesta = 'SI' | 'NO' | 'NR';

type Opcion = {
  valor: string;
  texto: string;
};

const SI_NO: Opcion[] = [
  { valor: 'SI', texto: 'Sí' },
  { valor: 'NO', texto: 'No' },
];

const SI_NO_NR: Opcion[] = [
  ...SI_NO,
  { valor: 'NR', texto: 'No revisado' },
];

const ESTADOS: Opcion[] = [
  { valor: 'BUENO', texto: 'Bueno' },
  { valor: 'REGULAR', texto: 'Regular' },
  { valor: 'CRITICO', texto: 'Crítico' },
];

const NIVELES: Opcion[] = [
  { valor: 'BAJO', texto: 'Bajo' },
  { valor: 'MEDIO', texto: 'Medio' },
  { valor: 'ALTO', texto: 'Alto' },
  { valor: 'NR', texto: 'No revisado' },
];

const NIVELES_MIEL: Opcion[] = [
  { valor: 'SIN_MIEL', texto: 'Sin miel' },
  { valor: 'POCA', texto: 'Poca' },
  { valor: 'MEDIA', texto: 'Media' },
  { valor: 'ABUNDANTE', texto: 'Abundante' },
  { valor: 'NR', texto: 'No revisado' },
];

const TIRAS: Opcion[] = [
  { valor: '0', texto: 'No se aplicaron' },
  { valor: '1', texto: '1 tira' },
  { valor: '2', texto: '2 tiras' },
  { valor: '3', texto: '3 tiras' },
];

function booleano(valor: Respuesta): boolean | null {
  if (valor === 'NR') return null;
  return valor === 'SI';
}

// SELECTOR CONTROLADO
function Selector({
  titulo,
  valor,
  opciones,
  onCambiar,
}: {
  titulo: string;
  valor: string;
  opciones: Opcion[];
  onCambiar: (valor: string) => void;
}) {
  return (
    <View style={styles.grupo}>
      <Text style={styles.label}>{titulo}</Text>

      <View style={styles.fila}>
        {opciones.map(opcion => (
          <Pressable
            key={opcion.valor}
            style={[
              styles.opcion,
              valor === opcion.valor &&
                styles.opcionActiva,
            ]}
            onPress={() => onCambiar(opcion.valor)}
          >
            <Text style={styles.opcionTexto}>
              {valor === opcion.valor ? '● ' : '○ '}
              {opcion.texto}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// CAJA CON DIEZ POSICIONES
function RegistroCaja({
  titulo,
  marcos,
  destinos,
  cargandoDestinos,
  onCambiar,
}: {
  titulo: string;
  marcos: MarcoLocal[];
  destinos: string[];
  cargandoDestinos: boolean;
  onCambiar: (
    numero: number,
    cambios: Partial<MarcoLocal>
  ) => void;
}) {
  const registrados = marcos.filter(
    m => m.contenido !== ''
  ).length;

  return (
    <View style={styles.tarjeta}>
      <Text style={styles.tituloSeccion}>
        {titulo}
      </Text>

      <Text style={styles.ayuda}>
        {registrados} de 10 posiciones registradas.
      </Text>

      {marcos.map(marco => {
        const presente =
          marco.contenido !== '' &&
          marco.contenido !== 'SIN_MARCO';

        return (
          <View key={marco.numero} style={styles.marco}>
            <Text style={styles.marcoTitulo}>
              Marco {marco.numero}
            </Text>

            <View style={styles.fila}>
              {OPCIONES_MARCOS.map(opcion => (
                <Pressable
                  key={opcion.valor}
                  style={[
                    styles.opcion,
                    marco.contenido === opcion.valor &&
                      styles.opcionActiva,
                  ]}
                  onPress={() =>
                    onCambiar(marco.numero, {
                      contenido: opcion.valor,
                    })
                  }
                >
                  <Text style={styles.opcionTexto}>
                    {marco.contenido === opcion.valor
                      ? '● '
                      : '○ '}
                    {opcion.texto}
                  </Text>
                </Pressable>
              ))}
            </View>

            {presente && (
              <Pressable
                style={[
                  styles.botonBorde,
                  marco.transferir &&
                    styles.opcionActiva,
                ]}
                onPress={() =>
                  onCambiar(marco.numero, {
                    transferir: !marco.transferir,
                    destino: '',
                  })
                }
              >
                <Text style={styles.textoBorde}>
                  {marco.transferir
                    ? '✓ Transferencia seleccionada'
                    : 'Transferir este marco'}
                </Text>
              </Pressable>
            )}

            {marco.transferir && (
              <View style={styles.destino}>
                <Text style={styles.label}>
                  Colmena de destino *
                </Text>

                {cargandoDestinos ? (
                  <ActivityIndicator color="#D99A24" />
                ) : destinos.length === 0 ? (
                  <Text style={styles.error}>
                    No existe otra colmena local.
                    Desmarca esta transferencia.
                  </Text>
                ) : (
                  destinos.map(codigo => (
                    <Pressable
                      key={codigo}
                      style={[
                        styles.opcion,
                        marco.destino === codigo &&
                          styles.opcionActiva,
                      ]}
                      onPress={() =>
                        onCambiar(marco.numero, {
                          destino: codigo,
                        })
                      }
                    >
                      <Text style={styles.opcionTexto}>
                        {marco.destino === codigo
                          ? '● '
                          : '○ '}
                        {codigo}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function FormularioInspeccion({
  codigoQR,
  onVolver,
}: Props) {
  const [estado, setEstado] = useState('');

  const [reina, setReina] =
    useState<Respuesta>('NR');

  const [cria, setCria] =
    useState<Respuesta>('NR');

  const [postura, setPostura] =
    useState<Respuesta>('NR');

  const [poblacion, setPoblacion] =
    useState('NR');

  const [reservas, setReservas] =
    useState('NR');

  const [nivelMiel, setNivelMiel] =
    useState('NR');

  const [alimentacion, setAlimentacion] =
    useState('');

  const [signos, setSignos] =
    useState(false);

  const [enfermedad, setEnfermedad] =
    useState('');

  const [tiras, setTiras] =
    useState('0');

  const [observaciones, setObservaciones] =
    useState('');

  const [camara, setCamara] =
    useState<MarcoLocal[]>(crearCaja());

  const [tieneAlza, setTieneAlza] =
    useState(false);

  const [alza, setAlza] =
    useState<MarcoLocal[]>(crearCaja());

  const [destinos, setDestinos] =
    useState<string[]>([]);

  const [cargandoDestinos, setCargandoDestinos] =
    useState(true);

  const [guardando, setGuardando] =
    useState(false);

  const bloqueo = useRef(false);

  useEffect(() => {
    let activo = true;

    listarDestinosLocales(codigoQR)
      .then(lista => {
        if (activo) setDestinos(lista);
      })
      .catch(error => {
        console.error('Destinos:', error);
        if (activo) setDestinos([]);
      })
      .finally(() => {
        if (activo) setCargandoDestinos(false);
      });

    return () => {
      activo = false;
    };
  }, [codigoQR]);

  const cambiarMarco = (
    ubicacion: UbicacionMarco,
    numero: number,
    cambios: Partial<MarcoLocal>
  ) => {
    const actualizar = (anteriores: MarcoLocal[]) =>
      anteriores.map(marco => {
        if (marco.numero !== numero) {
          return marco;
        }

        const nuevo = {
          ...marco,
          ...cambios,
        };

        // SI LA POSICIÓN ESTÁ VACÍA,
        // NO SE PUEDE TRANSFERIR.
        if (
          !nuevo.contenido ||
          nuevo.contenido === 'SIN_MARCO'
        ) {
          return {
            ...nuevo,
            transferir: false,
            destino: '',
          };
        }

        if (!nuevo.transferir) {
          return {
            ...nuevo,
            destino: '',
          };
        }

        return nuevo;
      });

    if (ubicacion === 'CAMARA_CRIA') {
      setCamara(actualizar);
    } else {
      setAlza(actualizar);
    }
  };

  const resumen = useMemo(
    () => resumenMarcos({
      camara,
      alza,
      tieneAlza,
    }),
    [camara, alza, tieneAlza]
  );

  const guardar = async () => {
    if (bloqueo.current) return;

    const datos: InspeccionAvanzada = {
      codigoQR,

      estadoGeneral:
        estado
          ? estado as EstadoGeneral
          : null,

      reinaObservada: booleano(reina),
      presenciaCria: booleano(cria),
      postura: booleano(postura),

      nivelPoblacion:
        poblacion === 'NR'
          ? null
          : poblacion as Nivel,

      reservasAlimento:
        reservas === 'NR'
          ? null
          : reservas as Nivel,

      nivelMiel:
        nivelMiel === 'NR'
          ? null
          : nivelMiel as NivelMiel,

      alimentacion: alimentacion.trim(),
      signosEnfermedad: signos,

      enfermedadObservada:
        signos ? enfermedad.trim() : '',

      tirasMedicamento:
        signos && tiras !== '0'
          ? Number(tiras)
          : null,

      observaciones: observaciones.trim(),
      tieneAlza,
      camara,
      alza,
    };

    bloqueo.current = true;
    setGuardando(true);

    try {
      const id =
        await guardarInspeccionAvanzada(datos);

      Alert.alert(
        'Inspección guardada',
        `Inspección N.º ${id} guardada correctamente.\n\nMarcos: ${resumen.total}\nCon cría: ${resumen.cria}\nCon miel: ${resumen.miel}\nTransferencias preparadas: ${resumen.transferencias}\n\nPendiente de sincronización.`,
        [
          {
            text: 'Volver a la colmena',
            onPress: onVolver,
          },
        ]
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

  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      <Text style={styles.icono}>🐝</Text>

      <Text style={styles.titulo}>
        Nueva inspección
      </Text>

      <Text style={styles.subtitulo}>
        Formulario con validaciones estrictas
      </Text>

      <View style={styles.tarjeta}>
        <Text style={styles.ayuda}>
          Colmena identificada
        </Text>

        <Text style={styles.codigo}>
          {codigoQR}
        </Text>
      </View>

      <Text style={styles.tituloSeccion}>
        Estado de la colmena
      </Text>

      <Selector
        titulo="Estado general *"
        valor={estado}
        opciones={ESTADOS}
        onCambiar={setEstado}
      />

      <Selector
        titulo="¿Se observó la reina?"
        valor={reina}
        opciones={SI_NO_NR}
        onCambiar={v => setReina(v as Respuesta)}
      />

      <Selector
        titulo="¿Hay cría?"
        valor={cria}
        opciones={SI_NO_NR}
        onCambiar={v => {
          const respuesta = v as Respuesta;
          setCria(respuesta);

          if (respuesta === 'NO') {
            setPostura('NO');
          }
        }}
      />

      <Selector
        titulo="¿Hay postura?"
        valor={postura}
        opciones={
          cria === 'NO'
            ? [{ valor: 'NO', texto: 'No' }]
            : SI_NO_NR
        }
        onCambiar={v => setPostura(v as Respuesta)}
      />

      <Selector
        titulo="Nivel de población"
        valor={poblacion}
        opciones={NIVELES}
        onCambiar={setPoblacion}
      />

      <Selector
        titulo="Reservas de alimento"
        valor={reservas}
        opciones={NIVELES}
        onCambiar={setReservas}
      />

      <Selector
        titulo="Nivel de miel observado"
        valor={nivelMiel}
        opciones={NIVELES_MIEL}
        onCambiar={setNivelMiel}
      />

      <Text style={styles.tituloSeccion}>
        Alimentación
      </Text>

      <Text style={styles.label}>
        Alimentación suministrada
      </Text>

      <TextInput
        style={styles.input}
        value={alimentacion}
        onChangeText={v =>
          setAlimentacion(
            limpiarObservacion(v, 500)
          )
        }
        maxLength={500}
        placeholder="Descripción de alimentación"
      />

      <Text style={styles.tituloSeccion}>
        Evaluación sanitaria
      </Text>

      <Selector
        titulo="¿Hay signos de enfermedad?"
        valor={signos ? 'SI' : 'NO'}
        opciones={SI_NO}
        onCambiar={v => {
          const existe = v === 'SI';
          setSignos(existe);

          if (!existe) {
            setEnfermedad('');
            setTiras('0');
          }
        }}
      />

      {signos && (
        <>
          <Text style={styles.label}>
            Signos observados *
          </Text>

          <TextInput
            style={[styles.input, styles.area]}
            multiline
            textAlignVertical="top"
            value={enfermedad}
            onChangeText={v =>
              setEnfermedad(
                limpiarObservacion(v, 500)
              )
            }
            maxLength={500}
            placeholder="Describe lo observado"
          />

          <Selector
            titulo="Tiras aplicadas"
            valor={tiras}
            opciones={TIRAS}
            onCambiar={setTiras}
          />
        </>
      )}

      <Text style={styles.tituloSeccion}>
        Registro marco por marco
      </Text>

      <Text style={styles.ayuda}>
        Debes registrar las diez posiciones de cada
        caja utilizada. Selecciona Sin marco cuando
        una posición esté vacía. Los totales se
        calcularán automáticamente.
      </Text>

      <RegistroCaja
        titulo="Cámara de cría"
        marcos={camara}
        destinos={destinos}
        cargandoDestinos={cargandoDestinos}
        onCambiar={(numero, cambios) =>
          cambiarMarco(
            'CAMARA_CRIA',
            numero,
            cambios
          )
        }
      />

      <Selector
        titulo="¿La colmena tiene alza?"
        valor={tieneAlza ? 'SI' : 'NO'}
        opciones={SI_NO}
        onCambiar={v => {
          const tiene = v === 'SI';
          setTieneAlza(tiene);

          if (!tiene) {
            setAlza(crearCaja());
          }
        }}
      />

      {tieneAlza && (
        <RegistroCaja
          titulo="Alza"
          marcos={alza}
          destinos={destinos}
          cargandoDestinos={cargandoDestinos}
          onCambiar={(numero, cambios) =>
            cambiarMarco('ALZA', numero, cambios)
          }
        />
      )}

      <View style={styles.tarjeta}>
        <Text style={styles.tituloSeccion}>
          Resumen automático
        </Text>

        <Text style={styles.detalle}>
          Marcos presentes: {resumen.total}
        </Text>

        <Text style={styles.detalle}>
          Marcos con cría: {resumen.cria}
        </Text>

        <Text style={styles.detalle}>
          Marcos con miel: {resumen.miel}
        </Text>

        <Text style={styles.detalle}>
          Transferencias preparadas: {
            resumen.transferencias
          }
        </Text>

        <Text style={styles.detalle}>
          Posiciones sin registrar: {
            resumen.sinRegistrar
          }
        </Text>

        {resumen.sinRegistrar > 0 && (
          <Text style={styles.error}>
            Completa las posiciones pendientes antes
            de guardar.
          </Text>
        )}
      </View>

      <Text style={styles.tituloSeccion}>
        Observaciones
      </Text>

      <TextInput
        style={[styles.input, styles.area]}
        multiline
        textAlignVertical="top"
        value={observaciones}
        onChangeText={v =>
          setObservaciones(
            limpiarObservacion(v, 1000)
          )
        }
        maxLength={1000}
        placeholder="Observaciones de la inspección"
      />

      <View style={styles.aviso}>
        <Text style={styles.avisoTexto}>
          Guardado offline: todos los detalles y marcos
          se almacenan juntos en SQLite. Las transferencias
          no modifican el inventario oficial hasta
          su futura validación por FastAPI.
        </Text>
      </View>

      <Pressable
        style={[
          styles.botonPrincipal,
          guardando && styles.deshabilitado,
        ]}
        disabled={guardando}
        onPress={() => void guardar()}
      >
        <Text style={styles.textoPrincipal}>
          {guardando
            ? 'Guardando...'
            : 'Guardar inspección'}
        </Text>
      </Pressable>

      <Pressable
        style={styles.botonSecundario}
        disabled={guardando}
        onPress={onVolver}
      >
        <Text style={styles.textoSecundario}>
          Volver a la colmena
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: '#FFF9EC',
  },
  contenido: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 55,
  },
  icono: {
    fontSize: 48,
    textAlign: 'center',
  },
  titulo: {
    fontSize: 27,
    fontWeight: '800',
    color: '#3D321B',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitulo: {
    color: '#766B52',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  tituloSeccion: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3D321B',
    marginTop: 22,
    marginBottom: 12,
  },
  label: {
    fontWeight: '700',
    fontSize: 15,
    color: '#594D36',
    marginBottom: 10,
  },
  grupo: {
    marginBottom: 20,
  },
  fila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  opcion: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDCEAE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 7,
  },
  opcionActiva: {
    backgroundColor: '#FFF0CC',
    borderColor: '#D99A24',
  },
  opcionTexto: {
    color: '#594D36',
    fontWeight: '700',
    fontSize: 13,
  },
  tarjeta: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E5DAC5',
    marginVertical: 12,
  },
  codigo: {
    fontSize: 21,
    fontWeight: '800',
    color: '#3D321B',
  },
  marco: {
    borderTopWidth: 1,
    borderTopColor: '#EAE3D6',
    paddingVertical: 16,
  },
  marcoTitulo: {
    color: '#3D321B',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
  },
  ayuda: {
    fontSize: 13,
    lineHeight: 20,
    color: '#766B52',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDCEAE',
    borderRadius: 12,
    padding: 15,
    fontSize: 15,
    color: '#3D321B',
    marginBottom: 15,
  },
  area: {
    minHeight: 115,
  },
  detalle: {
    color: '#594D36',
    fontSize: 14,
    marginVertical: 5,
  },
  botonBorde: {
    borderWidth: 1,
    borderColor: '#D99A24',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  textoBorde: {
    color: '#775315',
    fontWeight: '700',
  },
  destino: {
    padding: 13,
    backgroundColor: '#FFF9EC',
    marginTop: 12,
    borderRadius: 10,
  },
  error: {
    color: '#B45309',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  aviso: {
    backgroundColor: '#FFF0CC',
    padding: 16,
    borderRadius: 12,
    marginTop: 18,
  },
  avisoTexto: {
    color: '#775315',
    lineHeight: 20,
    fontSize: 13,
  },
  botonPrincipal: {
    backgroundColor: '#D99A24',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 25,
  },
  textoPrincipal: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  botonSecundario: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D99A24',
    borderRadius: 12,
    padding: 18,
    marginTop: 12,
    alignItems: 'center',
  },
  textoSecundario: {
    color: '#775315',
    fontWeight: '700',
    fontSize: 16,
  },
  deshabilitado: {
    opacity: 0.5,
  },
});
