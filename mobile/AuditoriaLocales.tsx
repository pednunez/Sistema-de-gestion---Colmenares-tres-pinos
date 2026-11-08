
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  leerSesionGuardada,
} from './api/auth';

import type {
  SesionMovil,
} from './api/auth';

import {
  solicitarAPI,
} from './api/cliente';

// ==========================================
// TIPOS
// ==========================================

type AccionAuditoria =
  | 'CREAR'
  | 'MODIFICAR'
  | 'ELIMINAR'
  | 'RESTAURAR';

type FiltroAccion =
  | 'TODAS'
  | AccionAuditoria;

type AuditoriaRegistro = {
  id: number;
  fecha: string;
  usuario_id: number | null;
  entidad: string;
  entidad_id: number | null;
  accion: AccionAuditoria;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
};

type Props = {
  onVolver: () => void;
};

// ==========================================
// CONSTANTES
// ==========================================

const FILTROS: FiltroAccion[] = [
  'TODAS',
  'CREAR',
  'MODIFICAR',
  'ELIMINAR',
  'RESTAURAR',
];

const COLORES: Record<
  AccionAuditoria,
  { fondo: string; texto: string }
> = {
  CREAR: {
    fondo: '#DCFCE7',
    texto: '#15803D',
  },
  MODIFICAR: {
    fondo: '#DBEAFE',
    texto: '#1D4ED8',
  },
  ELIMINAR: {
    fondo: '#FEE2E2',
    texto: '#B91C1C',
  },
  RESTAURAR: {
    fondo: '#FEF3C7',
    texto: '#B45309',
  },
};

// ==========================================
// UTILIDADES
// ==========================================

function formatearFecha(fecha: string): string {
  const valor = new Date(fecha);

  if (Number.isNaN(valor.getTime())) {
    return fecha;
  }

  return valor.toLocaleString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined) {
    return 'Sin información';
  }

  if (typeof valor === 'object') {
    return JSON.stringify(valor, null, 2) ?? '';
  }

  if (typeof valor === 'boolean') {
    return valor ? 'Sí' : 'No';
  }

  return String(valor);
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function AuditoriaLocales({
  onVolver,
}: Props) {

  const [sesion, setSesion] =
    useState<SesionMovil | null>(null);

  const [registros, setRegistros] =
    useState<AuditoriaRegistro[]>([]);

  const [cargando, setCargando] =
    useState(true);

  const [actualizando, setActualizando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [busqueda, setBusqueda] =
    useState('');

  const [filtroAccion, setFiltroAccion] =
    useState<FiltroAccion>('TODAS');

  const [seleccionado, setSeleccionado] =
    useState<AuditoriaRegistro | null>(null);

  const [detalleCargando, setDetalleCargando] =
    useState(false);

  const [detalleError, setDetalleError] =
    useState<string | null>(null);

  // ========================================
  // CARGAR REGISTROS DESDE FASTAPI
  // GET /auditoria/
  // ========================================

  const cargarRegistros = useCallback(
    async (
      token: string,
      refrescar = false,
    ) => {

      if (refrescar) {
        setActualizando(true);
      } else {
        setCargando(true);
      }

      setError(null);

      try {

        const respuesta =
          await solicitarAPI<AuditoriaRegistro[]>(
            '/auditoria/',
            {
              token,
            }
          );

        if (!Array.isArray(respuesta)) {
          throw new Error(
            'El servidor devolvió un listado inválido.'
          );
        }

        setRegistros(respuesta);

      } catch (e) {

        setError(
          e instanceof Error
            ? e.message
            : 'No fue posible cargar la auditoría.'
        );

      } finally {

        setCargando(false);
        setActualizando(false);

      }

    },
    []
  );

  // ========================================
  // RECUPERAR SESIÓN Y VALIDAR ADMIN
  // ========================================

  const inicializar = useCallback(
    async () => {

      setCargando(true);
      setError(null);

      try {

        const guardada =
          await leerSesionGuardada();

        if (!guardada) {
          setError(
            'No existe una sesión activa. Inicia sesión nuevamente.'
          );

          return;
        }

        setSesion(guardada);

        if (guardada.usuario.rol !== 'ADMIN') {
          setError(
            'No tienes permisos para consultar Auditoría.'
          );

          return;
        }

        await cargarRegistros(
          guardada.accessToken
        );

      } catch (e) {

        setError(
          e instanceof Error
            ? e.message
            : 'No fue posible iniciar Auditoría.'
        );

      } finally {

        setCargando(false);

      }

    },
    [cargarRegistros]
  );

  useEffect(() => {
    void inicializar();
  }, [inicializar]);

  // ========================================
  // ACTUALIZAR
  // ========================================

  const actualizar = async () => {

    if (!sesion) {
      await inicializar();
      return;
    }

    if (sesion.usuario.rol !== 'ADMIN') {
      return;
    }

    await cargarRegistros(
      sesion.accessToken,
      true
    );

  };

  // ========================================
  // CONSULTAR DETALLE
  // GET /auditoria/{id}
  // ========================================

  const abrirDetalle = async (
    registro: AuditoriaRegistro
  ) => {

    if (!sesion) {
      return;
    }

    setSeleccionado(registro);
    setDetalleError(null);
    setDetalleCargando(true);

    try {

      const detalle =
        await solicitarAPI<AuditoriaRegistro>(
          `/auditoria/${registro.id}`,
          {
            token: sesion.accessToken,
          }
        );

      setSeleccionado(detalle);

    } catch (e) {

      setDetalleError(
        e instanceof Error
          ? e.message
          : 'No fue posible consultar el detalle.'
      );

    } finally {

      setDetalleCargando(false);

    }

  };

  // ========================================
  // FILTRAR REGISTROS
  // ========================================

  const registrosFiltrados = useMemo(() => {

    const texto = busqueda
      .trim()
      .toLowerCase();

    return registros.filter((registro) => {

      const coincideAccion =
        filtroAccion === 'TODAS' ||
        registro.accion === filtroAccion;

      const contenido = [
        registro.id,
        registro.entidad,
        registro.entidad_id,
        registro.usuario_id,
      ]
        .join(' ')
        .toLowerCase();

      const coincideBusqueda =
        !texto || contenido.includes(texto);

      return coincideAccion && coincideBusqueda;

    });

  }, [registros, filtroAccion, busqueda]);

  // ========================================
  // ESTADÍSTICAS
  // ========================================

  const total = registros.length;

  const creados = registros.filter(
    (r) => r.accion === 'CREAR'
  ).length;

  const modificados = registros.filter(
    (r) => r.accion === 'MODIFICAR'
  ).length;

  const eliminados = registros.filter(
    (r) => r.accion === 'ELIMINAR'
  ).length;

  const restaurados = registros.filter(
    (r) => r.accion === 'RESTAURAR'
  ).length;

  // ========================================
  // RENDERIZAR COMPARACIÓN DE DATOS
  // ========================================

  const renderDatos = (
    titulo: string,
    datos: Record<string, unknown> | null,
    color: string,
  ) => {

    const entradas = datos
      ? Object.entries(datos)
      : [];

    return (
      <View style={styles.datosSeccion}>

        <Text
          style={[
            styles.datosTitulo,
            { color },
          ]}
        >
          {titulo}
        </Text>

        {entradas.length === 0 ? (

          <Text style={styles.sinDatos}>
            No hay información registrada.
          </Text>

        ) : (

          entradas.map(([clave, valor]) => (

            <View
              key={clave}
              style={styles.datoFila}
            >

              <Text style={styles.datoClave}>
                {clave.replace(/_/g, ' ')}
              </Text>

              <Text style={styles.datoValor}>
                {formatearValor(valor)}
              </Text>

            </View>

          ))

        )}

      </View>
    );

  };

  // ========================================
  // PANTALLA
  // ========================================

  return (

    <View style={styles.container}>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl
            refreshing={actualizando}
            onRefresh={() => {
              void actualizar();
            }}
            colors={['#D99A16']}
            tintColor="#D99A16"
          />
        }
      >

        {/* CABECERA */}

        <View style={styles.cabecera}>

          <View style={styles.cabeceraSuperior}>

            <Pressable
              style={styles.botonVolver}
              onPress={onVolver}
            >
              <Text style={styles.botonVolverTexto}>
                ‹ Volver
              </Text>
            </Pressable>

            <View style={styles.adminChip}>
              <Text style={styles.adminChipTexto}>
                ADMIN
              </Text>
            </View>

          </View>

          <Text style={styles.titulo}>
            Auditoría
          </Text>

          <Text style={styles.subtitulo}>
            Historial y trazabilidad de las operaciones del sistema.
          </Text>

        </View>

        {/* CARGANDO */}

        {cargando ? (

          <View style={styles.estado}>
            <ActivityIndicator
              size="large"
              color="#D99A16"
            />

            <Text style={styles.estadoTexto}>
              Cargando registros de auditoría...
            </Text>
          </View>

        ) : error ? (

          /* ERROR */

          <View style={styles.errorCard}>

            <Text style={styles.errorTitulo}>
              No fue posible cargar Auditoría
            </Text>

            <Text style={styles.errorTexto}>
              {error}
            </Text>

            <Pressable
              style={styles.botonReintentar}
              onPress={() => {
                void inicializar();
              }}
            >
              <Text style={styles.botonReintentarTexto}>
                Reintentar
              </Text>
            </Pressable>

          </View>

        ) : (

          <>

            {/* RESUMEN */}

            <Text style={styles.seccionTitulo}>
              Resumen de actividad
            </Text>

            <View style={styles.resumenGrid}>

              <View style={styles.resumenCard}>
                <Text style={styles.resumenNumero}>
                  {total}
                </Text>
                <Text style={styles.resumenEtiqueta}>
                  Total registros
                </Text>
              </View>

              <View style={styles.resumenCard}>
                <Text style={[
                  styles.resumenNumero,
                  { color: '#15803D' }
                ]}>
                  {creados}
                </Text>
                <Text style={styles.resumenEtiqueta}>
                  Creaciones
                </Text>
              </View>

              <View style={styles.resumenCard}>
                <Text style={[
                  styles.resumenNumero,
                  { color: '#1D4ED8' }
                ]}>
                  {modificados}
                </Text>
                <Text style={styles.resumenEtiqueta}>
                  Modificaciones
                </Text>
              </View>

              <View style={styles.resumenCard}>
                <Text style={[
                  styles.resumenNumero,
                  { color: '#B91C1C' }
                ]}>
                  {eliminados}
                </Text>
                <Text style={styles.resumenEtiqueta}>
                  Eliminaciones
                </Text>
              </View>

              <View style={styles.resumenCard}>
                <Text style={[
                  styles.resumenNumero,
                  { color: '#B45309' }
                ]}>
                  {restaurados}
                </Text>
                <Text style={styles.resumenEtiqueta}>
                  Restauraciones
                </Text>
              </View>

            </View>

            {/* HISTORIAL */}

            <View style={styles.historialCabecera}>

              <Text style={styles.seccionTitulo}>
                Historial de actividad
              </Text>

              <Text style={styles.totalFiltrado}>
                {registrosFiltrados.length} registros
              </Text>

            </View>

            {/* BUSCADOR */}

            <TextInput
              style={styles.busqueda}
              placeholder="Buscar por entidad, usuario o ID..."
              placeholderTextColor="#94A3B8"
              value={busqueda}
              onChangeText={setBusqueda}
              autoCapitalize="none"
            />

            {/* FILTROS */}

            <Text style={styles.filtroTitulo}>
              Filtrar por acción
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtros}
            >

              {FILTROS.map((filtro) => (

                <Pressable
                  key={filtro}
                  onPress={() => {
                    setFiltroAccion(filtro);
                  }}
                  style={[
                    styles.filtroBoton,
                    filtroAccion === filtro &&
                      styles.filtroBotonActivo,
                  ]}
                >

                  <Text
                    style={[
                      styles.filtroTexto,
                      filtroAccion === filtro &&
                        styles.filtroTextoActivo,
                    ]}
                  >
                    {filtro === 'TODAS'
                      ? 'Todas'
                      : filtro}
                  </Text>

                </Pressable>

              ))}

            </ScrollView>

            {/* DETALLE SELECCIONADO */}

            {seleccionado && (

              <View style={styles.detalleCard}>

                <View style={styles.detalleCabecera}>

                  <View style={{ flex: 1 }}>

                    <Text style={styles.detalleTitulo}>
                      Detalle del registro #{seleccionado.id}
                    </Text>

                    <Text style={styles.detalleFecha}>
                      {formatearFecha(seleccionado.fecha)}
                    </Text>

                  </View>

                  <Pressable
                    onPress={() => {
                      setSeleccionado(null);
                      setDetalleError(null);
                    }}
                    style={styles.cerrarDetalle}
                  >
                    <Text style={styles.cerrarDetalleTexto}>
                      ✕
                    </Text>
                  </Pressable>

                </View>

                <View style={styles.detalleInfo}>

                  <Text style={styles.detalleInfoTexto}>
                    Entidad: {seleccionado.entidad}
                  </Text>

                  <Text style={styles.detalleInfoTexto}>
                    ID entidad: {seleccionado.entidad_id ?? 'N/A'}
                  </Text>

                  <Text style={styles.detalleInfoTexto}>
                    Usuario: {seleccionado.usuario_id ?? 'N/A'}
                  </Text>

                  <Text style={styles.detalleInfoTexto}>
                    Acción: {seleccionado.accion}
                  </Text>

                </View>

                {detalleCargando ? (

                  <ActivityIndicator
                    color="#D99A16"
                    style={{ marginVertical: 20 }}
                  />

                ) : detalleError ? (

                  <Text style={styles.errorTexto}>
                    {detalleError}
                  </Text>

                ) : (

                  <>

                    {renderDatos(
                      'DATOS ANTERIORES',
                      seleccionado.datos_anteriores,
                      '#B45309',
                    )}

                    {renderDatos(
                      'DATOS NUEVOS',
                      seleccionado.datos_nuevos,
                      '#15803D',
                    )}

                  </>

                )}

              </View>

            )}

            {/* LISTADO */}

            {registrosFiltrados.length === 0 ? (

              <View style={styles.vacioCard}>

                <Text style={styles.vacioIcono}>
                  🛡️
                </Text>

                <Text style={styles.vacioTitulo}>
                  No hay registros
                </Text>

                <Text style={styles.vacioTexto}>
                  No se encontraron operaciones con los filtros seleccionados.
                </Text>

              </View>

            ) : (

              registrosFiltrados.map((registro) => {

                const color =
                  COLORES[registro.accion];

                return (

                  <Pressable
                    key={registro.id}
                    style={styles.registroCard}
                    onPress={() => {
                      void abrirDetalle(registro);
                    }}
                  >

                    <View style={styles.registroSuperior}>

                      <Text style={styles.registroEntidad}>
                        {registro.entidad}
                      </Text>

                      <View
                        style={[
                          styles.accionBadge,
                          { backgroundColor: color.fondo },
                        ]}
                      >

                        <Text
                          style={[
                            styles.accionTexto,
                            { color: color.texto },
                          ]}
                        >
                          {registro.accion}
                        </Text>

                      </View>

                    </View>

                    <Text style={styles.registroId}>
                      Registro #{registro.id}
                      {'  '}•{'  '}
                      Entidad #{registro.entidad_id ?? 'N/A'}
                    </Text>

                    <View style={styles.registroInferior}>

                      <Text style={styles.registroFecha}>
                        {formatearFecha(registro.fecha)}
                      </Text>

                      <Text style={styles.registroUsuario}>
                        Usuario #{registro.usuario_id ?? 'N/A'}
                      </Text>

                    </View>

                    <Text style={styles.verDetalle}>
                      Ver detalle →
                    </Text>

                  </Pressable>

                );

              })

            )}

            {/* PIE */}

            <View style={styles.pie}>
              <Text style={styles.pieTexto}>
                Auditoría de Colmenares Tres Pinos
              </Text>
            </View>

          </>

        )}

      </ScrollView>

    </View>

  );

}

// ==========================================
// ESTILOS
// ==========================================

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  contenido: {
    padding: 18,
    paddingBottom: 35,
  },

  cabecera: {
    marginBottom: 24,
  },

  cabeceraSuperior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  botonVolver: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  botonVolverTexto: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },

  adminChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },

  adminChipTexto: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '800',
  },

  titulo: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
  },

  subtitulo: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 7,
    lineHeight: 21,
  },

  seccionTitulo: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },

  resumenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 27,
  },

  resumenCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 91,
    justifyContent: 'center',
  },

  resumenNumero: {
    fontSize: 27,
    fontWeight: '900',
    color: '#0F172A',
  },

  resumenEtiqueta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },

  historialCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  totalFiltrado: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },

  busqueda: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 17,
  },

  filtroTitulo: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
  },

  filtros: {
    gap: 8,
    paddingBottom: 18,
  },

  filtroBoton: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },

  filtroBotonActivo: {
    backgroundColor: '#172554',
    borderColor: '#172554',
  },

  filtroTexto: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },

  filtroTextoActivo: {
    color: '#FFFFFF',
  },

  registroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 15,
    marginBottom: 11,
  },

  registroSuperior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },

  registroEntidad: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
  },

  accionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
  },

  accionTexto: {
    fontSize: 10,
    fontWeight: '900',
  },

  registroId: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 10,
  },

  registroInferior: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 13,
  },

  registroFecha: {
    fontSize: 11,
    color: '#64748B',
  },

  registroUsuario: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },

  verDetalle: {
    fontSize: 12,
    color: '#B7791F',
    fontWeight: '800',
    marginTop: 13,
  },

  detalleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 16,
    marginBottom: 20,
  },

  detalleCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  detalleTitulo: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },

  detalleFecha: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
  },

  cerrarDetalle: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cerrarDetalleTexto: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '800',
  },

  detalleInfo: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginTop: 15,
    gap: 7,
  },

  detalleInfoTexto: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },

  datosSeccion: {
    marginTop: 19,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  datosTitulo: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 12,
  },

  datoFila: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 5,
  },

  datoClave: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '800',
    textTransform: 'capitalize',
  },

  datoValor: {
    fontSize: 12,
    color: '#0F172A',
    lineHeight: 19,
  },

  sinDatos: {
    color: '#94A3B8',
    fontSize: 12,
    paddingVertical: 10,
  },

  vacioCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  vacioIcono: {
    fontSize: 34,
    marginBottom: 12,
  },

  vacioTitulo: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },

  vacioTexto: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },

  estado: {
    paddingVertical: 55,
    alignItems: 'center',
    gap: 15,
  },

  estadoTexto: {
    color: '#64748B',
    fontSize: 13,
  },

  errorCard: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  errorTitulo: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '900',
  },

  errorTexto: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 9,
    lineHeight: 19,
  },

  botonReintentar: {
    backgroundColor: '#172554',
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 17,
  },

  botonReintentarTexto: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },

  pie: {
    alignItems: 'center',
    paddingVertical: 25,
  },

  pieTexto: {
    color: '#94A3B8',
    fontSize: 10,
  },

});
