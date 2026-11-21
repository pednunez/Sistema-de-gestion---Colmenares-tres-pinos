
import React, { useState } from 'react';

import { COLORS } from './theme';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActivityIndicator,
  Image,
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
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.pantalla}>
      <KeyboardAvoidingView
      style={styles.pantalla}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
      >

        {/* CABECERA */}

        <View style={styles.cabecera}>

          <Image
            source={require('./assets/colmenares-logo-horizontal.png')}
            style={styles.logoHorizontal}
            resizeMode="contain"
            accessibilityLabel="Colmenares Tres Pinos"
          />

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
            placeholderTextColor={COLORS.textMuted}
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
              placeholderTextColor={COLORS.textMuted}
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
                color={COLORS.surface}
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
    </SafeAreaView>
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

  logoHorizontal: {
    width: '100%',
    maxWidth: 310,
    height: 104,
  },

  subtitulo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 5,
  },

  modulo: {
    fontSize: 13,
    color: COLORS.goldText,
    fontWeight: '700',
    marginTop: 10,
  },

  tarjeta: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 23,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  titulo: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.forest,
  },

  descripcion: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginTop: 9,
    marginBottom: 20,
  },

  etiqueta: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 13,
    marginBottom: 9,
  },

  entrada: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 11,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.forest,
  },

  contenedorPassword: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 11,
    backgroundColor: COLORS.surface,
  },

  entradaPassword: {
    flex: 1,
    fontSize: 16,
    color: COLORS.forest,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },

  botonMostrar: {
    paddingHorizontal: 13,
    paddingVertical: 15,
  },

  textoMostrar: {
    color: COLORS.goldText,
    fontSize: 13,
    fontWeight: '700',
  },

  contenedorError: {
    marginTop: 17,
    borderRadius: 10,
    backgroundColor: COLORS.dangerBg,
    padding: 12,
  },

  textoError: {
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 20,
  },

  botonIngresar: {
    backgroundColor: COLORS.gold,
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
    color: COLORS.forest,
    fontSize: 17,
    fontWeight: '800',
  },

  informacion: {
    marginTop: 25,
    alignItems: 'center',
  },

  textoInformacion: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
  },

  textoSecundario: {
    color: COLORS.textMuted,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
  },

});
