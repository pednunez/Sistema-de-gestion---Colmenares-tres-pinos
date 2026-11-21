import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { leerSesionGuardada, tokenVigente } from './api/auth';
import {
  armarVistaReporte,
  cargarDatosReportes,
  compartirReporte,
  CONFIGURACION_REPORTE,
  ESTADOS_POR_REPORTE,
  FILTROS_INICIALES,
  NOMBRES_ESTADO,
  resumenFiltros,
  mostrarFecha,
} from './api/reportes';
import type {
  DatosReportes,
  FiltrosReporte,
  FormatoReporte,
  TipoReporte,
} from './api/reportes';

type Props = { onVolver: () => void; rol: string };
type Selector = 'apiario' | 'colmena' | 'estado' | null;
type Opcion = { valor: string; texto: string };

const C = {
  fondo: '#F2F0E8', blanco: '#FFFFFF', crema: '#FAF9F5', borde: '#DEDCD0',
  bosque: '#102C21', texto: '#153127', muted: '#677669', gold: '#F6A623',
  suaveGold: '#FFF2D9', verde: '#008E68', rojo: '#D92D36',
};
const TIPOS: { tipo: TipoReporte; texto: string }[] = [
  { tipo: 'INSPECCIONES', texto: 'Inspecciones' },
  { tipo: 'TRATAMIENTOS', texto: 'Tratamientos' },
  { tipo: 'COLMENAS', texto: 'Colmenas' },
];
const FORMATOS: { valor: FormatoReporte; texto: string; icono: string }[] = [
  { valor: 'pdf', texto: 'PDF', icono: '▤' },
  { valor: 'xlsx', texto: 'Excel (XLSX)', icono: '▦' },
  { valor: 'csv', texto: 'CSV', icono: '⇩' },
];
const ANCHOS_COLUMNAS: Record<TipoReporte, number[]> = {
  INSPECCIONES: [126, 110, 130, 130, 175, 85, 76, 155, 270],
  TRATAMIENTOS: [112, 112, 110, 128, 146, 160, 100, 116, 158],
  COLMENAS: [119, 130, 170, 146, 184, 159, 170],
};

function validarFecha(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaReal = new Date(`${fecha}T12:00:00`);
  return !Number.isNaN(fechaReal.getTime()) &&
    `${fechaReal.getFullYear()}-${String(fechaReal.getMonth() + 1).padStart(2, '0')}-${String(fechaReal.getDate()).padStart(2, '0')}` === fecha;
}

function OpcionCampo({
  titulo, valor, placeholder, onPress, ancho,
}: {
  titulo: string; valor: string; placeholder: string;
  onPress: () => void; ancho: number;
}) {
  return (
    <View style={[styles.campoGrupo, { width: ancho }]}>
      <Text style={styles.label}>{titulo}</Text>
      <Pressable style={styles.campo} onPress={onPress} accessibilityRole="button">
        <Text style={styles.campoTexto} numberOfLines={1}>{valor || placeholder}</Text>
        <Text style={styles.iconoCampo}>⌄</Text>
      </Pressable>
    </View>
  );
}

export default function ReportesLocales({ onVolver, rol }: Props) {
  const { width } = useWindowDimensions();
  const [anchoPanelResponsive, setAnchoPanelResponsive] = useState(0);
  const anchoDisponible = anchoPanelResponsive || width;
  const tablet = anchoDisponible >= 760;
  const anchoCampo = tablet ? Math.max(155, Math.min(220, (anchoDisponible - 128) / 5)) : Math.max(136, (anchoDisponible - 66) / 2);

  const [filtros, setFiltros] = useState<FiltrosReporte>(FILTROS_INICIALES);
  const [datos, setDatos] = useState<DatosReportes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recargando, setRecargando] = useState(false);
  const [error, setError] = useState('');
  const [selector, setSelector] = useState<Selector>(null);
  const [fechaActiva, setFechaActiva] = useState<'desde' | 'hasta' | null>(null);
  const [descargando, setDescargando] = useState<FormatoReporte | null>(null);

  const cargar = useCallback(async (inicial: boolean) => {
    if (rol !== 'ADMIN') return;
    if (inicial) setCargando(true);
    else setRecargando(true);
    try {
      const sesion = await leerSesionGuardada();
      if (!sesion || !tokenVigente(sesion)) {
        throw new Error('La sesión ha vencido. Vuelve a iniciar sesión.');
      }
      const respuesta = await cargarDatosReportes(sesion.accessToken);
      setDatos(respuesta);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los reportes.');
    } finally {
      setCargando(false);
      setRecargando(false);
    }
  }, [rol]);

  useEffect(() => { void cargar(true); }, [cargar]);

  const cambiar = (campo: keyof FiltrosReporte, valor: string) => {
    setFiltros(actual => {
      const siguiente = { ...actual, [campo]: valor } as FiltrosReporte;
      if (campo === 'tipo') siguiente.estado = '';
      if (campo === 'apiario' && valor && datos && actual.colmena) {
        const c = datos.colmenas.find(x => String(x.id) === actual.colmena);
        if (c && String(c.apiario_id) !== valor) siguiente.colmena = '';
      }
      return siguiente;
    });
  };

  const colmenasOpciones = useMemo(() => {
    if (!datos) return [];
    return datos.colmenas.filter(c => c.activo && !['INACTIVA', 'BAJA'].includes(c.estado) &&
      (!filtros.apiario || c.apiario_id === Number(filtros.apiario)))
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
      .map(c => ({ valor: String(c.id), texto: c.codigo }));
  }, [datos, filtros.apiario]);

  const apiariosOpciones = useMemo(() =>
    (datos?.apiarios ?? []).filter(a => a.activo !== false)
      .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(a => ({ valor: String(a.id), texto: a.nombre })), [datos]);

  const estadosOpciones = ESTADOS_POR_REPORTE[filtros.tipo].map(estado => ({
    valor: estado, texto: NOMBRES_ESTADO[estado] ?? estado,
  }));

  const opciones: Opcion[] = selector === 'apiario' ? apiariosOpciones :
    selector === 'colmena' ? colmenasOpciones : estadosOpciones;
  const tituloSelector = selector === 'apiario' ? 'Apiario' : selector === 'colmena' ? 'Colmena' : 'Estado';
  const obtenerTexto = (lista: Opcion[], valor: string) => lista.find(x => x.valor === valor)?.texto ?? '';
  const vista = useMemo(() => datos ? armarVistaReporte(filtros, datos) : null, [datos, filtros]);
  const tieneFiltros = !!(filtros.desde || filtros.hasta || filtros.apiario || filtros.colmena || filtros.estado);
  const fechasInvertidas = filtros.tipo !== 'COLMENAS' && !!(
    filtros.desde && filtros.hasta && filtros.desde > filtros.hasta);

  const abrirFecha = (campo: 'desde' | 'hasta') => setFechaActiva(campo);
  const elegirFecha = (_event: DateTimePickerEvent, fecha?: Date) => {
    const actual = fechaActiva;
    setFechaActiva(null);
    if (!fecha || !actual) return;
    const texto = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
    if (validarFecha(texto)) cambiar(actual, texto);
  };

  const descargar = async (formato: FormatoReporte) => {
    if (descargando || fechasInvertidas || !datos || rol !== 'ADMIN') return;
    setDescargando(formato);
    try {
      const sesion = await leerSesionGuardada();
      if (!sesion || !tokenVigente(sesion)) throw new Error('Tu sesión ha vencido. Vuelve a ingresar.');
      await compartirReporte(filtros, formato, sesion.accessToken);
    } catch (err) {
      Alert.alert('No se pudo descargar', err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setDescargando(null);
    }
  };

  if (rol !== 'ADMIN') {
    return (
      <View style={styles.centrado}>
        <Text style={styles.titulo}>Reportes</Text>
        <Text style={styles.mensaje}>Este módulo está disponible solamente para administradores.</Text>
        <Pressable onPress={onVolver} style={styles.botonPrimario}><Text style={styles.botonPrimarioTexto}>Volver</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}
        onLayout={(evento) => setAnchoPanelResponsive(evento.nativeEvent.layout.width)}
        refreshControl={<RefreshControl refreshing={recargando} onRefresh={() => void cargar(false)} tintColor={C.gold} colors={[C.gold]} />}
      >
        <View style={styles.encabezado}>
          <View style={{ flex: 1 }}>
            <Pressable onPress={onVolver}><Text style={styles.volver}>‹ Volver al inicio</Text></Pressable>
            <Text style={styles.titulo}>Reportes</Text>
            <Text style={styles.subtitulo}>Colmenares Tres Pinos</Text>
          </View>
          <Pressable onPress={() => void cargar(false)} style={styles.botonActualizar}>
            <Text style={styles.textoActualizar}>⟳ Actualizar</Text>
          </Pressable>
        </View>

        <Text style={styles.introduccion}>Elige el reporte y sus filtros. La vista previa muestra lo que tendrá el archivo.</Text>
        <Text style={styles.label}>Reporte</Text>
        <View style={styles.segmentado}>
          {TIPOS.map(item => (
            <Pressable key={item.tipo} onPress={() => cambiar('tipo', item.tipo)}
              style={[styles.segmento, filtros.tipo === item.tipo && styles.segmentoActivo]}>
              <Text style={[styles.segmentoTexto, filtros.tipo === item.tipo && styles.segmentoTextoActivo]}>{item.texto}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.descripcionReporte}>{CONFIGURACION_REPORTE[filtros.tipo].descripcion}</Text>

        {cargando && !datos ? (
          <View style={styles.cargando}><ActivityIndicator color={C.gold} size="large" /><Text style={styles.mensaje}>Cargando información...</Text></View>
        ) : !datos ? (
          <View style={styles.error}><Text style={styles.errorTexto}>{error || 'No se pudo cargar la información.'}</Text>
            <Pressable onPress={() => void cargar(true)}><Text style={styles.enlace}>Reintentar</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.filtros}>
              {CONFIGURACION_REPORTE[filtros.tipo].periodo && (
                <>
                  {(['desde', 'hasta'] as const).map(campo => (
                    <View key={campo} style={[styles.campoGrupo, { width: anchoCampo }]}>
                      <Text style={styles.label}>{campo === 'desde' ? 'Desde' : 'Hasta'}</Text>
                      <Pressable onPress={() => abrirFecha(campo)} style={styles.campo}>
                        <Text style={styles.campoTexto}>{filtros[campo] ? mostrarFecha(filtros[campo]) : 'dd-mm-aaaa'}</Text>
                        <Text style={styles.iconoCampo}>▦</Text>
                      </Pressable>
                    </View>
                  ))}
                </>
              )}
              <OpcionCampo titulo="Apiario" valor={obtenerTexto(apiariosOpciones, filtros.apiario)}
                placeholder="Todos los apiarios" onPress={() => setSelector('apiario')} ancho={anchoCampo} />
              <OpcionCampo titulo="Colmena" valor={obtenerTexto(colmenasOpciones, filtros.colmena)}
                placeholder="Todas las colmenas" onPress={() => setSelector('colmena')} ancho={anchoCampo} />
              <OpcionCampo titulo="Estado" valor={obtenerTexto(estadosOpciones, filtros.estado)}
                placeholder="Todos los estados" onPress={() => setSelector('estado')} ancho={anchoCampo} />
            </View>
            {fechasInvertidas && <Text style={styles.errorTexto}>La fecha «Desde» debe ser anterior a «Hasta».</Text>}
            {tieneFiltros && (
              <Pressable onPress={() => setFiltros({ ...FILTROS_INICIALES, tipo: filtros.tipo })} style={styles.limpiar}>
                <Text style={styles.limpiarTexto}>Limpiar filtros</Text>
              </Pressable>
            )}

            {!!error && <View style={styles.error}><Text style={styles.errorTexto}>{error}</Text></View>}
            <View style={styles.panel}>
              <View style={styles.panelTitulo}>
                <Text style={styles.panelTituloTexto}>Vista previa: {CONFIGURACION_REPORTE[filtros.tipo].titulo}</Text>
                <Text style={styles.panelSubtitulo}>{resumenFiltros(filtros, datos)} · {vista?.filas.length ?? 0} {(vista?.filas.length ?? 0) === 1 ? 'fila' : 'filas'}</Text>
              </View>
              <View style={styles.exportacion}>
                <View style={styles.exportacionBotones}>
                  {FORMATOS.map(formato => (
                    <Pressable key={formato.valor} onPress={() => void descargar(formato.valor)}
                      disabled={!!descargando || fechasInvertidas}
                      style={[styles.botonExportar, (!!descargando || fechasInvertidas) && styles.deshabilitado]}>
                      <Text style={styles.botonExportarTexto}>{descargando === formato.valor ? '⏳' : formato.icono} {formato.texto}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.textoAyuda}>El archivo incluye todas las filas que coinciden con los filtros al descargar.</Text>
              </View>

              {(vista?.filas.length ?? 0) === 0 ? (
                <View style={styles.vacio}>
                  <Text style={styles.iconoVacio}>▦</Text>
                  <Text style={styles.vacioTitulo}>No hay datos con estos filtros</Text>
                  <Text style={styles.mensaje}>{tieneFiltros ? 'Amplía el período o limpia los filtros.' : 'Todavía no hay registros para este reporte.'}</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.indicacion}>Desliza la tabla hacia los lados para ver todas las columnas ↔</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar={tablet}>
                    <View>
                      <View style={styles.tablaEncabezado}>
                        {(vista?.columnas ?? []).map((col, i) => (
                          <View key={col} style={[styles.celda, { width: ANCHOS_COLUMNAS[filtros.tipo][i] }]}>
                            <Text style={styles.encabezadoTexto}>{col}</Text>
                          </View>
                        ))}
                      </View>
                      {(vista?.filas.slice(0, 25) ?? []).map((fila, i) => (
                        <View key={`${filtros.tipo}-${i}`} style={styles.tablaFila}>
                          {fila.map((valor, j) => (
                            <View key={j} style={[styles.celda, { width: ANCHOS_COLUMNAS[filtros.tipo][j] }]}>
                              <Text style={[styles.tablaTexto, j === 0 && styles.tablaTextoPrimero]}>{valor}</Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                  {(vista?.filas.length ?? 0) > 25 && (
                    <Text style={styles.pieTabla}>Se muestran las primeras 25. El archivo incluye las {vista?.filas.length} filas.</Text>
                  )}
                </>
              )}
            </View>
            <Text style={styles.notaConexion}>Los reportes oficiales y las exportaciones requieren conexión con FastAPI.</Text>
          </>
        )}
      </ScrollView>

      <Modal visible={selector !== null} animationType="fade" transparent onRequestClose={() => setSelector(null)}>
        <Pressable style={styles.modalFondo} onPress={() => setSelector(null)}>
          <View style={[styles.modalCaja, { maxWidth: tablet ? 530 : width - 28 }]}>
            <Text style={styles.modalTitulo}>Seleccionar {tituloSelector.toLowerCase()}</Text>
            <ScrollView style={styles.modalLista}>
              {[{ valor: '', texto: selector === 'apiario' ? 'Todos los apiarios' : selector === 'colmena' ? 'Todas las colmenas' : 'Todos los estados' }, ...opciones].map(item => (
                <Pressable key={item.valor || '_todos'} onPress={() => {
                  if (selector) cambiar(selector, item.valor);
                  setSelector(null);
                }} style={styles.modalOpcion}>
                  <Text style={styles.modalOpcionTexto}>{item.texto}</Text>
                  {filtros[selector ?? 'estado'] === item.valor && <Text style={styles.seleccionado}>✓</Text>}
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setSelector(null)} style={styles.modalCerrar}>
              <Text style={styles.modalCerrarTexto}>Cancelar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {fechaActiva !== null && (
        <DateTimePicker
          value={filtros[fechaActiva] ? new Date(`${filtros[fechaActiva]}T12:00:00`) : new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={elegirFecha}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.fondo },
  contenido: { paddingHorizontal: 18, paddingVertical: 20, paddingBottom: 70, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 },
  volver: { color: C.verde, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  titulo: { color: C.bosque, fontSize: 23, fontWeight: '800' },
  subtitulo: { color: C.muted, fontSize: 12, marginTop: 3 },
  botonActualizar: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: C.blanco, borderWidth: 1, borderColor: C.borde, borderRadius: 9 },
  textoActualizar: { color: C.bosque, fontSize: 12, fontWeight: '600' },
  introduccion: { color: C.muted, fontSize: 13, marginBottom: 22 },
  label: { color: C.bosque, fontSize: 12, fontWeight: '600', marginBottom: 7 },
  segmentado: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  segmento: { backgroundColor: C.crema, borderWidth: 1, borderColor: C.borde, borderRadius: 10, minWidth: 112, paddingHorizontal: 18, paddingVertical: 11, alignItems: 'center' },
  segmentoActivo: { borderColor: C.gold, borderWidth: 2, paddingVertical: 10, backgroundColor: '#FFF9EF' },
  segmentoTexto: { color: C.texto, fontSize: 13 },
  segmentoTextoActivo: { fontWeight: '700' },
  descripcionReporte: { color: C.muted, fontSize: 12, marginBottom: 18 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 19 },
  campoGrupo: { minWidth: 120 },
  campo: { backgroundColor: C.blanco, borderWidth: 1, borderColor: C.borde, borderRadius: 9, minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  campoTexto: { color: C.texto, fontSize: 12, flex: 1 },
  iconoCampo: { color: C.bosque, fontSize: 18 },
  limpiar: { alignSelf: 'flex-start', marginBottom: 15, paddingVertical: 7, paddingHorizontal: 10 },
  limpiarTexto: { color: C.verde, fontWeight: '600', fontSize: 13 },
  panel: { borderRadius: 14, borderWidth: 1, borderColor: C.borde, backgroundColor: C.blanco, overflow: 'hidden' },
  panelTitulo: { padding: 17, borderBottomWidth: 1, borderBottomColor: C.borde },
  panelTituloTexto: { color: C.bosque, fontSize: 15, fontWeight: '700' },
  panelSubtitulo: { color: C.muted, fontSize: 12, marginTop: 5 },
  exportacion: { padding: 12, gap: 9, borderBottomWidth: 1, borderBottomColor: C.borde, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  exportacionBotones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botonExportar: { borderWidth: 1, borderColor: C.borde, backgroundColor: C.blanco, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12 },
  botonExportarTexto: { color: C.bosque, fontSize: 12 },
  deshabilitado: { opacity: 0.45 },
  textoAyuda: { fontSize: 10, color: C.muted },
  indicacion: { color: C.muted, fontSize: 10, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.crema },
  tablaEncabezado: { backgroundColor: C.crema, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borde },
  tablaFila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0EEE7', minHeight: 37 },
  celda: { justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  encabezadoTexto: { color: C.muted, fontSize: 11, fontWeight: '600' },
  tablaTexto: { color: C.texto, fontSize: 11 },
  tablaTextoPrimero: { fontWeight: '700', color: C.bosque },
  pieTabla: { padding: 14, color: C.muted, fontSize: 12 },
  vacio: { minHeight: 170, alignItems: 'center', justifyContent: 'center', padding: 25, backgroundColor: C.blanco },
  iconoVacio: { fontSize: 26, color: '#B3BDAF', marginBottom: 12 },
  vacioTitulo: { color: C.bosque, fontWeight: '700', fontSize: 14, marginBottom: 6, textAlign: 'center' },
  mensaje: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 7 },
  error: { borderWidth: 1, borderColor: '#F3B1B5', backgroundColor: '#FFF5F5', borderRadius: 10, padding: 14, marginBottom: 15 },
  errorTexto: { color: C.rojo, fontSize: 12 },
  enlace: { color: C.verde, fontWeight: '700', marginTop: 10 },
  cargando: { padding: 40, alignItems: 'center', gap: 12 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25, backgroundColor: C.fondo, gap: 12 },
  botonPrimario: { backgroundColor: C.gold, paddingHorizontal: 25, paddingVertical: 11, borderRadius: 9 },
  botonPrimarioTexto: { color: C.bosque, fontWeight: '700' },
  notaConexion: { color: C.muted, fontSize: 11, marginTop: 16, textAlign: 'center' },
  modalFondo: { flex: 1, backgroundColor: '#0008', alignItems: 'center', justifyContent: 'center', padding: 14 },
  modalCaja: { width: '100%', maxWidth: 600, backgroundColor: C.blanco, borderRadius: 14, padding: 17, maxHeight: '80%' },
  modalTitulo: { fontSize: 17, fontWeight: '700', color: C.bosque, marginBottom: 12 },
  modalLista: { flexGrow: 0 },
  modalOpcion: { borderBottomWidth: 1, borderBottomColor: '#F0EEE7', paddingHorizontal: 8, paddingVertical: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalOpcionTexto: { color: C.texto, fontSize: 13, flex: 1 },
  seleccionado: { color: C.verde, fontWeight: '700', fontSize: 16 },
  modalCerrar: { alignSelf: 'flex-end', paddingTop: 16, paddingHorizontal: 8 },
  modalCerrarTexto: { color: C.verde, fontSize: 13, fontWeight: '600' },
});
