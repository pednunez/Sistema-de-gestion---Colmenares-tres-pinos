import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { solicitarAPI } from './cliente';
import { API_BASE_URL } from './config';
import { listarInspeccionesResumen } from './inspecciones';

export type TipoReporte = 'INSPECCIONES' | 'TRATAMIENTOS' | 'COLMENAS';
export type FormatoReporte = 'pdf' | 'xlsx' | 'csv';

export type FiltrosReporte = {
  tipo: TipoReporte;
  desde: string;
  hasta: string;
  apiario: string;
  colmena: string;
  estado: string;
};

export const FILTROS_INICIALES: FiltrosReporte = {
  tipo: 'INSPECCIONES', desde: '', hasta: '', apiario: '', colmena: '', estado: '',
};

export const CONFIGURACION_REPORTE = {
  INSPECCIONES: {
    titulo: 'Inspecciones',
    descripcion: 'Inspecciones realizadas en el período, con su estado, sanidad y responsable.',
    periodo: true,
  },
  TRATAMIENTOS: {
    titulo: 'Tratamientos',
    descripcion: 'Tratamientos iniciados en el período, con producto, dosis y estado.',
    periodo: true,
  },
  COLMENAS: {
    titulo: 'Estado de las colmenas',
    descripcion: 'Situación actual de cada colmena en operación según su última inspección.',
    periodo: false,
  },
} as const;

export const NOMBRES_ESTADO: Record<string, string> = {
  COMPLETA: 'Completa', EN_DESARROLLO: 'En desarrollo', DONANTE: 'Donante',
  DEBIL: 'Débil', REQUIERE_REVISION: 'Requiere revisión',
  BUENO: 'Bueno (escala anterior)', REGULAR: 'Regular (escala anterior)',
  CRITICO: 'Crítico (escala anterior)',
  PLANIFICADO: 'Planificado', EN_CURSO: 'En curso',
  FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
  ACTIVA: 'Activa', EN_OBSERVACION: 'En observación',
  INACTIVA: 'Inactiva', BAJA: 'Dada de baja', SIN: 'Sin inspección',
};

export const ESTADOS_POR_REPORTE: Record<TipoReporte, string[]> = {
  INSPECCIONES: ['COMPLETA', 'EN_DESARROLLO', 'DONANTE', 'DEBIL', 'REQUIERE_REVISION'],
  TRATAMIENTOS: ['PLANIFICADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO'],
  COLMENAS: ['COMPLETA', 'EN_DESARROLLO', 'DONANTE', 'DEBIL', 'REQUIERE_REVISION', 'SIN'],
};

export type ApiarioReporte = { id: number; nombre: string; activo?: boolean };
export type ColmenaReporte = {
  id: number; apiario_id: number; codigo: string; estado: string; activo: boolean;
};
export type InspeccionReporte = {
  id: number; colmena_id: number; usuario_id: number | null; fecha_inspeccion: string;
  estado_general: string | null; signos_enfermedad: boolean | null;
  enfermedad_observada: string | null; cantidad_marcos: number | null;
  tiene_alza: boolean | null; observaciones: string | null; activo?: boolean;
};
export type TratamientoReporte = {
  id: number; colmena_id: number; usuario_id: number; fecha_inicio: string;
  fecha_fin: string | null; tipo_tratamiento: string; producto: string | null;
  dosis: string | null; estado: string;
};
export type UsuarioReporte = {
  id: number; nombre: string; apellido: string | null; activo: boolean;
};

export type DatosReportes = {
  apiarios: ApiarioReporte[];
  colmenas: ColmenaReporte[];
  inspecciones: InspeccionReporte[];
  tratamientos: TratamientoReporte[];
  usuarios: UsuarioReporte[];
};

export type VistaReporte = {
  columnas: string[];
  filas: string[][];
};

// La vista previa no usa /reportes: ese endpoint genera una descarga auditada.
export async function cargarDatosReportes(token: string): Promise<DatosReportes> {
  const [apiarios, colmenas, inspeccionesResumen, tratamientos, usuarios] = await Promise.all([
    solicitarAPI<ApiarioReporte[]>('/apiarios/', { token }),
    solicitarAPI<ColmenaReporte[]>('/colmenas/', { token }),
    listarInspeccionesResumen(token),
    solicitarAPI<TratamientoReporte[]>('/tratamientos/', { token }),
    solicitarAPI<UsuarioReporte[]>('/usuarios/', { token }),
  ]);

  // Los reportes solo usan datos generales de la inspección. No se descargan
  // los marcos de cada registro, que se consultan únicamente en su detalle.
  const inspecciones: InspeccionReporte[] = inspeccionesResumen.map(item => ({
    id: item.id,
    colmena_id: item.colmena_id,
    usuario_id: item.usuario_id ?? null,
    fecha_inspeccion: item.fecha_inspeccion,
    estado_general: item.estado_general,
    signos_enfermedad: item.signos_enfermedad == null
      ? null
      : Boolean(item.signos_enfermedad),
    enfermedad_observada: item.enfermedad_observada,
    cantidad_marcos: item.cantidad_marcos,
    tiene_alza: item.tiene_alza,
    observaciones: item.observaciones,
  }));

  return { apiarios, colmenas, inspecciones, tratamientos, usuarios };
}

// Extrae yyyy-mm-dd respetando la zona horaria chilena para fechas con hora.
export function diaChile(fecha: string | null | undefined): string {
  if (!fecha) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  const valor = new Date(fecha);
  if (!Number.isFinite(valor.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(valor);
  const obtener = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? '';
  return `${obtener('year')}-${obtener('month')}-${obtener('day')}`;
}

export function mostrarFecha(fecha: string | null | undefined): string {
  const dia = diaChile(fecha);
  if (!dia) return '—';
  const [anio, mes, numero] = dia.split('-');
  return `${numero}-${mes}-${anio}`;
}

function pertenecePeriodo(fecha: string, desde: string, hasta: string): boolean {
  const dia = diaChile(fecha);
  return !!dia && (!desde || dia >= desde) && (!hasta || dia <= hasta);
}

function diasTranscurridos(fecha: string): string {
  const valor = new Date(fecha);
  if (!Number.isFinite(valor.getTime())) return '—';
  return String(Math.max(0, Math.floor((Date.now() - valor.getTime()) / 86400000)));
}

const texto = (valor: string | null | undefined, defecto = 'Sin estado') =>
  valor ? (NOMBRES_ESTADO[valor] ?? valor.replace(/_/g, ' ').toLowerCase()) : defecto;

function listaOperativa(colmenas: ColmenaReporte[]) {
  return colmenas.filter(c => c.activo && !['INACTIVA', 'BAJA'].includes(c.estado));
}

export function armarVistaReporte(f: FiltrosReporte, datos: DatosReportes): VistaReporte {
  const colmenas = new Map(datos.colmenas.map(c => [c.id, c]));
  const apiarios = new Map(datos.apiarios.map(a => [a.id, a]));
  const usuarios = new Map(datos.usuarios.map(u => [u.id, u]));
  const operativas = listaOperativa(datos.colmenas);
  const permitidas = new Set(operativas.filter(c =>
    (!f.apiario || c.apiario_id === Number(f.apiario)) &&
    (!f.colmena || c.id === Number(f.colmena))
  ).map(c => c.id));

  const nombreApiario = (colmenaId: number) => {
    const apiario = apiarios.get(colmenas.get(colmenaId)?.apiario_id ?? -1);
    return apiario?.activo === false ? 'Apiario dado de baja' : (apiario?.nombre ?? '—');
  };
  const codigo = (colmenaId: number) => colmenas.get(colmenaId)?.codigo ?? '—';
  const responsable = (id: number | null) => {
    if (id === null) return 'No registrado';
    const u = usuarios.get(id);
    if (!u || !u.activo) return `Usuario #${id}`;
    return [u.nombre, u.apellido].filter(Boolean).join(' ');
  };

  if (f.tipo === 'INSPECCIONES') {
    const lista = datos.inspecciones.filter(i =>
      i.activo !== false && permitidas.has(i.colmena_id) &&
      pertenecePeriodo(i.fecha_inspeccion, f.desde, f.hasta) &&
      (!f.estado || i.estado_general === f.estado)
    ).sort((a, b) => b.fecha_inspeccion.localeCompare(a.fecha_inspeccion) || b.id - a.id);
    return {
      columnas: ['Fecha', 'Colmena', 'Apiario', 'Estado', 'Signos de enfermedad', 'Marcos', 'Alza', 'Responsable', 'Observaciones'],
      filas: lista.map(i => [
        mostrarFecha(i.fecha_inspeccion), codigo(i.colmena_id), nombreApiario(i.colmena_id),
        texto(i.estado_general), i.signos_enfermedad ? `Sí${i.enfermedad_observada ? `: ${i.enfermedad_observada}` : ''}` : 'No',
        i.cantidad_marcos === null ? '—' : String(i.cantidad_marcos),
        i.tiene_alza === null ? '—' : (i.tiene_alza ? 'Sí' : 'No'),
        responsable(i.usuario_id), i.observaciones || '',
      ]),
    };
  }
  if (f.tipo === 'TRATAMIENTOS') {
    const lista = datos.tratamientos.filter(t =>
      permitidas.has(t.colmena_id) &&
      pertenecePeriodo(t.fecha_inicio, f.desde, f.hasta) &&
      (!f.estado || t.estado === f.estado)
    ).sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio) || b.id - a.id);
    return {
      columnas: ['Inicio', 'Término', 'Colmena', 'Apiario', 'Tipo', 'Producto', 'Dosis', 'Estado', 'Responsable'],
      filas: lista.map(t => [
        mostrarFecha(t.fecha_inicio), t.fecha_fin ? mostrarFecha(t.fecha_fin) : '—',
        codigo(t.colmena_id), nombreApiario(t.colmena_id),
        t.tipo_tratamiento.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()),
        t.producto || '—', t.dosis || '—', texto(t.estado), responsable(t.usuario_id),
      ]),
    };
  }
  const ultimas = new Map<number, InspeccionReporte>();
  for (const i of datos.inspecciones) {
    if (i.activo === false || !permitidas.has(i.colmena_id)) continue;
    const actual = ultimas.get(i.colmena_id);
    if (!actual || i.fecha_inspeccion > actual.fecha_inspeccion ||
        (i.fecha_inspeccion === actual.fecha_inspeccion && i.id > actual.id)) {
      ultimas.set(i.colmena_id, i);
    }
  }
  const enCurso = new Map<number, number>();
  datos.tratamientos.forEach(t => {
    if (t.estado === 'EN_CURSO') enCurso.set(t.colmena_id, (enCurso.get(t.colmena_id) ?? 0) + 1);
  });
  const lista = operativas.filter(c => permitidas.has(c.id) &&
    (!f.estado || (ultimas.get(c.id)?.estado_general ?? 'SIN') === f.estado)
  ).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  return {
    columnas: ['Colmena', 'Apiario', 'Estado de la colmena', 'Última inspección', 'Estado según inspección', 'Días sin inspección', 'Tratamientos en curso'],
    filas: lista.map(c => {
      const i = ultimas.get(c.id);
      return [c.codigo, nombreApiario(c.id), texto(c.estado), i ? mostrarFecha(i.fecha_inspeccion) : 'Nunca',
        i ? texto(i.estado_general) : '—', i ? diasTranscurridos(i.fecha_inspeccion) : '—',
        String(enCurso.get(c.id) ?? 0)];
    }),
  };
}

export function resumenFiltros(f: FiltrosReporte, datos: DatosReportes): string {
  const partes: string[] = [];
  if (f.tipo !== 'COLMENAS') {
    if (f.desde && f.hasta) partes.push(`Del ${mostrarFecha(f.desde)} al ${mostrarFecha(f.hasta)}`);
    else if (f.desde) partes.push(`Desde el ${mostrarFecha(f.desde)}`);
    else if (f.hasta) partes.push(`Hasta el ${mostrarFecha(f.hasta)}`);
    else partes.push('Todo el período');
  }
  const apiario = datos.apiarios.find(a => String(a.id) === f.apiario);
  partes.push(apiario ? apiario.nombre : 'Todos los apiarios');
  const colmena = datos.colmenas.find(c => String(c.id) === f.colmena);
  if (colmena) partes.push(`Colmena ${colmena.codigo}`);
  if (f.estado) partes.push(`Estado: ${texto(f.estado)}`);
  return partes.join(' · ');
}

// Descarga el archivo oficial de FastAPI con el token en headers, nunca en la URL.
// Se abre la hoja para guardarlo o compartirlo en Android / iOS.
export async function compartirReporte(f: FiltrosReporte, formato: FormatoReporte, token: string) {
  if (f.tipo !== 'COLMENAS' && f.desde && f.hasta && f.desde > f.hasta) {
    throw new Error('La fecha inicial no puede superar la fecha final.');
  }
  const tipo = f.tipo.toLowerCase();
  const query = [`formato=${formato}`];
  const valores: Record<string, string> = {
    apiario_id: f.apiario, colmena_id: f.colmena, estado: f.estado,
    desde: f.tipo === 'COLMENAS' ? '' : f.desde,
    hasta: f.tipo === 'COLMENAS' ? '' : f.hasta,
  };
  Object.entries(valores).forEach(([clave, valor]) => {
    if (valor) query.push(`${clave}=${encodeURIComponent(valor)}`);
  });
  const mime: Record<FormatoReporte, string> = {
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
  };
  const archivo = new File(Paths.cache, `reporte-${tipo}.${formato}`);
  // File.downloadFileAsync lanza un error ante códigos HTTP distintos de 2xx.
  const descarga = await File.downloadFileAsync(
    `${API_BASE_URL}/reportes/${tipo}?${query.join('&')}`, archivo,
    { headers: { Authorization: `Bearer ${token}` }, idempotent: true },
  );
  if (!descarga.exists || descarga.size === 0) {
    throw new Error('El servidor no devolvió un archivo válido.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este dispositivo no permite compartir archivos desde la aplicación.');
  }
  await Sharing.shareAsync(descarga.uri, {
    dialogTitle: `Guardar reporte de ${tipo}`,
    mimeType: mime[formato],
  });
}
