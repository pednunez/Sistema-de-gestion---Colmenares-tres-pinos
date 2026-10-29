
import React, { useState } from 'react';

import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ==========================================
// COLMENARES TRES PINOS
// PANTALLA DE INICIO DE SESION MOVIL
// ==========================================

type Props = {
  onIngresar: (
    email: string,
    password: string
  ) => Promise<void>;

  mensaje?: string;
};

export default function Login({
  onIngresar,
  mensaje,
}: Props) {

  // ========================================
  // ESTADOS DEL FORMULARIO
  // ========================================

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [mostrarPassword, setMostrarPassword] =
    useState(false);

  const [cargando, setCargando] =
    useState(false);

  const [error, setError] = useState('');

  // ========================================
  // VALIDAR E INICIAR SESION
  // ========================================

  const ingresar = async () => {

    // Evitar solicitudes duplicadas.
    if (cargando) {
      return;
    }

    setError('');

    const correoLimpio = email
      .trim()
      .toLowerCase();

    // Validar campos obligatorios.
    if (!correoLimpio) {
      setError(
        'Debes ingresar tu correo electrónico.'
      );
      return;
    }

    if (!password) {
      setError(
        'Debes ingresar tu contraseña.'
      );
      return;
    }

    setCargando(true);

    try {

      // La autenticacion real se ejecuta
      // mediante el modulo api/auth.ts.
      await onIngresar(
        correoLimpio,
        password
      );

      // No mantener la contraseña escrita
      // después de un ingreso exitoso.
      setPassword('');

    } catch (err) {

      const mensajeError =
        err instanceof Error
          ? err.message
          : 'No fue posible iniciar sesión.';

      setError(mensajeError);

    } finally {
      setCargando(false);
    }
  };

  // ========================================
  // INTERFAZ
  // ========================================

  return (
    <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >

        {/* CABECERA */}

        <View style={styles.cabecera}>

          <View style={styles.logo}>
            <Text style={styles.logoTexto}>
              CP
            </Text>
          </View>

          <Text style={styles.nombreSistema}>
            Colmenares Tres Pinos
          </Text>

          <Text style={styles.subtitulo}>
            Sistema de Gestión de Colmenas
          </Text>

          <Text style={styles.modulo}>
            Módulo móvil
          </Text>

        </View>

        {/* FORMULARIO */}

        <View style={styles.tarjeta}>

          <Text style={styles.titulo}>
            Iniciar sesión
          </Text>

          <Text style={styles.descripcion}>
            Ingresa con tu cuenta autorizada
            para acceder a las funciones
            de terreno.
          </Text>

          {/* CORREO */}

          <Text style={styles.etiqueta}>
            Correo electrónico
          </Text>

          <TextInput
            style={styles.entrada}
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.cl"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            maxLength={150}
            editable={!cargando}
            returnKeyType="next"
            accessibilityLabel="Correo electrónico"
          />

          {/* CONTRASEÑA */}

          <Text style={styles.etiqueta}>
            Contraseña
          </Text>

          <View style={styles.contenedorPassword}>

            <TextInput
              style={styles.entradaPassword}
              value={password}
              onChangeText={setPassword}
              placeholder="Ingresa tu contraseña"
              placeholderTextColor="#94A3B8"
              secureTextEntry={!mostrarPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              maxLength={128}
              editable={!cargando}
              returnKeyType="done"
              onSubmitEditing={() => {
                void ingresar();
              }}
              accessibilityLabel="Contraseña"
            />

            <Pressable
              style={styles.botonMostrar}
              disabled={cargando}
              onPress={() => {
                setMostrarPassword(
                  valorAnterior => !valorAnterior
                );
              }}
              accessibilityRole="button"
              accessibilityLabel={
                mostrarPassword
                  ? 'Ocultar contraseña'
                  : 'Mostrar contraseña'
              }
            >

              <Text style={styles.textoMostrar}>
                {mostrarPassword
                  ? 'Ocultar'
                  : 'Mostrar'}
              </Text>

            </Pressable>

          </View>

          {/* ERRORES */}

          {(error || mensaje) ? (
            <View style={styles.contenedorError}>

              <Text style={styles.textoError}>
                {error || mensaje}
              </Text>

            </View>
          ) : null}

          {/* INGRESAR */}

          <Pressable
            style={[
              styles.botonIngresar,
              cargando &&
                styles.botonDeshabilitado,
            ]}
            disabled={cargando}
            onPress={() => {
              void ingresar();
            }}
            accessibilityRole="button"
            accessibilityLabel="Iniciar sesión"
          >

            {cargando ? (

              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />

            ) : (

              <Text style={styles.textoIngresar}>
                Ingresar
              </Text>

            )}

          </Pressable>

        </View>

        {/* INFORMACION */}

        <View style={styles.informacion}>

          <Text style={styles.textoInformacion}>
            Acceso exclusivo para usuarios
            autorizados del sistema.
          </Text>

          <Text style={styles.textoSecundario}>
            Los registros locales se conservan
            en este dispositivo cuando no hay
            conexión con el servidor.
          </Text>

        </View>

      </ScrollView>

    </KeyboardAvoidingView>
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingTop: 55,
    paddingBottom: 40,
  },

  cabecera: {
    alignItems: 'center',
    marginBottom: 30,
  },

  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#FBBF24',
    justifyContent: 'center',
    alignItems: 'center',
  },

  logoTexto: {
    fontSize: 27,
    fontWeight: '900',
    color: '#0F172A',
  },

  nombreSistema: {
    fontSize: 25,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 17,
  },

  subtitulo: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 5,
  },

  modulo: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '700',
    marginTop: 10,
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 23,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  titulo: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },

  descripcion: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 21,
    marginTop: 9,
    marginBottom: 20,
  },

  etiqueta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 13,
    marginBottom: 9,
  },

  entrada: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F172A',
  },

  contenedorPassword: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },

  entradaPassword: {
    flex: 1,
    fontSize: 16,
    color: '#0F172A',
    paddingHorizontal: 15,
    paddingVertical: 14,
  },

  botonMostrar: {
    paddingHorizontal: 13,
    paddingVertical: 15,
  },

  textoMostrar: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
  },

  contenedorError: {
    marginTop: 17,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    padding: 12,
  },

  textoError: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 20,
  },

  botonIngresar: {
    backgroundColor: '#D99A24',
    borderRadius: 12,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
  },

  botonDeshabilitado: {
    opacity: 0.6,
  },

  textoIngresar: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  informacion: {
    marginTop: 25,
    alignItems: 'center',
  },

  textoInformacion: {
    color: '#475569',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
  },

  textoSecundario: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
  },

});
