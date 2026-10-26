
import * as SQLite from 'expo-sqlite';

export type EstadoGeneral =
  | 'BUENO' | 'REGULAR' | 'CRITICO';

export type Nivel =
  | 'BAJO' | 'MEDIO' | 'ALTO';

export type NivelMiel =
  | 'SIN_MIEL' | 'POCA' | 'MEDIA' | 'ABUNDANTE';

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
  OPCIONES_MARCOS.map(o => o.valor)
);

export function crearCaja(): MarcoLocal[] {
  return Array.from({ length: 10 }, (_, i) => ({
    numero: i + 1,
    contenido: '',
    transferir: false,
    destino: '',
  }));
}

// CARACTERES PERMITIDOS EN TEXTOS
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
) {
  if (
    texto.length > limite ||
    limpiarObservacion(texto, limite) !== texto
  ) {
    throw new Error(
      `${nombre}: caracteres no permitidos o demasiados caracteres.`
    );
  }
}

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
      m =>
        m.contenido !== '' &&
        m.contenido !== 'SIN_MARCO'
    ).length,

    cria: activos.filter(
      m =>
        m.contenido === 'MIEL_Y_CRIA' ||
        m.contenido === 'SOLO_CRIA'
    ).length,

    miel: activos.filter(
      m =>
        m.contenido === 'MIEL_Y_CRIA' ||
        m.contenido === 'SOLO_MIEL'
    ).length,

    transferencias: activos.filter(
      m => m.transferir
    ).length,

    sinRegistrar: activos.filter(
      m => m.contenido === ''
    ).length,
  };
}

function validarCaja(
  caja: MarcoLocal[],
  nombre: string,
  origen: string,
  destinos: Set<string>
) {
  if (caja.length !== 10) {
    throw new Error(
      `${nombre}: deben existir exactamente 10 posiciones.`
    );
  }

  const numeros = new Set<number>();

  for (const m of caja) {
    if (
      !Number.isInteger(m.numero) ||
      m.numero < 1 ||
      m.numero > 10 ||
      numeros.has(m.numero)
    ) {
      throw new Error(
        `Posición inválida o repetida en ${nombre}.`
      );
    }

    numeros.add(m.numero);

    if (!m.contenido || !CONTENIDOS.has(m.contenido)) {
      throw new Error(
        `Falta registrar el marco ${m.numero} de ${nombre}.`
      );
    }

    if (typeof m.transferir !== 'boolean') {
      throw new Error('Transferencia inválida.');
    }

    if (m.transferir) {
      if (m.contenido === 'SIN_MARCO') {
        throw new Error(
          `No se puede transferir el espacio vacío ${m.numero}.`
        );
      }

      if (!m.destino) {
        throw new Error(
          `Selecciona el destino del marco ${m.numero}.`
        );
      }

      if (m.destino === origen) {
        throw new Error(
          'Una colmena no puede transferir marcos a sí misma.'
        );
      }

      if (!destinos.has(m.destino)) {
        throw new Error(
          `Destino no registrado: marco ${m.numero}.`
        );
      }
    } else if (m.destino !== '') {
      throw new Error(
        'Un marco sin transferencia no debe tener destino.'
      );
    }
  }
}

export function validarInspeccionAvanzada(
  datos: InspeccionAvanzada,
  destinosDisponibles: string[]
) {
  if (
    !/^[A-Za-z0-9_-]{3,80}$/.test(datos.codigoQR)
  ) {
    throw new Error('Código QR de colmena inválido.');
  }

  if (
    !datos.estadoGeneral ||
    !['BUENO', 'REGULAR', 'CRITICO']
      .includes(datos.estadoGeneral)
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
      throw new Error('Respuesta inválida.');
    }
  }

  for (const nivel of [
    datos.nivelPoblacion,
    datos.reservasAlimento,
  ]) {
    if (
      nivel !== null &&
      !['BAJO', 'MEDIO', 'ALTO'].includes(nivel)
    ) {
      throw new Error('Nivel inválido.');
    }
  }

  if (
    datos.nivelMiel !== null &&
    !['SIN_MIEL', 'POCA', 'MEDIA', 'ABUNDANTE']
      .includes(datos.nivelMiel)
  ) {
    throw new Error('Nivel de miel inválido.');
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
    throw new Error('Datos de inspección inválidos.');
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

  const destinos = new Set(destinosDisponibles);

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
      m =>
        m.contenido !== '' ||
        m.transferir ||
        m.destino !== ''
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

let conexion: Promise<SQLite.SQLiteDatabase> | null =
  null;

async function iniciarBD() {
  const db = await SQLite.openDatabaseAsync('colmenas.db');

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
        CHECK(ubicacion IN ('CAMARA_CRIA','ALZA')),
      numero INTEGER NOT NULL
        CHECK(numero BETWEEN 1 AND 10),
      contenido TEXT NOT NULL,
      transferir INTEGER NOT NULL DEFAULT 0,
      destino_codigo TEXT,
      UNIQUE(inspeccion_local_id, ubicacion, numero)
    );

    CREATE INDEX IF NOT EXISTS idx_marcos_inspeccion_local
    ON marcos_inspeccion_local(inspeccion_local_id);
  `);

  return db;
}

function obtenerBD() {
  if (!conexion) {
    conexion = iniciarBD().catch(e => {
      conexion = null;
      throw e;
    });
  }

  return conexion;
}

export async function listarDestinosLocales(
  origen: string
): Promise<string[]> {
  const db = await obtenerBD();

  const registros = await db.getAllAsync<{
    codigo_qr: string;
  }>(
    `SELECT DISTINCT codigo_qr
     FROM inspecciones_locales
     WHERE codigo_qr <> ?
     ORDER BY codigo_qr`,
    [origen]
  );

  return registros.map(r => r.codigo_qr);
}

export async function guardarInspeccionAvanzada(
  datos: InspeccionAvanzada
): Promise<number> {
  const db = await obtenerBD();

  const destinos =
    await listarDestinosLocales(datos.codigoQR);

  const resumen =
    validarInspeccionAvanzada(datos, destinos);

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

  let nuevoId = 0;

  await db.withExclusiveTransactionAsync(async tx => {
    // NO ACEPTAR ORÍGENES INVENTADOS
    const origen = await tx.getFirstAsync<{
      id: number;
    }>(
      `SELECT id FROM inspecciones_locales
       WHERE codigo_qr = ? LIMIT 1`,
      [datos.codigoQR]
    );

    if (!origen) {
      throw new Error(
        'Colmena de origen no registrada localmente.'
      );
    }

    // REVALIDAR DESTINOS
    for (const caja of cajas) {
      for (const m of caja.marcos) {
        if (!m.transferir) continue;

        const destino = await tx.getFirstAsync<{
          id: number;
        }>(
          `SELECT id FROM inspecciones_locales
           WHERE codigo_qr = ? LIMIT 1`,
          [m.destino]
        );

        if (
          !destino ||
          m.destino === datos.codigoQR
        ) {
          throw new Error(
            'La colmena de destino no es válida.'
          );
        }
      }
    }

    const resultado = await tx.runAsync(
      `INSERT INTO inspecciones_locales (
        codigo_qr,
        marcos_totales,
        marcos_cria,
        marcos_miel,
        reina,
        observaciones,
        fecha_local,
        estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDIENTE')`,
      [
        datos.codigoQR,
        resumen.total,
        resumen.cria,
        resumen.miel,
        reina,
        datos.observaciones.trim(),
        new Date().toISOString(),
      ]
    );

    nuevoId = resultado.lastInsertRowId;

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  });

  return nuevoId;
}

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
     ORDER BY i.id DESC, m.numero`
  );
}
