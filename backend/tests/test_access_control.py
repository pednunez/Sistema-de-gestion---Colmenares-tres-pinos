"""Pruebas de acceso HTTP sin PostgreSQL ni servicios externos.

Ejecutar desde backend: python -m unittest discover -s tests -v
"""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import jwt

# Configuracion exclusiva del proceso de pruebas; nunca utiliza credenciales reales.
os.environ.update(DB_USER='test', DB_PASSWORD='test', DB_HOST='localhost',
                  DB_PORT='5432', DB_NAME='test', JWT_SECRET_KEY='test-key-' * 8,
                  JWT_ALGORITHM='HS256')

from app.main import app
from app.database import engine, get_db, settings
from app.models.usuario import Usuario


class FakeSession:
    def __init__(self):
        self.user = SimpleNamespace(id=1, nombre='Test', email='test@example.invalid',
                                    rol='APICULTOR', activo=True, version_sesion=0)
        self.queries = 0

    def scalar(self, query):
        self.queries += 1
        if query.column_descriptions[0]['entity'] is Usuario:
            return self.user if self.user.activo else None
        return None

    def scalars(self, query):
        self.queries += 1
        return SimpleNamespace(all=lambda: [])


async def request(path, token=None, method='GET', body=b''):
    messages = []
    headers = [(b'content-type', b'application/json')]
    if token:
        headers.append((b'authorization', ('Bearer ' + token).encode()))
    scope = dict(type='http', asgi={'version': '3.0'}, http_version='1.1',
                 method=method, scheme='http', path=path, raw_path=path.encode(),
                 query_string=b'', root_path='', headers=headers,
                 client=('127.0.0.1', 1234), server=('test', 80))

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    return next(m['status'] for m in messages if m['type'] == 'http.response.start')


class AccessControlTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeSession()
        app.dependency_overrides[get_db] = lambda: self.db
        self.addCleanup(app.dependency_overrides.clear)
        self.connection = patch.object(engine, 'connect', side_effect=AssertionError('Real DB forbidden'))
        self.connection.start()
        self.addCleanup(self.connection.stop)
        prefixes = ('/apiarios', '/colmenas', '/inspecciones', '/tratamientos',
                    '/transferencias', '/historial')
        self.paths = []
        for path, methods in app.openapi()['paths'].items():
            if path.startswith(prefixes) and 'get' in methods:
                import re
                path = path.replace('{codigo_qr}', '00000000-0000-0000-0000-000000000001')
                self.paths.append(re.sub(r'\{[^}]+\}', '1', path))
        self.assertEqual(len(self.paths), 13)

    def token(self, expired=False):
        return jwt.encode({'sub': '1', 'rol': 'ADMIN', 'ver': 0,
                           'exp': datetime.now(timezone.utc) + timedelta(minutes=-1 if expired else 5)},
                          settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def status(self, path, token=None, **kwargs):
        return asyncio.run(request(path, token, **kwargs))

    def test_anonymous_rejected_before_query(self):
        for path in self.paths + ['/database', '/usuarios/', '/auditoria/']:
            with self.subTest(path=path):
                self.assertEqual(self.status(path), 401)
        self.assertEqual(self.db.queries, 0)

    def test_invalid_and_expired_tokens(self):
        for token in ['invalid', self.token(expired=True)]:
            for path in self.paths + ['/database']:
                with self.subTest(path=path):
                    self.assertEqual(self.status(path, token), 401)
        self.assertEqual(self.db.queries, 0)

    def test_inactive_user_rejected(self):
        self.db.user.activo = False
        for path in self.paths + ['/database']:
            with self.subTest(path=path):
                self.assertEqual(self.status(path, self.token()), 401)

    def test_both_roles_can_read_operational_routes(self):
        for role in ['ADMIN', 'APICULTOR']:
            self.db.user.rol = role
            for path in self.paths:
                with self.subTest(role=role, path=path):
                    expected = 200 if path.endswith('/') else 404
                    self.assertEqual(self.status(path, self.token()), expected)

    def test_database_is_admin_only_using_current_db_role(self):
        with patch('app.main.probar_conexion', return_value='test') as probe:
            self.assertEqual(self.status('/database', self.token()), 403)
            probe.assert_not_called()
            self.db.user.rol = 'ADMIN'
            self.assertEqual(self.status('/database', self.token()), 200)
            probe.assert_called_once_with()

    def test_existing_admin_restrictions(self):
        for path in ['/usuarios/', '/auditoria/']:
            self.db.user.rol = 'APICULTOR'
            self.assertEqual(self.status(path, self.token()), 403)
            self.db.user.rol = 'ADMIN'
            self.assertEqual(self.status(path, self.token()), 200)

    def test_public_routes_remain_public(self):
        self.assertEqual(self.status('/'), 200)
        for path in ['/auth/login', '/auth/recuperar-password', '/auth/restablecer-password']:
            with self.subTest(path=path):
                self.assertEqual(self.status(path, method='POST', body=b'{}'), 422)


if __name__ == '__main__':
    unittest.main()
