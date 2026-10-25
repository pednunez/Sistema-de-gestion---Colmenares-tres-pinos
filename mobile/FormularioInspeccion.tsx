
import React, { useRef, useState } from 'react';

import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  StatusBar,
} from 'react-native';

import {
  guardarInspeccionLocal,
} from './database/inspecciones';

// PROPIEDADES DEL FORMULARIO
type Props = {
  codigoQR: string;
  onVolver: () => void;
};

// ESTADOS PERMITIDOS PARA LA REINA
type EstadoReina =
  | 'Vista'
  | 'No vista'
  | 'Sin evaluar';

export default function FormularioInspeccion({
  codigoQR,
  onVolver,
}: Props) {

  // DATOS DEL FORMULARIO
  const [marcos, setMarcos] = useState('');
  const [cria, setCria] = useState('');
  const [miel, setMiel] = useState('');

  const [reina, setReina] = useState<EstadoReina>(
    'Sin evaluar'
  );

  const [observaciones, setObservaciones] = useState('');

  // CONTROL DEL GUARDADO
  const [guardando, setGuardando] = useState(false);
  const bloqueoGuardado = useRef(false);

  // VALIDAR Y GUARDAR INSPECCIÓN
  const guardarFormulario = async () => {

    // EVITAR GUARDADOS DUPLICADOS
    if (bloqueoGuardado.current) {
      return;
    }

    // VALIDACIÓN DE CAMPOS
    const campos = [
      {
        nombre: 'Marcos totales',
        valor: marcos,
      },
      {
        nombre: 'Marcos con cría',
        valor: cria,
      },
      {
        nombre: 'Marcos con miel',
        valor: miel,
      },
    ];

    for (const campo of campos) {

      if (!/^\d+$/.test(campo.valor.trim())) {
        Alert.alert(
          'Dato inválido',
          `${campo.nombre} debe ser un número entero positivo o cero.`
        );
        return;
      }

      if (!Number.isSafeInteger(Number(campo.valor))) {
        Alert.alert(
          'Dato inválido',
          `${campo.nombre} contiene un número demasiado grande.`
        );
        return;
      }
    }

    const totalMarcos = Number(marcos);
    const marcosCria = Number(cria);
    const marcosMiel = Number(miel);

    // VALIDAR CANTIDADES
    if (
      marcosCria > totalMarcos ||
      marcosMiel > totalMarcos
    ) {
      Alert.alert(
        'Revisa los marcos',
        'Los marcos con cría o miel no pueden superar el total de marcos.'
      );
      return;
    }

    // BLOQUEAR BOTÓN
    bloqueoGuardado.current = true;
    setGuardando(true);

    try {

      // GUARDAR DATOS EN SQLITE
      const id = await guardarInspeccionLocal({
        codigoQR: codigoQR,
        marcosTotales: totalMarcos,
        marcosCria: marcosCria,
        marcosMiel: marcosMiel,
        reina: reina,
        observaciones: observaciones.trim(),
      });

      // CONFIRMAR AL USUARIO
      Alert.alert(
        'Inspección guardada',
        `La inspección N.º ${id} se guardó correctamente en el dispositivo.\n\nEstado: Pendiente de sincronización.\n\nLos datos se conservarán aunque no tengas internet.`,
        [
          {
            text: 'Volver a la colmena',
            onPress: onVolver,
          },
        ]
      );

    } catch (error) {

      console.error(
        'Error al guardar inspección local:',
        error
      );

      Alert.alert(
        'Error al guardar',
        'No se pudo guardar la inspección en el dispositivo. Intenta nuevamente.'
      );

    } finally {

      // LIBERAR BOTÓN
      bloqueoGuardado.current = false;
      setGuardando(false);
    }
  };

  // INTERFAZ DEL FORMULARIO
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      {/* ENCABEZADO */}
      <Text style={styles.icon}>
        🐝
      </Text>

      <Text style={styles.title}>
        Nueva inspección
      </Text>

      <Text style={styles.subtitle}>
        Sistema de Control de Colmenas
      </Text>

      {/* INFORMACIÓN DE LA COLMENA */}
      <View style={styles.card}>

        <Text style={styles.cardLabel}>
          Colmena identificada
        </Text>

        <Text style={styles.codigo}>
          {codigoQR}
        </Text>

        <Text style={styles.testLabel}>
          Registro de prueba
        </Text>

      </View>

      {/* REGISTRO DE MARCOS */}
      <Text style={styles.section}>
        Registro de marcos
      </Text>

      <Text style={styles.label}>
        Marcos totales *
      </Text>

      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={marcos}
        onChangeText={setMarcos}
        placeholder="Ejemplo: 10"
        placeholderTextColor="#A69B85"
      />

      <Text style={styles.label}>
        Marcos con cría *
      </Text>

      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={cria}
        onChangeText={setCria}
        placeholder="Ejemplo: 5"
        placeholderTextColor="#A69B85"
      />

      <Text style={styles.label}>
        Marcos con miel *
      </Text>

      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={miel}
        onChangeText={setMiel}
        placeholder="Ejemplo: 3"
        placeholderTextColor="#A69B85"
      />

      {/* ESTADO DE LA REINA */}
      <Text style={styles.section}>
        Estado de la reina
      </Text>

      {(
        [
          'Vista',
          'No vista',
          'Sin evaluar',
        ] as EstadoReina[]
      ).map((opcion) => (

        <Pressable
          key={opcion}
          style={[
            styles.option,
            reina === opcion && styles.selected,
          ]}
          onPress={() => setReina(opcion)}
        >
          <Text style={styles.optionText}>
            {reina === opcion ? '●' : '○'} {opcion}
          </Text>
        </Pressable>

      ))}

      {/* OBSERVACIONES */}
      <Text style={styles.section}>
        Observaciones
      </Text>

      <TextInput
        style={[
          styles.input,
          styles.textarea,
        ]}
        multiline
        value={observaciones}
        onChangeText={setObservaciones}
        placeholder="Escribe tus observaciones..."
        placeholderTextColor="#A69B85"
        textAlignVertical="top"
      />

      {/* AVISO DE GUARDADO LOCAL */}
      <View style={styles.infoCard}>

        <Text style={styles.infoTitle}>
          Guardado sin conexión
        </Text>

        <Text style={styles.infoText}>
          La inspección se guardará en este dispositivo.
          Quedará pendiente de sincronización con FastAPI
          hasta que implementemos la conexión automática.
        </Text>

      </View>

      {/* BOTÓN GUARDAR */}
      <Pressable
        style={[
          styles.button,
          guardando && styles.buttonDisabled,
        ]}
        onPress={guardarFormulario}
        disabled={guardando}
      >
        <Text style={styles.buttonText}>
          {guardando
            ? 'Guardando...'
            : 'Guardar inspección'}
        </Text>
      </Pressable>

      {/* BOTÓN VOLVER */}
      <Pressable
        style={styles.secondaryButton}
        onPress={onVolver}
        disabled={guardando}
      >
        <Text style={styles.secondaryText}>
          Volver a la colmena
        </Text>
      </Pressable>

      <Text style={styles.footer}>
        Colmenares Tres Pinos · Aplicación móvil
      </Text>

    </ScrollView>
  );
}

// ESTILOS
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#FFF9EC',
  },

  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 50,
  },

  icon: {
    fontSize: 55,
    textAlign: 'center',
    marginBottom: 12,
  },

  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#3D321B',
    textAlign: 'center',
  },

  subtitle: {
    fontSize: 15,
    color: '#766B52',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    alignItems: 'center',
  },

  cardLabel: {
    fontSize: 15,
    color: '#766B52',
  },

  codigo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3D321B',
    marginTop: 10,
    textAlign: 'center',
  },

  testLabel: {
    fontSize: 13,
    color: '#956513',
    marginTop: 10,
  },

  section: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#3D321B',
    marginTop: 20,
    marginBottom: 15,
  },

  label: {
    fontSize: 15,
    fontWeight: '500',
    color: '#594D36',
    marginBottom: 8,
  },

  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDCEAE',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: '#3D321B',
    marginBottom: 18,
  },

  textarea: {
    minHeight: 120,
  },

  option: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDCEAE',
  },

  selected: {
    borderColor: '#D99A24',
    backgroundColor: '#FFF0CC',
  },

  optionText: {
    fontSize: 16,
    color: '#3D321B',
  },

  infoCard: {
    backgroundColor: '#FFF0CC',
    padding: 18,
    borderRadius: 12,
    marginTop: 10,
  },

  infoTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#775315',
    marginBottom: 7,
  },

  infoText: {
    fontSize: 13,
    color: '#766B52',
    lineHeight: 20,
  },

  button: {
    backgroundColor: '#D99A24',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 25,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },

  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#D99A24',
  },

  secondaryText: {
    color: '#775315',
    fontSize: 16,
    fontWeight: '600',
  },

  footer: {
    textAlign: 'center',
    color: '#938972',
    fontSize: 12,
    marginTop: 28,
  },

});
