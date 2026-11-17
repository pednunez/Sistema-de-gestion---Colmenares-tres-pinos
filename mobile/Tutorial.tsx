
import React, {
  useEffect,
  useState,
} from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

// ==========================================
// TIPOS
// ==========================================

export type RolTutorial =
  | 'ADMIN'
  | 'APICULTOR';

type PasoTutorial = {
  icono: string;
  titulo: string;
  descripcion: string;
  consejo: string;
};

type Props = {
  visible: boolean;
  rol: RolTutorial;
  onDismiss: () => void;
};

// ==========================================
// TUTORIAL ADMINISTRADOR
// ==========================================

const PASOS_ADMIN: PasoTutorial[] = [

  {
    icono: '🐝',
    titulo: 'Bienvenido a Colmenares Tres Pinos',

    descripcion:
      'Esta guía te permitirá conocer las principales funcionalidades de la aplicación y aprender a utilizar sus herramientas.',

    consejo:
      'Puedes avanzar a tu ritmo, omitir la guía o volver a consultarla cuando quieras.',
  },

  {
    icono: '📊',
    titulo: 'Panel de control y navegación',

    descripcion:
      'El Dashboard presenta un resumen general de la operación. Desde el menú lateral puedes acceder a los diferentes módulos disponibles.',

    consejo:
      'En teléfonos, toca el botón ☰ para abrir el menú. En tablets permanece visible a la izquierda.',
  },

  {
    icono: '🌿',
    titulo: 'Apiarios, colmenas y stock',

    descripcion:
      'Desde Apiarios y Colmenas puedes consultar y administrar la información de los apiarios y sus colmenas. En Stock puedes revisar los recursos registrados.',

    consejo:
      'Mantén actualizado el catálogo para disponer de la información oficial en terreno.',
  },

  {
    icono: '📷',
    titulo: 'QR, inspecciones y tratamientos',

    descripcion:
      'Utiliza el lector QR para identificar una colmena. Desde su ficha puedes iniciar una inspección. También puedes acceder a los módulos de Tratamientos y Transferencias.',

    consejo:
      'La aplicación valida el código QR utilizando el catálogo oficial almacenado en el dispositivo.',
  },

  {
    icono: '🛡️',
    titulo: 'Usuarios y auditoría',

    descripcion:
      'El módulo Usuarios permite administrar las cuentas del sistema. Auditoría permite consultar la trazabilidad de las acciones registradas.',

    consejo:
      'Estas herramientas administrativas están reservadas al rol ADMIN.',
  },

  {
    icono: '📡',
    titulo: 'Trabajo sin conexión',

    descripcion:
      'Puedes continuar utilizando los datos disponibles localmente. Los registros se conservan en el dispositivo y, al recuperar conexión con el servidor, se pueden sincronizar con FastAPI.',

    consejo:
      'Utiliza el botón Actualizar de la cabecera para reintentar la conexión cuando sea necesario.',
  },

];

// ==========================================
// TUTORIAL APICULTOR
// ==========================================

const PASOS_APICULTOR: PasoTutorial[] = [

  {
    icono: '🐝',
    titulo: 'Bienvenido a Colmenares Tres Pinos',

    descripcion:
      'Esta aplicación está diseñada para facilitar el trabajo en terreno, permitiendo consultar colmenas, registrar inspecciones y revisar información desde tu dispositivo.',

    consejo:
      'La guía es opcional y puedes volver a consultarla desde el menú lateral.',
  },

  {
    icono: '📱',
    titulo: 'Conoce el menú de navegación',

    descripcion:
      'Desde el menú lateral puedes acceder a las colmenas, códigos QR, inspecciones, tratamientos y las demás opciones habilitadas para tu cuenta.',

    consejo:
      'Selecciona el módulo que necesitas. El menú se adapta al rol de tu usuario.',
  },

  {
    icono: '📷',
    titulo: 'Identifica una colmena mediante QR',

    descripcion:
      'Abre el escáner y apunta la cámara al código QR oficial de la colmena. La aplicación buscará su identificación en el catálogo disponible en el dispositivo.',

    consejo:
      'Debes utilizar los códigos QR oficiales registrados en el sistema.',
  },

  {
    icono: '📋',
    titulo: 'Registra una inspección',

    descripcion:
      'Una vez identificada la colmena, ingresa a su ficha y selecciona Iniciar inspección. Completa los datos solicitados, agrega observaciones y fotografías cuando corresponda.',

    consejo:
      'Los registros se guardan localmente en SQLite para conservar tu trabajo.',
  },

  {
    icono: '💊',
    titulo: 'Tratamientos e historial',

    descripcion:
      'Desde Tratamientos puedes consultar los registros disponibles. En Inspecciones puedes revisar las inspecciones almacenadas y su estado.',

    consejo:
      'Consulta el historial para mantener seguimiento del trabajo realizado.',
  },

  {
    icono: '📡',
    titulo: 'Trabaja sin conexión',

    descripcion:
      'Si pierdes conexión a internet, puedes continuar trabajando con la información disponible localmente. Tus registros permanecerán guardados en el dispositivo.',

    consejo:
      'Cuando recuperes conexión con FastAPI, la aplicación podrá sincronizar los registros pendientes.',
  },

];

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function Tutorial({
  visible,
  rol,
  onDismiss,
}: Props) {

  const [indice, setIndice] = useState(0);

  const {
    width,
    height,
  } = useWindowDimensions();

  const pasos =
    rol === 'ADMIN'
      ? PASOS_ADMIN
      : PASOS_APICULTOR;

  const pasoActual = pasos[indice];

  const ultimoPaso =
    indice === pasos.length - 1;

  // Reiniciar al abrir la guía.

  useEffect(() => {

    if (visible) {
      setIndice(0);
    }

  }, [visible, rol]);

  // ========================================
  // NAVEGACIÓN
  // ========================================

  const siguiente = () => {

    if (ultimoPaso) {
      onDismiss();
      return;
    }

    setIndice(actual =>
      Math.min(actual + 1, pasos.length - 1)
    );
  };

  const anterior = () => {

    setIndice(actual =>
      Math.max(actual - 1, 0)
    );

  };

  // ========================================
  // INTERFAZ
  // ========================================

  return (

    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >

      <View style={styles.contenedorModal}>

        {/* FONDO OSCURO */}

        <Pressable
          style={styles.fondoOscuro}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Cerrar tutorial"
        />

        {/* TARJETA PRINCIPAL */}

        <View
          style={[
            styles.tarjeta,
            {
              width: Math.min(width - 32, 560),
              maxHeight: height * 0.88,
            },
          ]}
        >

          {/* CABECERA */}

          <View style={styles.cabecera}>

            <View>

              <Text style={styles.etiqueta}>
                GUÍA DE USO
              </Text>

              <Text style={styles.subEtiqueta}>
                {rol === 'ADMIN'
                  ? 'Administrador'
                  : 'Apicultor'}
              </Text>

            </View>

            <Pressable
              style={styles.botonCerrar}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Salir del tutorial"
            >

              <Text style={styles.cerrarTexto}>
                ✕
              </Text>

            </Pressable>

          </View>

          {/* PROGRESO */}

          <View style={styles.progreso}>

            {pasos.map((_, posicion) => (

              <View
                key={posicion}
                style={[
                  styles.progresoParte,
                  posicion <= indice &&
                    styles.progresoParteActiva,
                ]}
              />

            ))}

          </View>

          {/* CONTENIDO */}

          <ScrollView
            style={styles.contenido}
            contentContainerStyle={
              styles.contenidoInterior
            }
            showsVerticalScrollIndicator={false}
          >

            <Text style={styles.numeroPaso}>
              PASO {indice + 1} DE {pasos.length}
            </Text>

            <Text style={styles.icono}>
              {pasoActual.icono}
            </Text>

            <Text style={styles.titulo}>
              {pasoActual.titulo}
            </Text>

            <Text style={styles.descripcion}>
              {pasoActual.descripcion}
            </Text>

            {/* CONSEJO */}

            <View style={styles.consejo}>

              <Text style={styles.consejoTitulo}>
                RECUERDA
              </Text>

              <Text style={styles.consejoTexto}>
                {pasoActual.consejo}
              </Text>

            </View>

          </ScrollView>

          {/* BOTONES */}

          <View style={styles.pie}>

            <Pressable
              style={styles.botonOmitir}
              onPress={onDismiss}
            >

              <Text style={styles.textoOmitir}>
                Omitir guía
              </Text>

            </Pressable>

            <View style={styles.controles}>

              {indice > 0 && (

                <Pressable
                  style={styles.botonAnterior}
                  onPress={anterior}
                >

                  <Text style={styles.textoAnterior}>
                    Anterior
                  </Text>

                </Pressable>

              )}

              <Pressable
                style={styles.botonSiguiente}
                onPress={siguiente}
              >

                <Text style={styles.textoSiguiente}>
                  {ultimoPaso
                    ? 'Finalizar'
                    : 'Siguiente'}
                </Text>

              </Pressable>

            </View>

          </View>

        </View>

      </View>

    </Modal>
  );
}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  contenedorModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },

  fondoOscuro: {
    position: 'absolute',
top: 0,
right: 0,
bottom: 0,
left: 0,
    backgroundColor: 'rgba(15,23,42,0.72)',
  },

  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 18,
  },

  // CABECERA

  cabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 15,
  },

  etiqueta: {
    color: '#A16207',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  subEtiqueta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },

  botonCerrar: {
    width: 35,
    height: 35,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cerrarTexto: {
    color: '#475569',
    fontSize: 16,
    fontWeight: '800',
  },

  // PROGRESO

  progreso: {
    flexDirection: 'row',
    paddingHorizontal: 22,
    gap: 6,
  },

  progresoParte: {
    flex: 1,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#E2E8F0',
  },

  progresoParteActiva: {
    backgroundColor: '#FBBF24',
  },

  // CONTENIDO

  contenido: {
    flexShrink: 1,
  },

  contenidoInterior: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
  },

  numeroPaso: {
    color: '#A16207',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 17,
  },

  icono: {
    fontSize: 43,
    marginBottom: 13,
  },

  titulo: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
  },

  descripcion: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 23,
    marginTop: 13,
  },

  // CONSEJO

  consejo: {
    marginTop: 22,
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },

  consejoTitulo: {
    color: '#92400E',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  consejoTexto: {
    color: '#78350F',
    fontSize: 13,
    lineHeight: 21,
    marginTop: 7,
  },

  // PIE

  pie: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  botonOmitir: {
    paddingVertical: 10,
    paddingHorizontal: 5,
  },

  textoOmitir: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },

  controles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  botonAnterior: {
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
  },

  textoAnterior: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },

  botonSiguiente: {
    minHeight: 42,
    paddingHorizontal: 19,
    borderRadius: 10,
    backgroundColor: '#FBBF24',
    justifyContent: 'center',
    alignItems: 'center',
  },

  textoSiguiente: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '900',
  },

});
