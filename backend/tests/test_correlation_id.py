"""Correlation ID por peticion y log JSON (RNF-57), sin conexiones externas."""
import asyncio
import json
import logging
import unittest
from uuid import UUID

from app.main import app
from app.core.registro import FormatoJSON, correlation_id_actual


async def request(method, path, headers=(), query=b''):
    messages = []
    scope = dict(type='http', asgi={'version':'3.0'}, http_version='1.1',
                 method=method, scheme='http', path=path, raw_path=path.encode(),
                 root_path='', query_string=query, headers=list(headers),
                 client=('127.0.0.1',1), server=('test',80))
    async def receive():
        return {'type':'http.request','body':b'','more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    start = next(m for m in messages if m['type']=='http.response.start')
    return start['status'], {k.decode().lower(): v.decode() for k,v in start['headers']}


class Captura(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lineas = []
    def emit(self, record):
        self.lineas.append(json.loads(FormatoJSON().format(record)))


class CorrelationIdTests(unittest.TestCase):
    def setUp(self):
        self.captura = Captura()
        logger = logging.getLogger('app.peticiones')
        logger.addHandler(self.captura)
        self.addCleanup(logger.removeHandler, self.captura)

    def call(self, *args, **kwargs):
        return asyncio.run(request(*args, **kwargs))

    def test_received_id_is_returned_and_logged(self):
        status, headers = self.call('GET', '/health', [(b'x-correlation-id', b'abc-123')])
        self.assertEqual(status, 200)
        self.assertEqual(headers['x-correlation-id'], 'abc-123')
        linea = self.captura.lineas[-1]
        self.assertEqual((linea['correlation_id'], linea['metodo'], linea['ruta'], linea['estado']),
                         ('abc-123', 'GET', '/health', 200))
        self.assertIn('duracion_ms', linea)

    def test_missing_or_invalid_id_is_replaced(self):
        for headers in ([], [(b'x-correlation-id', b'<script>')], [(b'x-correlation-id', b'x' * 200)]):
            with self.subTest(headers=headers):
                _, respuesta = self.call('GET', '/health', headers)
                UUID(respuesta['x-correlation-id'])

    def test_error_responses_keep_the_id(self):
        status, headers = self.call('GET', '/stock/', [(b'x-correlation-id', b'error-1')])
        self.assertEqual(status, 401)
        self.assertEqual(headers['x-correlation-id'], 'error-1')
        self.assertEqual(self.captura.lineas[-1]['estado'], 401)

    def test_query_string_is_not_logged(self):
        self.call('GET', '/health', query=b'token=secreto')
        self.assertNotIn('secreto', json.dumps(self.captura.lineas))

    def test_context_is_cleared_after_request(self):
        self.call('GET', '/health', [(b'x-correlation-id', b'temporal')])
        self.assertIsNone(correlation_id_actual.get())

    def test_cors_exposes_header_to_frontend(self):
        _, headers = self.call('GET', '/health', [(b'origin', b'http://localhost:5173')])
        self.assertIn('x-correlation-id', headers.get('access-control-expose-headers', '').lower())


if __name__ == '__main__':
    unittest.main()
