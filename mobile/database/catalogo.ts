
import * as SQLite from 'expo-sqlite';

import { solicitarAPI } from '../api/cliente';

import {
  tokenVigente,
} from '../api/auth';

import type {
  SesionMovil,
} from '../api/auth';

// ==========================================
// COLMENARES TRES PINOS
// CATALOGO OFICIAL DE FASTAPI
// ==========================================

export type ApiarioCatalogo = {
  id: number;
  nombre: string;
  ubicacion: string | null;
};

export type ColmenaCatalogo = {
  id: number;
  codigo: string;
  codigo_qr: string;
  apiario_id: number;
  estado: string;
  cantidad_marcos: number | null;
};

export type GrupoCatalogo = {
  id: number;
  apiario_id: number;
  nombre: string;
  colmena_ids: number[];
};

export type TratamientoCatalogo = {
  id: number;
  colmena_id: number;
  tipo_tratamiento: string;
  producto: string | null;
  dosis: string | null;
  fecha_inicio: string;
};

export type OpcionesCatalogo = {
  estado_general: string[];
  nivel: string[];
  nivel_miel: string[];
  contenido_marco: string[];
  ubicacion_marco: string[];
  estado_tratamiento: string[];
};

export type CatalogoMovil = {
  generado_en: string;

  usuario: {
    id: number;
    nombre: string;
    rol: string;
  };

  apiarios: ApiarioCatalogo[];
  colmenas: ColmenaCatalogo[];
  grupos: GrupoCatalogo[];
  tratamientos_en_curso: TratamientoCatalogo[];
  opciones: OpcionesCatalogo;
};

// ==========================================
// VALIDACIONES DE DATOS DEL SERVIDOR
// ==========================================

function esObjeto(
  valor: unknown
): valor is Record<string, unknown> {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor)
  );
}

function esId(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isSafeInteger(valor) &&
    valor > 0
  );
}

function esTexto(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0
  );
}

function esOpcionalTexto(valor: unknown): boolean {
  return valor === null || typeof valor === 'string';
}

function esListaDeTextos(valor: unknown): boolean {
  return (
    Array.isArray(valor) &&
    valor.every(esTexto)
  );
}

function validarCatalogo(
  valor: unknown,
  usuarioId: number
): asserts valor is CatalogoMovil {

  if (!esObjeto(valor)) {
    throw new Error(
      'El servidor devolvió un catálogo inválido.'
    );
  }

  const {
    generado_en,
    usuario,
    apiarios,
    colmenas,
    grupos,
    tratamientos_en_curso,
    opciones,
  } = valor;

  if (
    !esTexto(generado_en) ||
    !Number.isFinite(Date.parse(generado_en))
  ) {
    throw new Error(
      'La fecha del catálogo no es válida.'
    );
  }

  if (
    !esObjeto(usuario) ||
    !esId(usuario.id) ||
    usuario.id !== usuarioId ||
    !esTexto(usuario.nombre) ||
    !['ADMIN', 'APICULTOR'].includes(
      String(usuario.rol)
    )
  ) {
    throw new Error(
      'El catálogo no corresponde al usuario autenticado.'
    );
  }

  if (
    !Array.isArray(apiarios) ||
    !apiarios.every(
      (a: unknown) =>
        esObjeto(a) &&
        esId(a.id) &&
        esTexto(a.nombre) &&
        esOpcionalTexto(a.ubicacion)
    )
  ) {
    throw new Error(
      'El catálogo contiene apiarios inválidos.'
    );
  }

  if (
    !Array.isArray(colmenas) ||
    !colmenas.every(
      (c: unknown) =>
        esObjeto(c) &&
        esId(c.id) &&
        esTexto(c.codigo) &&
        esTexto(c.codigo_qr) &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          .test(c.codigo_qr) &&
        esId(c.apiario_id) &&
        esTexto(c.estado) &&
        (
          c.cantidad_marcos === null ||
          (
            typeof c.cantidad_marcos === 'number' &&
            Number.isSafeInteger(c.cantidad_marcos) &&
            c.cantidad_marcos >= 0
          )
        )
    )
  ) {
    throw new Error(
      'El catálogo contiene colmenas inválidas.'
    );
  }

  if (
    !Array.isArray(grupos) ||
    !grupos.every(
      (g: unknown) =>
        esObjeto(g) &&
        esId(g.id) &&
        esId(g.apiario_id) &&
        esTexto(g.nombre) &&
        Array.isArray(g.colmena_ids) &&
        g.colmena_ids.every(esId)
    )
  ) {
    throw new Error(
      'El catálogo contiene grupos inválidos.'
    );
  }

  if (
    !Array.isArray(tratamientos_en_curso) ||
    !tratamientos_en_curso.every(
      (t: unknown) =>
        esObjeto(t) &&
        esId(t.id) &&
        esId(t.colmena_id) &&
        esTexto(t.tipo_tratamiento) &&
        esOpcionalTexto(t.producto) &&
        esOpcionalTexto(t.dosis) &&
        esTexto(t.fecha_inicio) &&
        /^\d{4}-\d{2}-\d{2}$/.test(t.fecha_inicio)
    )
  ) {
    throw new Error(
      'El catálogo contiene tratamientos inválidos.'
    );
  }

  if (
    !esObjeto(opciones) ||
    !esListaDeTextos(opciones.estado_general) ||
    !esListaDeTextos(opciones.nivel) ||
    !esListaDeTextos(opciones.nivel_miel) ||
    !esListaDeTextos(opciones.contenido_marco) ||
    !esListaDeTextos(opciones.ubicacion_marco) ||
    !esListaDeTextos(opciones.estado_tratamiento)
  ) {
    throw new Error(
      'El catálogo no contiene las opciones oficiales.'
    );
  }

  const estadosOficiales = [
    'COMPLETA',
    'EN_DESARROLLO',
    'DONANTE',
    'DEBIL',
    'REQUIERE_REVISION',
  ];

  const estados = opciones.estado_general as string[];

  if (
    estados.length !== estadosOficiales.length ||
    !estadosOficiales.every(
      estado => estados.includes(estado)
    )
  ) {
    throw new Error(
      'La escala de estados no coincide con la API.'
    );
  }

  const ids = new Set<number>();
  const qr = new Set<string>();

  for (const colmena of colmenas as ColmenaCatalogo[]) {
    const codigoQR = colmena.codigo_qr.toLowerCase();

    if (
      ids.has(colmena.id) ||
      qr.has(codigoQR)
    ) {
      throw new Error(
        'El catálogo contiene colmenas o QR duplicados.'
      );
    }

    ids.add(colmena.id);
    qr.add(codigoQR);
  }
}

// ==========================================
// BASE DE DATOS SQLITE
// ==========================================

let conexion:
  Promise<SQLite.SQLiteDatabase> | null = null;

async function obtenerBD() {
  if (!conexion) {
    conexion = (async () => {

      const db = await SQLite.openDatabaseAsync(
        'colmenas.db'
      );

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS catalogos_moviles (
          usuario_id INTEGER PRIMARY KEY,
          generado_en TEXT NOT NULL,
          contenido TEXT NOT NULL,
          guardado_en TEXT NOT NULL
        );
      `);

      return db;

    })().catch(error => {
      conexion = null;
      throw error;
    });
  }

  return conexion;
}

// ==========================================
// DESCARGAR Y GUARDAR CATALOGO
// GET /movil/catalogo
// ==========================================

export async function descargarCatalogo(
  sesion: SesionMovil
): Promise<CatalogoMovil> {

  if (!tokenVigente(sesion)) {
    throw new Error(
      'La sesión ha vencido. Debes iniciar sesión nuevamente.'
    );
  }

  const respuesta = await solicitarAPI<unknown>(
    '/movil/catalogo',
    {
      method: 'GET',
      token: sesion.accessToken,
    }
  );

  validarCatalogo(
    respuesta,
    sesion.usuario.id
  );

  const db = await obtenerBD();

  // Reemplazar el catálogo únicamente
  // después de validar la descarga.
  // No eliminar inspecciones ni tratamientos.
  await db.runAsync(
    `INSERT INTO catalogos_moviles (
      usuario_id,
      generado_en,
      contenido,
      guardado_en
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(usuario_id)
    DO UPDATE SET
      generado_en = excluded.generado_en,
      contenido = excluded.contenido,
      guardado_en = excluded.guardado_en`,
    [
      sesion.usuario.id,
      respuesta.generado_en,
      JSON.stringify(respuesta),
      new Date().toISOString(),
    ]
  );

  return respuesta;
}

// ==========================================
// LEER CATALOGO SIN INTERNET
// ==========================================

export async function leerCatalogoLocal(
  usuarioId: number
): Promise<CatalogoMovil | null> {

  if (!esId(usuarioId)) {
    throw new Error('Usuario inválido.');
  }

  const db = await obtenerBD();

  const fila = await db.getFirstAsync<{
    contenido: string;
  }>(
    `SELECT contenido
     FROM catalogos_moviles
     WHERE usuario_id = ?`,
    [usuarioId]
  );

  if (!fila) {
    return null;
  }

  let datos: unknown;

  try {
    datos = JSON.parse(fila.contenido);
  } catch {
    throw new Error(
      'El catálogo local está dañado.'
    );
  }

  validarCatalogo(datos, usuarioId);

  return datos;
}
