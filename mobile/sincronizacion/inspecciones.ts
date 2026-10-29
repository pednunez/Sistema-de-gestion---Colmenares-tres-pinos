
import * as SQLite from 'expo-sqlite';

import {
  leerSesionGuardada,
  tokenVigente,
} from '../api/auth';

import {
  ErrorAPI,
  solicitarAPI,
} from '../api/cliente';

import {
  leerCatalogoLocal,
} from '../database/catalogo';

import {
  listarInspeccionesLocales,
} from '../database/inspecciones';

import type {
  InspeccionGuardada,
} from '../database/inspecciones';

// ==========================================
// COLMENARES TRES PINOS
// SINCRONIZACIÓN DE INSPECCIONES
// ==========================================

type DetalleLocal = {
  estado_general: string;
  reina_observada: number | null;
  presencia_cria: number | null;
  postura: number | null;
  nivel_poblacion: string | null;
  reservas_alimento: string | null;
  nivel_miel: string | null;
  alimentacion: string;
  signos_enfermedad: number;
  enfermedad_observada: string;
  tiras_medicamento: number | null;
  tiene_alza: number;
};

type MarcoLocal = {
  ubicacion: string;
  numero: number;
  contenido: string;
  transferir: number;
  destino_codigo: string | null;
};

type MarcoAPI = {
  ubicacion: 'CAMARA_CRIA' | 'ALZA';
  numero: number;
  contenido: string;
  transferido_a_colmena_id: number | null;
};

export type InspeccionParaAPI = {
  colmena_id: number;
  usuario_id: number;
  id_cliente: string;
  fecha_inspeccion: string;
  estado_general: string;
  reina_observada: boolean | null;
  presencia_cria: boolean | null;
  postura: boolean | null;
  nivel_poblacion: string | null;
  reservas_alimento: string | null;
  miel: string | null;
  alimentacion_suministrada: string | null;
  signos_enfermedad: boolean;
  enfermedad_observada: string | null;
  tiras_medicamento: number | null;
  tiene_alza: boolean;
  cantidad_marcos: number;
  marcos: MarcoAPI[];
  observaciones: string;
};

type RespuestaInspeccion = {
  id: number;
  id_cliente: string | null;
  colmena_id: number;
  usuario_id: number;
};

export type ResultadoSincronizacion = {
  revisadas: number;
  sincronizadas: number;
  fallidas: number;
  errores: {
    idLocal: number;
    mensaje: string;
  }[];
};

export type ResumenCola = {
  total: number;
  pendientes: number;
  sincronizadas: number;
  sinPropietario: number;
};

type Catalogo = NonNullable<
  Awaited<ReturnType<typeof leerCatalogoLocal>>
>;

const ESTADOS_VALIDOS = new Set([
  'COMPLETA',
  'EN_DESARROLLO',
  'DONANTE',
  'DEBIL',
  'REQUIERE_REVISION',
]);

const CONTENIDOS_VALIDOS = new Set([
  'MIEL_Y_CRIA',
  'SOLO_CRIA',
  'SOLO_MIEL',
  'CERA_ESTIRADA',
  'CERA_ESTAMPADA',
  'CERA_UNTADA',
  'SIN_MARCO',
]);

const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let sincronizacionActiva = false;

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

function normalizarCodigo(
  valor: string
): string {
  return valor.trim().toLowerCase();
}

function convertirBooleano(
  valor: number | null
): boolean | null {
  if (valor === null) {
    return null;
  }

  if (valor !== 0 && valor !== 1) {
    throw new Error(
      'Se encontró un valor booleano inválido en SQLite.'
    );
  }

  return valor === 1;
}

function validarFecha(
  fecha: string
): void {
  // La API exige fecha con zona horaria.
  if (
    !/(Z|[+-]\d{2}:\d{2})$/i.test(fecha) ||
    Number.isNaN(Date.parse(fecha))
  ) {
    throw new Error(
      'La fecha de la inspección no tiene zona horaria válida.'
    );
  }

  if (Date.parse(fecha) > Date.now()) {
    throw new Error(
      'La fecha de la inspección es futura.'
    );
  }
}

function validarPosiciones(
  marcos: MarcoLocal[],
  ubicacion: 'CAMARA_CRIA' | 'ALZA'
): void {
  const caja = marcos.filter(
    marco => marco.ubicacion === ubicacion
  );

  if (caja.length !== 10) {
    throw new Error(
      `${ubicacion}: se necesitan las diez posiciones.`
    );
  }

  const posiciones = new Set<number>();

  for (const marco of caja) {
    if (
      !Number.isInteger(marco.numero) ||
      marco.numero < 1 ||
      marco.numero > 10 ||
      posiciones.has(marco.numero)
    ) {
      throw new Error(
        `Posición repetida o inválida en ${ubicacion}.`
      );
    }

    posiciones.add(marco.numero);

    if (!CONTENIDOS_VALIDOS.has(marco.contenido)) {
      throw new Error(
        `Contenido inválido en ${ubicacion}, posición ${marco.numero}.`
      );
    }

    if (
      marco.transferir !== 0 &&
      marco.transferir !== 1
    ) {
      throw new Error(
        'Indicador de transferencia inválido.'
      );
    }

    if (
      marco.transferir === 1 &&
      marco.contenido === 'SIN_MARCO'
    ) {
      throw new Error(
        'No se puede transferir una posición vacía.'
      );
    }

    if (
      marco.transferir === 1 &&
      !marco.destino_codigo
    ) {
      throw new Error(
        'Hay una transferencia sin colmena de destino.'
      );
    }

    if (
      marco.transferir === 0 &&
      marco.destino_codigo
    ) {
      throw new Error(
        'Un marco sin transferencia tiene un destino guardado.'
      );
    }
  }
}

// ==========================================
// CONSULTAR LA COLA LOCAL
// NO NECESITA INTERNET NI LOGIN
// ==========================================

export async function obtenerResumenColaInspecciones():
  Promise<ResumenCola> {
  const registros =
    await listarInspeccionesLocales();

  return {
    total: registros.length,

    pendientes: registros.filter(
      registro => registro.estado === 'PENDIENTE'
    ).length,

    sincronizadas: registros.filter(
      registro => registro.estado === 'SINCRONIZADO'
    ).length,

    sinPropietario: registros.filter(
      registro => registro.usuario_local_id === null
    ).length,
  };
}

// ==========================================
// LEER DETALLE Y MARCOS
// ==========================================

async function leerDetalle(
  db: SQLite.SQLiteDatabase,
  inspeccionId: number
): Promise<{
  detalle: DetalleLocal;
  marcos: MarcoLocal[];
}> {
  const tablaDetalle =
    await db.getFirstAsync<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name = 'inspecciones_detalle_local'`
    );

  const tablaMarcos =
    await db.getFirstAsync<{ name: string }>(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name = 'marcos_inspeccion_local'`
    );

  if (!tablaDetalle || !tablaMarcos) {
    throw new Error(
      'No existen las tablas de inspecciones avanzadas.'
    );
  }

  const detalle =
    await db.getFirstAsync<DetalleLocal>(
      `SELECT
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
       FROM inspecciones_detalle_local
       WHERE inspeccion_local_id = ?`,
      [inspeccionId]
    );

  if (!detalle) {
    throw new Error(
      'La inspección no tiene detalle avanzado. Se conserva pendiente.'
    );
  }

  const marcos =
    await db.getAllAsync<MarcoLocal>(
      `SELECT
         ubicacion,
         numero,
         contenido,
         transferir,
         destino_codigo
       FROM marcos_inspeccion_local
       WHERE inspeccion_local_id = ?
       ORDER BY ubicacion, numero`,
      [inspeccionId]
    );

  return { detalle, marcos };
}

// ==========================================
// PREPARAR DATOS PARA FASTAPI
// ==========================================

async function prepararInspeccion(
  db: SQLite.SQLiteDatabase,
  inspeccion: InspeccionGuardada,
  usuarioId: number,
  catalogo: Catalogo
): Promise<InspeccionParaAPI> {
  if (inspeccion.usuario_local_id !== usuarioId) {
    throw new Error(
      'La inspección no pertenece al usuario actual.'
    );
  }

  if (!UUID_VALIDO.test(inspeccion.id_cliente)) {
    throw new Error(
      'La inspección no tiene un UUID válido.'
    );
  }

  validarFecha(inspeccion.fecha_local);

  const colmena = catalogo.colmenas.find(
    item =>
      normalizarCodigo(item.codigo_qr) ===
      normalizarCodigo(inspeccion.codigo_qr)
  );

  if (!colmena) {
    throw new Error(
      'La colmena no está en el catálogo oficial.'
    );
  }

  const { detalle, marcos } =
    await leerDetalle(db, inspeccion.id);

  if (
    !ESTADOS_VALIDOS.has(detalle.estado_general) ||
    !catalogo.opciones.estado_general.includes(
      detalle.estado_general
    )
  ) {
    throw new Error(
      'El estado general no está autorizado.'
    );
  }

  const tieneAlza = convertirBooleano(
    detalle.tiene_alza
  );

  if (tieneAlza === null) {
    throw new Error(
      'No está definida la presencia de alza.'
    );
  }

  validarPosiciones(
    marcos,
    'CAMARA_CRIA'
  );

  if (tieneAlza) {
    validarPosiciones(
      marcos,
      'ALZA'
    );
  } else if (
    marcos.some(
      marco => marco.ubicacion === 'ALZA'
    )
  ) {
    throw new Error(
      'La inspección contiene marcos de alza, pero está marcada sin alza.'
    );
  }

  const cantidadEsperada = tieneAlza ? 20 : 10;

  if (marcos.length !== cantidadEsperada) {
    throw new Error(
      'La cantidad de posiciones guardadas no coincide con las cajas.'
    );
  }

  const cantidadReal = marcos.filter(
    marco => marco.contenido !== 'SIN_MARCO'
  ).length;

  if (cantidadReal !== inspeccion.marcos_totales) {
    throw new Error(
      'La cantidad de marcos no coincide con el registro local.'
    );
  }

  const marcosAPI: MarcoAPI[] = marcos.map(
    marco => {
      if (
        marco.ubicacion !== 'CAMARA_CRIA' &&
        marco.ubicacion !== 'ALZA'
      ) {
        throw new Error(
          'Ubicación de marco inválida.'
        );
      }

      let destinoId: number | null = null;

      if (marco.transferir === 1) {
        const destino = catalogo.colmenas.find(
          item =>
            normalizarCodigo(item.codigo_qr) ===
            normalizarCodigo(
              marco.destino_codigo ?? ''
            )
        );

        if (!destino) {
          throw new Error(
            `No existe el destino del marco ${marco.numero}.`
          );
        }

        if (destino.id === colmena.id) {
          throw new Error(
            'Una colmena no puede transferirse marcos a sí misma.'
          );
        }

        destinoId = destino.id;
      }

      return {
        ubicacion: marco.ubicacion,
        numero: marco.numero,
        contenido: marco.contenido,
        transferido_a_colmena_id: destinoId,
      };
    }
  );

  const signos = convertirBooleano(
    detalle.signos_enfermedad
  );

  if (signos === null) {
    throw new Error(
      'No está definido el campo de signos de enfermedad.'
    );
  }

  return {
    colmena_id: colmena.id,
    usuario_id: usuarioId,
    id_cliente: inspeccion.id_cliente,
    fecha_inspeccion: inspeccion.fecha_local,

    estado_general: detalle.estado_general,

    reina_observada: convertirBooleano(
      detalle.reina_observada
    ),

    presencia_cria: convertirBooleano(
      detalle.presencia_cria
    ),

    postura: convertirBooleano(
      detalle.postura
    ),

    nivel_poblacion: detalle.nivel_poblacion,
    reservas_alimento: detalle.reservas_alimento,
    miel: detalle.nivel_miel,

    alimentacion_suministrada:
      detalle.alimentacion.trim() || null,

    signos_enfermedad: signos,

    enfermedad_observada:
      detalle.enfermedad_observada.trim() || null,

    tiras_medicamento:
      detalle.tiras_medicamento,

    tiene_alza: tieneAlza,
    cantidad_marcos: cantidadReal,
    marcos: marcosAPI,
    observaciones: inspeccion.observaciones,
  };
}

// ==========================================
// ENVIAR PENDIENTES A FASTAPI
// TODAVÍA NO SE LLAMA AUTOMÁTICAMENTE
// ==========================================

export async function sincronizarInspeccionesPendientes():
  Promise<ResultadoSincronizacion> {
  if (sincronizacionActiva) {
    throw new Error(
      'Ya hay una sincronización de inspecciones en curso.'
    );
  }

  sincronizacionActiva = true;

  const resultado: ResultadoSincronizacion = {
    revisadas: 0,
    sincronizadas: 0,
    fallidas: 0,
    errores: [],
  };

  try {
    const sesion = await leerSesionGuardada();

    if (!sesion || !tokenVigente(sesion)) {
      throw new Error(
        'No existe una sesión válida para sincronizar.'
      );
    }

    const catalogo = await leerCatalogoLocal(
      sesion.usuario.id
    );

    if (!catalogo) {
      throw new Error(
        'No hay un catálogo oficial para sincronizar.'
      );
    }

    // Inicializar migraciones de SQLite.
    await listarInspeccionesLocales();

    const db = await SQLite.openDatabaseAsync(
      'colmenas.db'
    );

    // Solo registros pendientes del usuario.
    // Los registros antiguos sin propietario
    // no se envían.
    const pendientes =
      await db.getAllAsync<InspeccionGuardada>(
        `SELECT *
         FROM inspecciones_locales
         WHERE estado = 'PENDIENTE'
           AND servidor_id IS NULL
           AND usuario_local_id = ?
         ORDER BY id ASC`,
        [sesion.usuario.id]
      );

    for (const inspeccion of pendientes) {
      // Volver a comprobar el vencimiento
      // durante sincronizaciones largas.
      if (!tokenVigente(sesion)) {
        resultado.errores.push({
          idLocal: inspeccion.id,
          mensaje: 'La sesión venció durante el envío.',
        });
        resultado.fallidas++;
        break;
      }

      resultado.revisadas++;

      try {
        const datos = await prepararInspeccion(
          db,
          inspeccion,
          sesion.usuario.id,
          catalogo
        );

        // El backend admite id_cliente para
        // reintentos seguros: 201 o 200.
        const respuesta =
          await solicitarAPI<RespuestaInspeccion>(
            '/inspecciones/',
            {
              method: 'POST',
              token: sesion.accessToken,
              body: datos,
            }
          );

        // No marcar éxito sin comprobar
        // que la respuesta corresponde
        // al registro enviado.
        if (
          !Number.isSafeInteger(respuesta.id) ||
          respuesta.id <= 0 ||
          !respuesta.id_cliente ||
          normalizarCodigo(respuesta.id_cliente) !==
            normalizarCodigo(inspeccion.id_cliente) ||
          respuesta.colmena_id !== datos.colmena_id ||
          respuesta.usuario_id !== sesion.usuario.id
        ) {
          throw new Error(
            'La respuesta del servidor no coincide con la inspección enviada.'
          );
        }

        const cambio = await db.runAsync(
          `UPDATE inspecciones_locales
           SET estado = 'SINCRONIZADO',
               servidor_id = ?
           WHERE id = ?
             AND id_cliente = ?
             AND usuario_local_id = ?
             AND estado = 'PENDIENTE'
             AND servidor_id IS NULL`,
          [
            respuesta.id,
            inspeccion.id,
            inspeccion.id_cliente,
            sesion.usuario.id,
          ]
        );

        if (cambio.changes !== 1) {
          throw new Error(
            'El servidor confirmó el registro, pero SQLite no pudo marcarlo como sincronizado.'
          );
        }

        resultado.sincronizadas++;
      } catch (error) {
        resultado.fallidas++;

        resultado.errores.push({
          idLocal: inspeccion.id,
          mensaje:
            error instanceof Error
              ? error.message
              : 'Error desconocido de sincronización.',
        });

        // Si falla la autorización, no
        // insistir con los demás registros.
        if (
          error instanceof ErrorAPI &&
          (
            error.estado === 401 ||
            error.estado === 403 ||
            error.estado === 409
          )
        ) {
          break;
        }

        // Otros errores dejan el registro
        // pendiente, sin borrar información.
      }
    }

    return resultado;
  } finally {
    sincronizacionActiva = false;
  }
}
