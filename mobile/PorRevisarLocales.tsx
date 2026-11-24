import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from './theme';
import { SelectorLista, InsigniaMovil } from './ComponentesMoviles';
import FormularioInspeccion from './FormularioInspeccion';

import { leerSesionGuardada, tokenVigente } from './api/auth';
import type { SesionMovil } from './api/auth';
import { listarColmenasSinRevision } from './api/colmenas';
import type { ColmenaSinRevisionApi } from './api/colmenas';
import { listarInspeccionesResumen } from './api/inspecciones';
import type { InspeccionDashboardServidor } from './api/inspecciones';
import { descargarCatalogo, leerCatalogoLocal } from './database/catalogo';
import type { CatalogoMovil, ColmenaCatalogo } from './database/catalogo';
import { listarInspeccionesLocales } from './database/inspecciones';
import type { InspeccionGuardada } from './database/inspecciones';

// ==========================================
// TIPOS Y CONSTANTES
// ==========================================

type Props = {
  onVolver: () => void;
};

type FilaRevision = {
  colmena: ColmenaCatalogo;
  ultima: InspeccionDashboardServidor | null;
  fechaUltima: string | null;
  dias: number | null;
  requiereRevision: boolean;
  sinRevision: boolean;
  nunca: boolean;
};

const PERIODOS = [15, 30, 60, 90];
const ESTADOS_A_REVISAR = ['REQUIERE_REVISION', 'CRITICO'];

function diasDesde(fecha: string | null): number | null {
  if (!fecha) return null;
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - valor.getTime()) / 86400000));
}

function formatearFecha(fecha: string | null): string {
  if (!fecha) return 'Sin inspecciones';
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return 'Fecha no disponible';
  return valor.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function plural(cantidad: number, singular: string, pluralTexto: string) {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

// ==========================================
// PANTALLA
// ==========================================

export default function PorRevisarLocales({ onVolver }: Props) {
  const [sesion, setSesion] = useState<SesionMovil | null>(null);
  const catalogoSolicitadoRef = useRef(false);
  const [catalogo, setCatalogo] = useState<CatalogoMovil | null>(null);
  const [sinRevisionServidor, setSinRevisionServidor] = useState<ColmenaSinRevisionApi[]>([]);
  const [inspeccionesServidor, setInspeccionesServidor] = useState<InspeccionDashboardServidor[]>([]);
  const [inspeccionesLocales, setInspeccionesLocales] = useState<InspeccionGuardada[]>([]);
  const [apiarioId, setApiarioId] = useState('');
  const [dias, setDias] = useState(30);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [codigoQRActivo, setCodigoQRActivo] = useState<string | null>(null);

  const cargar = useCallback(async (forzar = false, periodo = dias, apiario = apiarioId) => {
    if (forzar) setActualizando(true);
    else setCargando(true);
    setError('');

    try {
      const sesionActual = await leerSesionGuardada();
      if (!sesionActual) {
        throw new Error('No existe una sesión móvil activa. Vuelve a iniciar sesión.');
      }
      setSesion(sesionActual);

      // Recuperar y pintar primero las copias locales.
      const [catalogoLocal, locales] = await Promise.all([
        leerCatalogoLocal(sesionActual.usuario.id).catch(() => null),
        listarInspeccionesLocales().catch(() => [] as InspeccionGuardada[]),
      ]);

      setCatalogo(catalogoLocal);
      setInspeccionesLocales(locales);

      if (catalogoLocal || locales.length > 0) {
        setCargando(false);
      }

      if (!tokenVigente(sesionActual)) {
        setError('La sesión venció. Se muestran los registros disponibles en el dispositivo.');
        setSinRevisionServidor([]);
        setInspeccionesServidor([]);
        return;
      }

      // El período y apiario afectan solo el endpoint de colmenas pendientes.
      // Las inspecciones-resumen se descargan sin marcos y solo una por colmena.
      const tareas: Promise<unknown>[] = [
        listarColmenasSinRevision(
          sesionActual.accessToken,
          periodo,
          apiario ? Number(apiario) : undefined
        ),
        listarInspeccionesResumen(sesionActual.accessToken, true),
      ];

      if (!catalogoLocal || forzar || !catalogoSolicitadoRef.current) {
        catalogoSolicitadoRef.current = true;
        tareas.push(descargarCatalogo(sesionActual));
      }

      const resultados = await Promise.allSettled(tareas);

      if (resultados[0].status === 'fulfilled') {
        setSinRevisionServidor(
          resultados[0].value as ColmenaSinRevisionApi[]
        );
      } else {
        setSinRevisionServidor([]);
        setError(
          'No se pudo consultar el listado del servidor. Se calculará el período con los registros disponibles en el teléfono.'
        );
      }

      if (resultados[1].status === 'fulfilled') {
        setInspeccionesServidor(
          resultados[1].value as InspeccionDashboardServidor[]
        );
      } else {
        setInspeccionesServidor([]);
        setError(actual =>
          actual || 'No se pudieron cargar las inspecciones del servidor. Se utilizará el historial local.'
        );
      }

      if (tareas.length > 2) {
        const resultadoCatalogo = resultados[2];
        if (resultadoCatalogo.status === 'fulfilled') {
          setCatalogo(resultadoCatalogo.value as CatalogoMovil);
        } else {
          catalogoSolicitadoRef.current = false;
          if (!catalogoLocal) {
            throw resultadoCatalogo.reason;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las colmenas por revisar.');
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, [dias, apiarioId]);

  useEffect(() => {
    void cargar(false, dias, apiarioId);
  }, [cargar, dias, apiarioId]);

  const filas = useMemo<FilaRevision[]>(() => {
    if (!catalogo) return [];

    const colmenasPorQr = new Map<string, ColmenaCatalogo>(
      catalogo.colmenas.map(colmena => [colmena.codigo_qr.toLowerCase(), colmena])
    );
    const ultimaPorColmena = new Map<number, InspeccionDashboardServidor>();
    for (const inspeccion of inspeccionesServidor) {
      const actual = ultimaPorColmena.get(inspeccion.colmena_id);
      if (!actual || new Date(inspeccion.fecha_inspeccion) > new Date(actual.fecha_inspeccion)) {
        ultimaPorColmena.set(inspeccion.colmena_id, inspeccion);
      }
    }

    const ultimaLocalPorColmena = new Map<number, InspeccionGuardada>();
    for (const inspeccion of inspeccionesLocales) {
      if (inspeccion.estado === 'ANULADA') continue;
      const colmena = colmenasPorQr.get(inspeccion.codigo_qr.toLowerCase());
      if (!colmena) continue;
      const actual = ultimaLocalPorColmena.get(colmena.id);
      if (!actual || new Date(inspeccion.fecha_local) > new Date(actual.fecha_local)) {
        ultimaLocalPorColmena.set(colmena.id, inspeccion);
      }
    }

    const backendPorId = new Map<number, ColmenaSinRevisionApi>(sinRevisionServidor.map(item => [item.id, item] as const));
    const resultado: FilaRevision[] = [];

    for (const colmena of catalogo.colmenas) {
      if (colmena.estado === 'INACTIVA' || colmena.estado === 'BAJA') continue;
      if (apiarioId && String(colmena.apiario_id) !== apiarioId) continue;

      const ultimaServidor = ultimaPorColmena.get(colmena.id) ?? null;
      const ultimaLocal = ultimaLocalPorColmena.get(colmena.id) ?? null;
      const backend = backendPorId.get(colmena.id);
      const fechaServidor = backend?.ultima_inspeccion ?? ultimaServidor?.fecha_inspeccion ?? null;
      const fechaLocal = ultimaLocal?.fecha_local ?? null;
      const fechaUltima = [fechaServidor, fechaLocal]
        .filter((valor): valor is string => Boolean(valor))
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

      const diasSinRevision = diasDesde(fechaUltima);
      const nunca = !fechaUltima;
      const sinRevision = nunca || (diasSinRevision !== null && diasSinRevision >= dias);
      const inspeccionLocalEsMasNueva = Boolean(
        fechaLocal &&
        (!ultimaServidor || new Date(fechaLocal) > new Date(ultimaServidor.fecha_inspeccion))
      );
      const ultima = ultimaServidor;
      const requiereRevision = Boolean(
        ultima &&
        !inspeccionLocalEsMasNueva &&
        ESTADOS_A_REVISAR.includes(ultima.estado_general ?? '')
      );

      if (!sinRevision && !requiereRevision) continue;

      resultado.push({
        colmena,
        ultima,
        fechaUltima,
        dias: diasSinRevision,
        requiereRevision,
        sinRevision,
        nunca,
      });
    }

    return resultado.sort((a, b) =>
      Number(b.requiereRevision) - Number(a.requiereRevision) ||
      Number(b.nunca) - Number(a.nunca) ||
      (b.dias ?? 0) - (a.dias ?? 0) ||
      a.colmena.codigo.localeCompare(b.colmena.codigo, 'es', { numeric: true })
    );
  }, [catalogo, inspeccionesServidor, inspeccionesLocales, sinRevisionServidor, apiarioId, dias]);

  const conteo = useMemo(() => ({
    total: filas.length,
    requiereRevision: filas.filter(fila => fila.requiereRevision).length,
    nunca: filas.filter(fila => fila.nunca).length,
    sinRevision: filas.filter(fila => fila.sinRevision && !fila.nunca).length,
  }), [filas]);

  const apiarios = (catalogo?.apiarios ?? []).map(item => ({ value: String(item.id), label: item.nombre }));

  if (codigoQRActivo) {
    return (
      <FormularioInspeccion
        codigoQR={codigoQRActivo}
        onVolver={() => {
          setCodigoQRActivo(null);
          void cargar(true);
        }}
      />
    );
  }

  if (cargando) {
    return (
      <View style={styles.cargandoPantalla}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.textoCargando}>Buscando colmenas por revisar...</Text>
      </View>
    );
  }

  return (
    <View style={styles.pantalla}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        style={{ flex: 1 }}
        data={filas}
        keyExtractor={(fila) => String(fila.colmena.id)}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <View>
            <Pressable onPress={onVolver} style={styles.volver}>
              <Text style={styles.volverTexto}>‹ Volver</Text>
            </Pressable>
            <Text style={styles.titulo}>Por revisar</Text>
            <Text style={styles.subtitulo}>
              Colmenas sin inspección en los últimos {dias} días, nunca inspeccionadas o con su última inspección en «Requiere revisión».
            </Text>

            <Text style={styles.label}>Ver por apiario</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip texto="Todos los apiarios" activo={!apiarioId} onPress={() => setApiarioId('')} />
              {apiarios.map(item => (
                <Chip key={item.value} texto={item.label} activo={apiarioId === item.value} onPress={() => setApiarioId(item.value)} />
              ))}
            </ScrollView>

            <View style={styles.filtrosPeriodo}>
              <View style={{ flex: 1 }}>
                <SelectorLista
                  label="Sin inspección en los últimos"
                  value={String(dias)}
                  opciones={PERIODOS.map(item => ({ value: String(item), label: `${item} días` }))}
                  onChange={valor => setDias(Number(valor))}
                />
              </View>
              <Pressable onPress={() => void cargar(true)} disabled={actualizando} style={styles.actualizarBoton}>
                <Text style={styles.actualizarTexto}>{actualizando ? 'Actualizando…' : '⟳ Actualizar'}</Text>
              </Pressable>
            </View>

            {filas.length > 0 && (
              <View style={styles.resumen}>
                <InsigniaMovil texto={plural(conteo.total, 'colmena', 'colmenas')} />
                {conteo.requiereRevision > 0 && <InsigniaMovil texto={`${conteo.requiereRevision} requieren revisión`} tono="rojo" />}
                {conteo.nunca > 0 && <InsigniaMovil texto={plural(conteo.nunca, 'nunca inspeccionada', 'nunca inspeccionadas')} tono="ambar" />}
                {conteo.sinRevision > 0 && <InsigniaMovil texto={`${conteo.sinRevision} con más de ${dias} días`} tono="ambar" />}
              </View>
            )}

            {!!error && (
              <View style={styles.aviso}>
                <Text style={styles.avisoTexto}>{error}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.vacio}>
            <Text style={styles.vacioTitulo}>No hay colmenas por revisar</Text>
            <Text style={styles.vacioTexto}>
              Todas las colmenas {apiarioId ? `de ${catalogo?.apiarios.find(item => String(item.id) === apiarioId)?.nombre ?? 'este apiario'} ` : ''}tienen una inspección en los últimos {dias} días y ninguna quedó en «Requiere revisión».
            </Text>
          </View>
        }
        renderItem={({ item: fila }) => (
          <View style={styles.tarjeta}>
            <View style={styles.tarjetaCabecera}>
              <View style={{ flex: 1 }}>
                <Text style={styles.codigo}>{fila.colmena.codigo}</Text>
                <Text style={styles.apiario}>{catalogo?.apiarios.find(item => item.id === fila.colmena.apiario_id)?.nombre ?? 'Apiario'}</Text>
              </View>
              {fila.requiereRevision && <InsigniaMovil texto="Requiere revisión" tono="rojo" />}
            </View>

            <View style={styles.motivos}>
              {fila.nunca ? (
                <InsigniaMovil texto="Nunca inspeccionada" tono="ambar" />
              ) : fila.sinRevision ? (
                <InsigniaMovil texto={`${fila.dias ?? dias} días sin inspección`} tono="ambar" />
              ) : null}
              {fila.requiereRevision && <Text style={styles.motivoTexto}>La última inspección quedó en «Requiere revisión».</Text>}
            </View>

            <View style={styles.ultimaFila}>
              <View style={{ flex: 1 }}>
                <Text style={styles.labelPequeno}>Última inspección</Text>
                <Text style={styles.ultimaValor}>{fila.nunca ? 'Sin inspecciones' : formatearFecha(fila.fechaUltima)}</Text>
              </View>
              {fila.ultima && <InsigniaMovil texto={fila.ultima.estado_general?.replaceAll('_', ' ') ?? 'Sin estado'} tono={fila.requiereRevision ? 'rojo' : 'azul'} />}
            </View>

            <Pressable
              style={styles.botonInspeccionar}
              onPress={() => setCodigoQRActivo(fila.colmena.codigo_qr)}
            >
              <Text style={styles.botonInspeccionarTexto}>▣ Inspeccionar</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <Text style={styles.pie}>La lista combina el período consultado en FastAPI con el historial local pendiente de sincronización.</Text>
        }
      />
    </View>
  );

}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, activo && styles.chipActivo]}>
      <Text style={[styles.chipTexto, activo && styles.chipTextoActivo]}>{texto}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: COLORS.backgroundSoft },
  contenido: { paddingHorizontal: 18, paddingTop: 22, paddingBottom: 50 },
  volver: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 4 },
  volverTexto: { color: COLORS.goldText, fontSize: 13, fontWeight: '800' },
  titulo: { color: COLORS.forest, fontSize: 27, fontWeight: '900' },
  subtitulo: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 18 },
  label: { color: COLORS.text, fontSize: 12, fontWeight: '800', marginBottom: 7 },
  chips: { gap: 8, paddingBottom: 13 },
  chip: { borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  chipActivo: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  chipTexto: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  chipTextoActivo: { color: '#35230A' },
  filtrosPeriodo: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 },
  actualizarBoton: { minHeight: 46, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  actualizarTexto: { color: COLORS.goldText, fontSize: 11, fontWeight: '800' },
  resumen: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  lista: { gap: 11 },
  tarjeta: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, padding: 14, gap: 11 },
  tarjetaCabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  codigo: { color: COLORS.forest, fontSize: 15, fontWeight: '900' },
  apiario: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  motivos: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  motivoTexto: { color: COLORS.danger, fontSize: 10, flexShrink: 1 },
  ultimaFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  labelPequeno: { color: COLORS.textMuted, fontSize: 10 },
  ultimaValor: { color: COLORS.text, fontSize: 12, fontWeight: '700', marginTop: 3 },
  botonInspeccionar: { borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface, borderRadius: 10, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  botonInspeccionarTexto: { color: COLORS.forest, fontSize: 12, fontWeight: '800' },
  aviso: { backgroundColor: COLORS.warningBg, borderWidth: 1, borderColor: COLORS.goldBorder, borderRadius: 11, padding: 11, marginBottom: 12 },
  avisoTexto: { color: COLORS.goldText, fontSize: 11, lineHeight: 16 },
  vacio: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, padding: 22, alignItems: 'center', gap: 8 },
  vacioTitulo: { color: COLORS.forest, fontSize: 15, fontWeight: '800' },
  vacioTexto: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pie: { color: COLORS.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 22 },
  cargandoPantalla: { flex: 1, backgroundColor: COLORS.backgroundSoft, alignItems: 'center', justifyContent: 'center', gap: 12 },
  textoCargando: { color: COLORS.textSecondary, fontSize: 13 },
});
