// S1-T11 / RNF-56: X-Correlation-ID en cada petición y registro de errores.
import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { api, establecerSesion, alExpirarSesion } from '../src/services/api.js';
import { erroresRegistrados, registrarError, codigoCorto } from '../src/services/registroErrores.js';

const fetchOriginal = globalThis.fetch;
const consolaOriginal = { error: console.error, warn: console.warn };
let llamadas;

function responder(...respuestas) {
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
}
const ultimoRegistro = () => erroresRegistrados().at(-1);

beforeEach(() => {
  llamadas = [];
  console.error = () => {};
  console.warn = () => {};
  establecerSesion(false);
  alExpirarSesion(null);
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  console.error = consolaOriginal.error;
  console.warn = consolaOriginal.warn;
  establecerSesion(false);
});

test('cada petición envía un X-Correlation-ID distinto', async () => {
  establecerSesion(true, 'csrf');
  responder({ body: [] }, { body: {} });
  await api.get('/apiarios/');
  await api.post('/apiarios/', { nombre: 'Test' });
  const ids = llamadas.map((l) => l.opciones.headers['X-Correlation-ID']);
  ids.forEach((id) => assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
  assert.notEqual(ids[0], ids[1]);
});

test('un error 500 queda registrado con el mismo ID enviado y el usuario recibe el código', async () => {
  establecerSesion(true, 'csrf');
  responder({ status: 500, body: { detail: 'Internal Server Error' } });
  await assert.rejects(api.get('/colmenas/'), (error) => {
    const enviado = llamadas[0].opciones.headers['X-Correlation-ID'];
    assert.equal(error.correlationId, enviado);
    assert.match(error.message, new RegExp(`Código de seguimiento: ${codigoCorto(enviado)}`));
    const registro = ultimoRegistro();
    assert.equal(registro.correlationId, enviado);
    assert.equal(registro.tipo, 'API');
    assert.equal(registro.nivel, 'error');
    assert.equal(registro.estado, 500);
    assert.equal(registro.metodo, 'GET');
    assert.equal(registro.endpoint, '/colmenas/');
    return true;
  });
});

test('una falla de conexión se registra con estado 0', async () => {
  responder(new TypeError('fetch failed'));
  await assert.rejects(api.get('/apiarios/'), (error) => {
    assert.equal(error.estado, 0);
    assert.equal(ultimoRegistro().estado, 0);
    assert.equal(ultimoRegistro().correlationId, error.correlationId);
    return true;
  });
});

test('un error de validación se registra como aviso', async () => {
  establecerSesion(true, 'csrf');
  responder({ status: 409, body: { detail: 'Ya existe una colmena con ese código' } });
  await assert.rejects(api.post('/colmenas/', { codigo: 'COL-001' }));
  assert.equal(ultimoRegistro().nivel, 'aviso');
  assert.equal(ultimoRegistro().estado, 409);
});

test('un 401 sin sesión (abrir la app sin ingresar) no se registra', async () => {
  const antes = erroresRegistrados().length;
  responder({ status: 401, body: { detail: 'Sesion invalida o expirada' } });
  await assert.rejects(api.get('/auth/me'));
  assert.equal(erroresRegistrados().length, antes);
});

test('el registro no guarda parámetros de la URL ni el cuerpo de la petición', async () => {
  const registro = registrarError({ tipo: 'API', mensaje: 'x', endpoint: '/restablecer-password?token=secreto' });
  assert.equal(registro.endpoint, '/restablecer-password');
  establecerSesion(true, 'csrf');
  responder({ status: 500, body: {} });
  await assert.rejects(api.post('/auth/restablecer-password', { token: 'secreto', nueva_password: 'Clave12345' }));
  assert.doesNotMatch(JSON.stringify(erroresRegistrados()), /secreto|Clave12345|csrf/);
});
