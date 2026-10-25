
import React, { useEffect, useState } from 'react';

import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  listarInspeccionesLocales,
} from './database/inspecciones';

type Props = {
  onEscanear: () => void;
  onInspecciones: () => void;
  onColmenas: () => void;
};

type Modulo = {
  nombre: string;
  detalle: string;
  icono: string;
  accion?: 'colmenas' | 'inspecciones' | 'qr';
};

// FUNCIONALIDADES OPERATIVAS DE LA WEB
const OPERACION: Modulo[] = [
  {
    nombre: 'Colmenas',
    detalle: 'Códigos con registros locales',
    icono: '🐝',
    accion: 'colmenas',
  },
  {
    nombre: 'Inspecciones',
    detalle: 'Historial guardado en el teléfono',
    icono: '📋',
    accion: 'inspecciones',
  },
  {
    nombre: 'Tratamientos',
    detalle: 'Por integrar con FastAPI',
    icono: '💊',
  },
  {
    nombre: 'Transferencias',
    detalle: 'Por integrar con FastAPI',
    icono: '🔄',
  },
  {
    nombre: 'Stock',
    detalle: 'Por integrar con FastAPI',
    icono: '📦',
  },
  {
    nombre: 'Códigos QR',
    detalle: 'Escaneo con código de prueba',
    icono: '▦',
    accion: 'qr',
  },
];

// FUNCIONALIDADES ADMINISTRATIVAS
const ADMINISTRACION: Modulo[] = [
  {
    nombre: 'Dashboard',
    detalle: 'Solo ADMIN. Datos del servidor pendientes',
    icono: '📊',
  },
  {
    nombre: 'Apiarios',
    detalle: 'Solo ADMIN. Datos del servidor pendientes',
    icono: '📍',
  },
  {
    nombre: 'Auditoría',
    detalle: 'Solo ADMIN. Requiere autenticación',
    icono: '🛡️',
  },
  {
    nombre: 'Usuarios',
    detalle: 'Solo ADMIN. Requiere autenticación',
    icono: '👥',
  },
];

export default function InicioModulos({
  onEscanear,
  onInspecciones,
  onColmenas,
}: Props) {
  const [total, setTotal] = useState<number | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [error, setError] = useState(false);

  // CONSULTAR ESTADÍSTICAS LOCALES
  useEffect(() => {
    let activo = true;

    listarInspeccionesLocales()
      .then((items) => {
        if (!activo) return;

        setTotal(items.length);

        setPendientes(
          items.filter(
            (item) => item.estado !== 'SINCRONIZADO'
          ).length
        );
      })
      .catch((e) => {
        console.error(
          'No se pudo leer el resumen local:',
          e
        );

        if (activo) {
          setError(true);
        }
      });

    return () => {
      activo = false;
    };
  }, []);

  // NAVEGAR A MÓDULOS DISPONIBLES
  const ejecutar = (accion?: Modulo['accion']) => {
    if (accion === 'colmenas') {
      onColmenas();
    }

    if (accion === 'inspecciones') {
      onInspecciones();
    }

    if (accion === 'qr') {
      onEscanear();
    }
  };

  // TARJETA DE CADA MÓDULO
  const renderModulo = (item: Modulo) => {
    const contenido = (
      <>
        <Text style={styles.moduloIcono}>
          {item.icono}
        </Text>

        <View style={styles.moduloContenido}>
          <Text style={styles.moduloNombre}>
            {item.nombre}
          </Text>

          <Text style={styles.moduloDetalle}>
            {item.detalle}
          </Text>
        </View>

        <Text
          style={[
            styles.estado,
            item.accion
              ? styles.estadoLocal
              : styles.estadoPendiente,
          ]}
        >
          {item.accion ? 'LOCAL' : 'PENDIENTE'}
        </Text>
      </>
    );

    if (item.accion) {
      return (
        <Pressable
          key={item.nombre}
          accessibilityRole="button"
          accessibilityLabel={`Abrir ${item.nombre}`}
          onPress={() => ejecutar(item.accion)}
          style={styles.modulo}
        >
          {contenido}
        </Pressable>
      );
    }

    return (
      <View
        key={item.nombre}
        style={[
          styles.modulo,
          styles.moduloInactivo,
        ]}
      >
        {contenido}
      </View>
    );
  };

  // PANTALLA PRINCIPAL
  return (
    <ScrollView
      style={styles.pantalla}
      contentContainerStyle={styles.contenido}
    >
 <StatusBar barStyle="light-content" />

      {/* CABECERA */}
      <View style={styles.cabecera}>
        <View style={styles.marca}>
          <Text style={styles.marcaTexto}>
            CP
          </Text>
        </View>

        <View style={styles.cabeceraTextos}>
          <Text style={styles.cabeceraTitulo}>
            Colmenares Tres Pinos
          </Text>

          <Text style={styles.cabeceraSubtitulo}>
            Sistema de Control de Colmenas
          </Text>
        </View>
      </View>

      {/* INFORMACIÓN PRINCIPAL */}
      <Text style={styles.titulo}>
        Módulo móvil
      </Text>

      <Text style={styles.introduccion}>
        Registro de terreno. Los datos locales se guardan
        en este dispositivo; la sincronización con FastAPI
        todavía no está implementada.
      </Text>

      {/* ESTADÍSTICAS */}
      <View style={styles.estadisticas}>
        <View style={styles.estadistica}>
          <Text style={styles.cifra}>
            {error ? '!' : total ?? '…'}
          </Text>

          <Text style={styles.etiqueta}>
            Inspecciones locales
          </Text>
        </View>

        <View style={styles.linea} />

        <View style={styles.estadistica}>
          <Text style={styles.cifra}>
            {error ? '!' : pendientes ?? '…'}
          </Text>

          <Text style={styles.etiqueta}>
            Pendientes de envío
          </Text>
        </View>
      </View>

      {error && (
        <Text style={styles.avisoError}>
          No fue posible leer el resumen local.
          Puedes abrir el historial para reintentar.
        </Text>
      )}

      {/* ACCIONES DE TERRENO */}
      <Text style={styles.seccion}>
        Acciones de terreno
      </Text>

      <Pressable
        style={styles.botonPrincipal}
        onPress={onEscanear}
      >
        <Text style={styles.botonPrincipalTexto}>
          ▦ Escanear código QR
        </Text>
      </Pressable>

      <Pressable
        style={styles.botonSecundario}
        onPress={onInspecciones}
      >
        <Text style={styles.botonSecundarioTexto}>
          Ver mis inspecciones
        </Text>
      </Pressable>

      {/* MÓDULOS OPERATIVOS */}
      <Text style={styles.seccion}>
        Operación
      </Text>

      {OPERACION.map(renderModulo)}

      {/* MÓDULOS ADMINISTRATIVOS */}
      <Text style={styles.seccion}>
        Administración
      </Text>

      <Text style={styles.nota}>
        En la web, estos módulos requieren el rol ADMIN.
        Se habilitarán cuando tengamos autenticación
        móvil y acceso a la API.
      </Text>

      {ADMINISTRACION.map(renderModulo)}

      <Text style={styles.pie}>
        Prototipo móvil · Expo + SQLite
      </Text>
    </ScrollView>
  );
}

// =====================================
// ESTILOS
// =====================================
const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  contenido: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },

  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -18,
    paddingHorizontal: 20,
    paddingTop: 68,
    paddingBottom: 22,
    backgroundColor: '#0F172A',
  },

  marca: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
  },

  marcaTexto: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
  },

  cabeceraTextos: {
    flex: 1,
    marginLeft: 12,
  },

  cabeceraTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  cabeceraSubtitulo: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 3,
  },

  titulo: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 26,
    marginTop: 25,
  },

  introduccion: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },

  estadisticas: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    flexDirection: 'row',
    paddingVertical: 18,
    marginTop: 20,
  },

  estadistica: {
    flex: 1,
    alignItems: 'center',
  },

  cifra: {
    color: '#92400E',
    fontSize: 30,
    fontWeight: '800',
  },

  etiqueta: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3,
  },

  linea: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },

  avisoError: {
    color: '#B91C1C',
    fontSize: 12,
    marginTop: 8,
  },

  seccion: {
    marginTop: 28,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },

  botonPrincipal: {
    backgroundColor: '#D99A24',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 10,
  },

  botonPrincipalTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
  },

  botonSecundario: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D99A24',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },

  botonSecundarioTexto: {
    color: '#775315',
    fontWeight: '700',
    fontSize: 16,
  },

  modulo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 15,
    marginBottom: 9,
  },

  moduloInactivo: {
    opacity: 0.68,
  },

  moduloIcono: {
    fontSize: 24,
    marginRight: 12,
  },

  moduloContenido: {
    flex: 1,
  },

  moduloNombre: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },

  moduloDetalle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },

  estado: {
    fontSize: 10,
    fontWeight: '800',
    overflow: 'hidden',
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRadius: 6,
  },

  estadoLocal: {
    color: '#92400E',
    backgroundColor: '#FEF3C7',
  },

  estadoPendiente: {
    color: '#475569',
    backgroundColor: '#F1F5F9',
  },

  nota: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },

  pie: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 22,
  },
});
