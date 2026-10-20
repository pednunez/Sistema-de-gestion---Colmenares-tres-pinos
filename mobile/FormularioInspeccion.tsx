
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';

type Props = {
  codigoQR: string;
  onVolver: () => void;
};

export default function FormularioInspeccion({
  codigoQR,
  onVolver,
}: Props) {
  const [marcos, setMarcos] = useState('');
  const [cria, setCria] = useState('');
  const [miel, setMiel] = useState('');
  const [reina, setReina] = useState('Sin evaluar');
  const [observaciones, setObservaciones] = useState('');

  const validarFormulario = () => {
    const campos = [
      { nombre: 'Marcos totales', valor: marcos },
      { nombre: 'Marcos con cría', valor: cria },
      { nombre: 'Marcos con miel', valor: miel },
    ];

    for (const campo of campos) {
      if (!/^\d+$/.test(campo.valor.trim())) {
        Alert.alert(
          'Dato inválido',
          `${campo.nombre} debe ser un número entero positivo o cero.`
        );
        return;
      }
    }

    if (Number(cria) > Number(marcos) ||
        Number(miel) > Number(marcos)) {
      Alert.alert(
        'Revisa los marcos',
        'Los marcos con cría o miel no pueden superar el total.'
      );
      return;
    }

    Alert.alert(
      'Formulario validado',
      'Los datos son válidos. Esta versión es de prueba y todavía no guarda inspecciones en FastAPI.'
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>🐝 Nueva inspección</Text>

      <Text style={styles.subtitle}>
        Sistema de Control de Colmenas
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Colmena identificada</Text>
        <Text style={styles.codigo}>{codigoQR}</Text>
      </View>

      <Text style={styles.section}>Registro de marcos</Text>

      <Text style={styles.label}>Marcos totales *</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={marcos}
        onChangeText={setMarcos}
        placeholder="Ejemplo: 10"
      />

      <Text style={styles.label}>Marcos con cría *</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={cria}
        onChangeText={setCria}
        placeholder="Ejemplo: 5"
      />

      <Text style={styles.label}>Marcos con miel *</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={miel}
        onChangeText={setMiel}
        placeholder="Ejemplo: 3"
      />

      <Text style={styles.section}>Estado de la reina</Text>

      {(['Vista', 'No vista', 'Sin evaluar'] as const).map(
        (opcion) => (
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
        )
      )}

      <Text style={styles.section}>Observaciones</Text>

      <TextInput
        style={[styles.input, styles.textarea]}
        multiline
        value={observaciones}
        onChangeText={setObservaciones}
        placeholder="Escribe tus observaciones..."
        textAlignVertical="top"
      />

      <Pressable
        style={styles.button}
        onPress={validarFormulario}
      >
        <Text style={styles.buttonText}>
          Validar inspección
        </Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={onVolver}
      >
        <Text style={styles.secondaryText}>
          Volver a la colmena
        </Text>
      </Pressable>

      <Text style={styles.note}>
        Prototipo local. Los datos aún no se guardan.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9EC',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 65,
    paddingBottom: 50,
  },
  title: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#3D321B',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#766B52',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    marginBottom: 24,
  },
  codigo: {
    fontWeight: 'bold',
    fontSize: 17,
    color: '#775315',
    marginTop: 8,
  },
  section: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#3D321B',
    marginTop: 18,
    marginBottom: 14,
  },
  label: {
    color: '#594D36',
    fontSize: 15,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDCEAE',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 15,
    color: '#3D321B',
  },
  textarea: {
    minHeight: 110,
  },
  option: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 8,
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
  button: {
    backgroundColor: '#D99A24',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 25,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryText: {
    color: '#775315',
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    textAlign: 'center',
    color: '#938972',
    fontSize: 12,
    marginTop: 20,
  },
});
