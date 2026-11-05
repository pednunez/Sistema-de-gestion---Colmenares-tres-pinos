
import * as SQLite from 'expo-sqlite';

import {
  leerSesionGuardada,
  tokenVigente,
} from '../api/auth';

import {
  leerCatalogoLocal,
} from './catalogo';

import {
  crearIdCliente,
  listarInspeccionesLocales,
} from './inspecciones';

// ==========================================
// TIPOS DE INSPECCIÓN
// ==========================================

export type EstadoGeneral =
  | 'COMPLETA'
  | 'EN_DESARROLLO'
  | 'DONANTE'
  | 'DEBIL'
  | 'REQUIERE_REVISION';

export type Nivel =
  | 'BAJO'
  | 'MEDIO'
  | 'ALTO';

export type NivelMiel =
  | 'SIN_MIEL'
  | 'POCA'
  | 'MEDIA'
  | 'ABUNDANTE';

export type ContenidoMarco =
  | 'MIEL_Y_CRIA'
  | 'SOLO_CRIA'
  | 'SOLO_MIEL'
  | 'CERA_ESTIRADA'
  | 'CERA_ESTAMPADA'
  | 'CERA_UNTADA'
  | 'SIN_MARCO';

export type UbicacionMarco =
  | 'CAMARA_CRIA'
  | 'ALZA';

export type MarcoLocal = {
  numero: number;
  contenido: ContenidoMarco | '';
  transferir: boolean;
  destino: string;
};

export type InspeccionAvanzada = {
  codigoQR: string;
  estadoGeneral: EstadoGeneral | null;
  reinaObservada: boolean | null;
  presenciaCria: boolean | null;
  postura: boolean | null;
  nivelPoblacion: Nivel | null;
  reservasAlimento: Nivel | null;
  nivelMiel: NivelMiel | null;
  alimentacion: string;
  signosEnfermedad: boolean;
  enfermedadObservada: string;
  tirasMedicamento: number | null;
  observaciones: string;
  tieneAlza: boolean;
  camara: MarcoLocal[];
  alza: MarcoLocal[];
};

// ==========================================
// CATÁLOGOS PERMITIDOS
// ==========================================

export const OPCIONES_MARCOS: {
  valor: ContenidoMarco;
  texto: string;
}[] = [
  { valor: 'MIEL_Y_CRIA', texto: 'Miel y cría' },
  { valor: 'SOLO_CRIA', texto: 'Solo cría' },
  { valor: 'SOLO_MIEL', texto: 'Solo miel' },
  { valor: 'CERA_ESTIRADA', texto: 'Cera estirada' },
  { valor: 'CERA_ESTAMPADA', texto: 'Cera estampada' },
  { valor: 'CERA_UNTADA', texto: 'Cera untada' },
  { valor: 'SIN_MARCO', texto: 'Sin marco' },
];

const CONTENIDOS = new Set<string>(
  OPCIONES_MARCOS.map(opcion => opcion.valor)
);

const ESTADOS = new Set<string>([
  'COMPLETA',
  'EN_DESARROLLO',
  'DONANTE',
  'DEBIL',
  'REQUIERE_REVISION',
]);

const NIVELES = new Set<string>([
  'BAJO',
  'MEDIO',
  'ALTO',
]);

const NIVELES_MIEL = new Set<string>([
  'SIN_MIEL',
  'POCA',
  'MEDIA',
  'ABUNDANTE',
]);

// ==========================================
// CREAR CAJA
// ==========================================

export function crearCaja(): MarcoLocal[] {
  return Array.from(
    { length: 10 },
    (_, indice) => ({
      numero: indice + 1,
      contenido: '',
      transferir: false,
      destino: '',
    })
  );
}

// ==========================================
// VALIDACIÓN DE TEXTOS
// ==========================================

const NO_PERMITIDOS =
  /[^A-Za-zÀ-ÖØ-öø-ÿ0-9 \n.,;:¿?¡!()%+°ºµ'/-]/g;

export function limpiarObservacion(
  valor: string,
  maximo = 1000
): string {
  return valor
    .normalize('NFC')
    .replace(/\r/g, '')
    .replace(NO_PERMITIDOS, '')
    .replace(/[ \t]{2,}/g, ' ')
    .slice(0, maximo);
}

function validarTexto(
  texto: string,
  nombre: string,
  limite: number
): void {
  if (
    texto.length > limite ||
    limpiarObservacion(texto, limite) !== texto
  ) {
    throw new Error(
      `${nombre}: caracteres no permitidos o demasiados caracteres.`
    );
  }
}

// ==========================================
// NORMALIZAR UUID
// ==========================================

function normalizarQR(
  codigo: string
): string {
  return codigo.trim().toLowerCase();
}

// ==========================================
// OBTENER SESIÓN Y CATÁLOGO
// ==========================================

async function obtenerContextoAutorizado() {
  const sesion = await leerSesionGuardada();

  if (!sesion) {
    throw new Error(
      'Debes iniciar sesión para registrar una inspección oficial.'
    );
  }

  if (!tokenVigente(sesion)) {
    throw new Error(
      'Tu sesión ha vencido. Inicia sesión nuevamente.'
    );
  }

  const catalogo = await leerCatalogoLocal(
    sesion.usuario.id
  );

  if (!catalogo) {
    throw new Error(
      'No existe un catálogo oficial descargado para este usuario.'
    );
  }

  return {
    sesion,
    catalogo,
  };
}

// ==========================================
// DESTINOS OFICIALES
// ==========================================

export async function listarDestinosLocales(
  origen: string
): Promise<string[]> {
  const { catalogo } =
    await obtenerContextoAutorizado();

  const origenNormalizado = normalizarQR(origen);

  const existeOrigen = catalogo.colmenas.some(
    colmena =>
      normalizarQR(colmena.codigo_qr) ===
      origenNormalizado
  );

  if (!existeOrigen) {
    throw new Error(
      'La colmena de origen no existe en el catálogo oficial.'
    );
  }

  return catalogo.colmenas
    .filter(
      colmena =>
        normalizarQR(colmena.codigo_qr) !==
        origenNormalizado
    )
    .map(colmena => colmena.codigo_qr);
}

// ==========================================
// RESUMEN AUTOMÁTICO DE MARCOS
// ==========================================

export function resumenMarcos(
  datos: Pick<
    InspeccionAvanzada,
    'camara' | 'alza' | 'tieneAlza'
  >
) {
  const activos = [
    ...datos.camara,
    ...(datos.tieneAlza ? datos.alza : []),
  ];

  return {
    total: activos.filter(
      marco =>
        marco.contenido !== '' &&
        marco.contenido !== 'SIN_MARCO'
    ).length,

    cria: activos.filter(
      marco =>
        marco.contenido === 'MIEL_Y_CRIA' ||
        marco.contenido === 'SOLO_CRIA'
    ).length,

    miel: activos.filter(
      marco =>
        marco.contenido === 'MIEL_Y_CRIA' ||
        marco.contenido === 'SOLO_MIEL'
    ).length,

    transferencias: activos.filter(
      marco => marco.transferir
    ).length,

    sinRegistrar: activos.filter(
      marco => marco.contenido === ''
    ).length,
  };
}

// ==========================================
// VALIDAR CADA CAJA
// ==========================================

function validarCaja(
  caja: MarcoLocal[],
  nombre: string,
  origen: string,
  destinos: Set<string>
): void {
  if (caja.length !== 10) {
    throw new Error(
      `${nombre}: deben existir exactamente 10 posiciones.`
    );
  }

  const numeros = new Set<number>();

  for (const marco of caja) {
    if (
      !Number.isInteger(marco.numero) ||
      marco.numero < 1 ||
      marco.numero > 10 ||
      numeros.has(marco.numero)
    ) {
      throw new Error(
        `Posición inválida o repetida en ${nombre}.`
      );
    }

    numeros.add(marco.numero);

    if (
      !marco.contenido ||
      !CONTENIDOS.has(marco.contenido)
    ) {
      throw new Error(
        `Falta registrar el marco ${marco.numero} de ${nombre}.`
      );
    }

    if (typeof marco.transferir !== 'boolean') {
      throw new Error(
        'El estado de transferencia no es válido.'
      );
    }

    if (marco.transferir) {
      if (marco.contenido === 'SIN_MARCO') {
        throw new Error(
          `No se puede transferir la posición vacía ${marco.numero}.`
        );
      }

      if (!marco.destino) {
        throw new Error(
          `Selecciona el destino del marco ${marco.numero}.`
        );
      }

      if (
        normalizarQR(marco.destino) ===
        normalizarQR(origen)
      ) {
        throw new Error(
          'Una colmena no puede transferir marcos a sí misma.'
        );
      }

      if (
        !destinos.has(normalizarQR(marco.destino))
      ) {
        throw new Error(
          `El destino del marco ${marco.numero} no pertenece al catálogo oficial.`
        );
      }
    } else if (marco.destino !== '') {
      throw new Error(
        'Un marco sin transferencia no debe tener destino.'
      );
    }
  }
}

// ==========================================
// VALIDAR INSPECCIÓN
// ==========================================

export function validarInspeccionAvanzada(
  datos: InspeccionAvanzada,
  destinosDisponibles: string[]
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(datos.codigoQR)
  ) {
    throw new Error(
      'El UUID de la colmena no es válido.'
    );
  }

  if (
    !datos.estadoGeneral ||
    !ESTADOS.has(datos.estadoGeneral)
  ) {
    throw new Error(
      'Selecciona un estado general válido.'
    );
  }

  for (const valor of [
    datos.reinaObservada,
    datos.presenciaCria,
    datos.postura,
  ]) {
    if (
      valor !== null &&
      typeof valor !== 'boolean'
    ) {
      throw new Error(
        'Respuesta de inspección inválida.'
      );
    }
  }

  for (const nivel of [
    datos.nivelPoblacion,
    datos.reservasAlimento,
  ]) {
    if (
      nivel !== null &&
      !NIVELES.has(nivel)
    ) {
      throw new Error(
        'Nivel de inspección inválido.'
      );
    }
  }

  if (
    datos.nivelMiel !== null &&
    !NIVELES_MIEL.has(datos.nivelMiel)
  ) {
    throw new Error(
      'Nivel de miel inválido.'
    );
  }

  validarTexto(
    datos.alimentacion,
    'Alimentación',
    500
  );

  validarTexto(
    datos.enfermedadObservada,
    'Enfermedad',
    500
  );

  validarTexto(
    datos.observaciones,
    'Observaciones',
    1000
  );

  if (
    typeof datos.signosEnfermedad !== 'boolean' ||
    typeof datos.tieneAlza !== 'boolean'
  ) {
    throw new Error(
      'Datos de inspección inválidos.'
    );
  }

  if (
    datos.postura === true &&
    datos.presenciaCria === false
  ) {
    throw new Error(
      'No puedes marcar postura presente y cría ausente.'
    );
  }

  if (datos.signosEnfermedad) {
    if (!datos.enfermedadObservada.trim()) {
      throw new Error(
        'Describe los signos de enfermedad observados.'
      );
    }

    if (
      datos.tirasMedicamento !== null &&
      ![1, 2, 3].includes(datos.tirasMedicamento)
    ) {
      throw new Error(
        'Solo se permiten 1, 2 o 3 tiras.'
      );
    }
  } else {
    if (
      datos.enfermedadObservada.trim() ||
      datos.tirasMedicamento !== null
    ) {
      throw new Error(
        'No debe haber datos sanitarios si marcaste sin signos.'
      );
    }
  }

  const destinos = new Set(
    destinosDisponibles.map(normalizarQR)
  );

  validarCaja(
    datos.camara,
    'cámara de cría',
    datos.codigoQR,
    destinos
  );

  if (datos.tieneAlza) {
    validarCaja(
      datos.alza,
      'alza',
      datos.codigoQR,
      destinos
    );
  } else if (
    datos.alza.some(
      marco =>
        marco.contenido !== '' ||
        marco.transferir ||
        marco.destino !== ''
    )
  ) {
    throw new Error(
      'La colmena está marcada sin alza, pero hay datos de alza.'
    );
  }

  const resumen = resumenMarcos(datos);

  if (
    datos.presenciaCria === false &&
    resumen.cria > 0
  ) {
    throw new Error(
      'Registraste marcos con cría, pero seleccionaste cría ausente.'
    );
  }

  if (
    datos.nivelMiel === 'SIN_MIEL' &&
    resumen.miel > 0
  ) {
    throw new Error(
      'Seleccionaste sin miel, pero registraste marcos con miel.'
    );
  }

  return resumen;
}

// ==========================================
// SQLITE
// ==========================================

let conexion:
  Promise<SQLite.SQLiteDatabase> | null = null;

async function iniciarBD() {
  const db = await SQLite.openDatabaseAsync(
    'colmenas.db'
  );

  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS inspecciones_detalle_local (
      inspeccion_local_id INTEGER PRIMARY KEY
        REFERENCES inspecciones_locales(id),
      estado_general TEXT NOT NULL,
      reina_observada INTEGER,
      presencia_cria INTEGER,
      postura INTEGER,
      nivel_poblacion TEXT,
      reservas_alimento TEXT,
      nivel_miel TEXT,
      alimentacion TEXT NOT NULL DEFAULT '',
      signos_enfermedad INTEGER NOT NULL,
      enfermedad_observada TEXT NOT NULL DEFAULT '',
      tiras_medicamento INTEGER,
      tiene_alza INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS marcos_inspeccion_local (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inspeccion_local_id INTEGER NOT NULL
        REFERENCES inspecciones_locales(id),
      ubicacion TEXT NOT NULL
        CHECK(
          ubicacion IN ('CAMARA_CRIA','ALZA')
        ),
      numero INTEGER NOT NULL
        CHECK(numero BETWEEN 1 AND 10),
      contenido TEXT NOT NULL,
      transferir INTEGER NOT NULL DEFAULT 0,
      destino_codigo TEXT,
      UNIQUE(
        inspeccion_local_id,
        ubicacion,
        numero
      )
    );

    CREATE INDEX IF NOT EXISTS idx_marcos_inspeccion_local
    ON marcos_inspeccion_local(
      inspeccion_local_id
    );
  `);

  return db;
}

function obtenerBD() {
  if (!conexion) {
    conexion = iniciarBD().catch(error => {
      conexion = null;
      throw error;
    });
  }

  return conexion;
}

// ==========================================
// GUARDAR INSPECCIÓN AVANZADA
// ==========================================

export async function guardarInspeccionAvanzada(
  datos: InspeccionAvanzada
): Promise<number> {
  // 1. Recuperar identidad y catálogo.
  const { sesion, catalogo } =
    await obtenerContextoAutorizado();

  const origenQR = normalizarQR(
    datos.codigoQR
  );

  // 2. Comprobar origen oficial.
  const origen = catalogo.colmenas.find(
    colmena =>
      normalizarQR(colmena.codigo_qr) ===
      origenQR
  );

  if (!origen) {
    throw new Error(
      'La colmena de origen no pertenece al catálogo oficial.'
    );
  }

  // 3. Preparar destinos válidos.
  const destinosOficiales = catalogo.colmenas
    .filter(
      colmena =>
        normalizarQR(colmena.codigo_qr) !==
        origenQR
    )
    .map(colmena => colmena.codigo_qr);

  // 4. Validar todos los datos.
  const resumen = validarInspeccionAvanzada(
    datos,
    destinosOficiales
  );

  // 5. Preparar marcos.
  const cajas: {
    ubicacion: UbicacionMarco;
    marcos: MarcoLocal[];
  }[] = [
    {
      ubicacion: 'CAMARA_CRIA',
      marcos: datos.camara,
    },
  ];

  if (datos.tieneAlza) {
    cajas.push({
      ubicacion: 'ALZA',
      marcos: datos.alza,
    });
  }

  const reina =
    datos.reinaObservada === null
      ? 'Sin evaluar'
      : datos.reinaObservada
        ? 'Vista'
        : 'No vista';

  // 6. Crear tabla principal y migrarla.
  // No borra registros existentes.
  await listarInspeccionesLocales();

  const db = await obtenerBD();

  // 7. Crear UUID y fecha original.
  // Ambos quedan guardados para que
  // los reintentos sean seguros.
  const idCliente = crearIdCliente();
  const fechaReal = new Date().toISOString();

  let nuevoId = 0;

  // 8. Guardar toda la inspección en una
  // sola transacción SQLite.
  await db.withExclusiveTransactionAsync(
    async tx => {
      const resultado = await tx.runAsync(
        `INSERT INTO inspecciones_locales (
          codigo_qr,
          marcos_totales,
          marcos_cria,
          marcos_miel,
          reina,
          observaciones,
          fecha_local,
          estado,
          id_cliente,
          servidor_id,
          usuario_local_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          'PENDIENTE', ?, NULL, ?
        )`,
        [
          datos.codigoQR,
          resumen.total,
          resumen.cria,
          resumen.miel,
          reina,
          datos.observaciones.trim(),
          fechaReal,
          idCliente,
          sesion.usuario.id,
        ]
      );

      nuevoId = resultado.lastInsertRowId;

      // Guardar datos de la inspección.
      await tx.runAsync(
        `INSERT INTO inspecciones_detalle_local (
          inspeccion_local_id,
          estado_general,
          reina_observada,
          presencia_cria,
          postura,
          nivel_poblacion,
          reservas_alimento,
          nivel_miel,
          alimentacion,
          signos_enfermedad,
          enfermedad_observada,
          tiras_medicamento,
          tiene_alza
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
        [
          nuevoId,
          datos.estadoGeneral!,
          datos.reinaObservada === null
            ? null
            : Number(datos.reinaObservada),
          datos.presenciaCria === null
            ? null
            : Number(datos.presenciaCria),
          datos.postura === null
            ? null
            : Number(datos.postura),
          datos.nivelPoblacion,
          datos.reservasAlimento,
          datos.nivelMiel,
          datos.alimentacion.trim(),
          Number(datos.signosEnfermedad),
          datos.enfermedadObservada.trim(),
          datos.tirasMedicamento,
          Number(datos.tieneAlza),
        ]
      );

      // Guardar los diez marcos de cada caja.
      for (const caja of cajas) {
        for (const marco of caja.marcos) {
          await tx.runAsync(
            `INSERT INTO marcos_inspeccion_local (
              inspeccion_local_id,
              ubicacion,
              numero,
              contenido,
              transferir,
              destino_codigo
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              nuevoId,
              caja.ubicacion,
              marco.numero,
              marco.contenido,
              Number(marco.transferir),
              marco.transferir
                ? marco.destino
                : null,
            ]
          );
        }
      }
    }
  );

  return nuevoId;
}

// ==========================================
// CONSULTAR TRANSFERENCIAS PREPARADAS
// ==========================================

export async function listarTransferenciasPreparadas() {
  const db = await obtenerBD();

  return db.getAllAsync<{
    inspeccion_local_id: number;
    origen: string;
    destino: string;
    ubicacion: string;
    numero: number;
    contenido: string;
    estado: string;
  }>(
    `SELECT
      m.inspeccion_local_id,
      i.codigo_qr AS origen,
      m.destino_codigo AS destino,
      m.ubicacion,
      m.numero,
      m.contenido,
      i.estado
     FROM marcos_inspeccion_local AS m
     JOIN inspecciones_locales AS i
       ON i.id = m.inspeccion_local_id
     WHERE m.transferir = 1
     ORDER BY
       i.id DESC,
       m.numero`
  );
}
