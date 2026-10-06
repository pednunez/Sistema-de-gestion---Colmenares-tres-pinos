"""RF-03: pruebas HTTP con usuarios aislados.

Desde backend: python -B -m unittest discover -s tests -v
RF03_POSTGRES=1 usa una tabla TEMPORARY, sin modificar public.usuarios.
RF03_LIVE_MAIL=1 habilita un unico correo a RF03_MAIL_RECIPIENT.
Las pruebas normales usan SQLite en memoria y SMTP simulado.
"""
import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import secrets
import smtplib
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool, StaticPool

from app.main import app
from app.database import engine as configured_engine, get_db
from app.models.usuario import Usuario
from app.models.auditoria import Auditoria
from sqlalchemy.ext.compiler import compiles
from sqlalchemy import BigInteger
from sqlalchemy.dialects.postgresql import JSONB

@compiles(BigInteger, "sqlite")
def sqlite_bigint(element, compiler, **kw):
    return "INTEGER"

@compiles(JSONB, "sqlite")
def sqlite_json(element, compiler, **kw):
    return "JSON"

from app.core.security import generar_hash_password, verificar_password
from app.services import auth, correo


async def http_request(path, data=None, token=None):
    messages = []
    body = json.dumps(data).encode() if data is not None else b''
    headers = [(b'content-type', b'application/json')]
    if token:
        headers.append((b'cookie', token.encode()))
    scope = dict(type='http', asgi={'version': '3.0'}, http_version='1.1',
                 method='POST' if data is not None else 'GET', scheme='http',
                 path=path, raw_path=path.encode(), query_string=b'', root_path='',
                 headers=headers, client=('127.0.0.1', 1234), server=('test', 80))

    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    status = next(m['status'] for m in messages if m['type'] == 'http.response.start')
    payload = b''.join(m.get('body', b'') for m in messages if m['type'] == 'http.response.body')
    result = json.loads(payload)
    if path == '/auth/login' and status == 200:
        start = next(m for m in messages if m['type'] == 'http.response.start')
        result['_test_cookie'] = next(v.decode().split(';')[0] for k, v in start['headers'] if k == b'set-cookie')
    return status, result


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        if os.getenv('RF03_POSTGRES') == '1':
            self.engine = create_engine(configured_engine.url, poolclass=NullPool)
            self.connection = self.engine.connect()
            self.connection.execute(text(
                'CREATE TEMPORARY TABLE usuarios (LIKE public.usuarios INCLUDING ALL) ON COMMIT PRESERVE ROWS'))
            self.connection.execute(text('ALTER TABLE pg_temp.usuarios ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 0'))
            self.connection.execute(text('CREATE TEMPORARY TABLE auditoria (LIKE public.auditoria INCLUDING ALL) ON COMMIT PRESERVE ROWS'))
            self.connection.execute(text('ALTER TABLE pg_temp.auditoria ADD FOREIGN KEY (usuario_id) REFERENCES pg_temp.usuarios(id)'))
            self.connection.commit()
            self.assertTrue(self.connection.execute(text(
                "SELECT 'usuarios'::regclass::oid = 'pg_temp.usuarios'::regclass::oid")).scalar())
            self.assertTrue(self.connection.execute(text(
                "SELECT 'auditoria'::regclass::oid = 'pg_temp.auditoria'::regclass::oid")).scalar())
            self.connection.commit()
        else:
            self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
            Usuario.__table__.create(self.engine)
            Auditoria.__table__.create(self.engine)
            self.connection = self.engine.connect()
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.connection.close)
        self.db = Session(bind=self.connection, expire_on_commit=False)
        self.addCleanup(self.db.close)
        self.previous_overrides = app.dependency_overrides.copy()
        app.dependency_overrides[get_db] = lambda: self.db
        self.addCleanup(self.restore_overrides)
        self.old_password = secrets.token_urlsafe(24)
        self.new_password = secrets.token_urlsafe(24)
        test_id = None if os.getenv('RF03_POSTGRES') == '1' else 900001
        self.user = Usuario(id=test_id, nombre='Prueba RF03 temporal',
                            email='rf03@example.invalid', rol='APICULTOR', activo=True,
                            password_hash=generar_hash_password(self.old_password))
        self.db.add(self.user)
        self.db.commit()
        self.mail_patch = patch('app.routers.auth.correo_service.enviar_correo_recuperacion', return_value=True)
        self.mail = self.mail_patch.start()
        self.addCleanup(self.mail_patch.stop)

    def restore_overrides(self):
        app.dependency_overrides.clear()
        app.dependency_overrides.update(self.previous_overrides)

    def call(self, path, data=None, token=None):
        return asyncio.run(http_request(path, data, token))

    def request_reset(self, email=None):
        return self.call('/auth/recuperar-password', {'email': email or self.user.email})

    def issue(self):
        status, response = self.request_reset()
        self.assertEqual(status, 200)
        self.mail.assert_called_once()
        token = self.mail.call_args.kwargs['token']
        self.assertNotIn(token, json.dumps(response))
        return token

    def reset(self, token, password=None):
        value = password or self.new_password
        return self.call('/auth/restablecer-password',
                         {'token': token, 'nueva_password': value, 'confirmar_password': value})

    def login(self, password):
        return self.call('/auth/login', {'email': self.user.email, 'password': password})

    def test_hash_and_fifteen_minute_expiry(self):
        token = self.issue()
        self.db.refresh(self.user)
        self.assertEqual(self.user.password_reset_token_hash, hashlib.sha256(token.encode()).hexdigest())
        self.assertNotEqual(self.user.password_reset_token_hash, token)
        self.assertEqual((self.user.password_reset_expira_en - self.user.password_reset_solicitado_en).total_seconds(), 900)
        self.assertGreaterEqual(len(token), 40)

    def test_complete_flow_login_and_single_use(self):
        token = self.issue()
        self.assertEqual(self.reset(token)[0], 200)
        self.db.refresh(self.user)
        self.assertTrue(verificar_password(self.new_password, self.user.password_hash))
        self.assertTrue(self.user.password_hash.startswith('$argon2'))
        self.assertIsNone(self.user.password_reset_token_hash)
        self.assertIsNone(self.user.password_reset_expira_en)
        self.assertEqual(self.login(self.old_password)[0], 401)
        status, login = self.login(self.new_password)
        self.assertEqual(status, 200)
        self.assertEqual(self.call('/auth/me', token=login['_test_cookie'])[0], 200)
        self.assertEqual(self.reset(token)[0], 400)

    def test_generic_response_unknown_inactive_and_cooldown(self):
        expected = self.request_reset()
        self.assertEqual(self.request_reset(), expected)
        self.assertEqual(self.request_reset('missing@example.invalid'), expected)
        self.user.activo = False
        self.db.commit()
        self.assertEqual(self.request_reset(), expected)
        self.assertEqual(self.mail.call_count, 1)

    def test_cooldown_preserves_existing_token(self):
        token = self.issue()
        self.request_reset()
        self.db.refresh(self.user)
        self.assertEqual(self.mail.call_count, 1)
        self.assertEqual(self.user.password_reset_token_hash, auth.generar_hash_token(token))

    def test_reissue_invalidates_previous_token(self):
        previous = self.issue()
        self.user.password_reset_solicitado_en = datetime.now(timezone.utc) - timedelta(seconds=61)
        self.db.commit()
        self.request_reset()
        current = self.mail.call_args.kwargs['token']
        self.assertNotEqual(previous, current)
        self.assertEqual(self.reset(previous)[0], 400)
        self.assertEqual(self.reset(current)[0], 200)

    def test_expired_and_unknown_tokens_do_not_change_password(self):
        token = self.issue()
        self.user.password_reset_expira_en = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.db.commit()
        self.assertEqual(self.reset(token)[0], 400)
        self.assertEqual(self.reset(secrets.token_urlsafe(32))[0], 400)
        self.assertEqual(self.login(self.old_password)[0], 200)

    def test_expiration_boundary_is_rejected(self):
        token = self.issue()
        now = datetime.now(timezone.utc)
        self.user.password_reset_expira_en = now
        self.db.commit()
        with patch('app.services.auth.datetime') as clock:
            clock.now.return_value = now
            self.assertEqual(self.reset(token)[0], 400)

    def test_inactive_user_cannot_reset(self):
        token = self.issue()
        self.user.activo = False
        self.db.commit()
        self.assertEqual(self.reset(token)[0], 400)

    def test_invalid_passwords_do_not_consume_token(self):
        token = self.issue()
        for password, confirmation in [('short', 'short'), ('a' * 129, 'a' * 129),
                                       (self.new_password, self.old_password)]:
            status, _ = self.call('/auth/restablecer-password',
                                  {'token': token, 'nueva_password': password,
                                   'confirmar_password': confirmation})
            self.assertEqual(status, 422)
        self.assertEqual(self.reset(token)[0], 200)

    def test_email_is_normalized(self):
        self.assertEqual(self.request_reset('  RF03@EXAMPLE.INVALID  ')[0], 200)
        self.assertEqual(self.mail.call_args.kwargs['destinatario'], self.user.email)

    def test_smtp_failure_keeps_generic_response(self):
        expected = self.request_reset('missing@example.invalid')
        self.mail.side_effect = smtplib.SMTPAuthenticationError(535, b'test-only')
        with patch('app.routers.auth.logger.exception') as log:
            self.assertEqual(self.request_reset(), expected)
            log.assert_called_once()

    def test_missing_smtp_keeps_generic_response(self):
        expected = self.request_reset('missing@example.invalid')
        self.mail.return_value = False
        with patch('app.routers.auth.logger.warning'):
            self.assertEqual(self.request_reset(), expected)

    def test_failed_commit_rolls_back(self):
        with patch.object(self.db, 'commit', side_effect=RuntimeError('test-only')):
            with self.assertRaises(RuntimeError):
                auth.crear_token_recuperacion(self.db, self.user.email)
        self.db.refresh(self.user)
        self.assertIsNone(self.user.password_reset_token_hash)

    @unittest.skipUnless(os.getenv('RF03_LIVE_MAIL') == '1', 'Real SMTP requires explicit opt-in')
    def test_live_recovery_email_and_reset(self):
        self.assertEqual(os.getenv('RF03_POSTGRES'), '1')
        recipient = os.environ['RF03_MAIL_RECIPIENT']
        self.assertEqual(recipient, 'jose.ramirezeb@gmail.com')
        self.user.email = recipient
        self.db.commit()
        self.mail_patch.stop()
        with patch('app.routers.auth.correo_service.enviar_correo_recuperacion',
                   wraps=correo.enviar_correo_recuperacion) as send:
            with patch('app.routers.auth.logger.exception') as error:
                self.assertEqual(self.request_reset()[0], 200)
                error.assert_not_called()
            send.assert_called_once()
            token = send.call_args.kwargs['token']
        self.assertEqual(self.reset(token)[0], 200)
        self.assertEqual(self.login(self.new_password)[0], 200)
        self.assertEqual(self.login(self.old_password)[0], 401)
        self.assertEqual(self.reset(token)[0], 400)


class MailTests(unittest.TestCase):
    def setUp(self):
        self.config = correo.EmailSettings(_env_file=None, SMTP_HOST='smtp.example.invalid',
            SMTP_PORT=465, SMTP_USER='test@example.invalid', SMTP_PASSWORD='test-only',
            SMTP_FROM_EMAIL='test@example.invalid', SMTP_USE_SSL=True, SMTP_USE_TLS=False)

    def test_ssl_message_and_url_encoding(self):
        with patch.object(correo, 'settings', self.config), patch.object(correo.smtplib, 'SMTP_SSL') as smtp:
            self.assertTrue(correo.enviar_correo_recuperacion('recipient@example.invalid', 'a+b /?'))
            server = smtp.return_value.__enter__.return_value
            server.login.assert_called_once_with(self.config.SMTP_USER, self.config.SMTP_PASSWORD)
            message = server.send_message.call_args.args[0]
            self.assertEqual(message['To'], 'recipient@example.invalid')
            self.assertIn('?token=a%2Bb%20%2F%3F', message.get_content())

    def test_starttls_before_login(self):
        self.config.SMTP_USE_SSL = False
        self.config.SMTP_USE_TLS = True
        self.config.SMTP_PORT = 587
        with patch.object(correo, 'settings', self.config), patch.object(correo.smtplib, 'SMTP') as smtp:
            self.assertTrue(correo.enviar_correo_recuperacion('recipient@example.invalid', 'test-token'))
            names = [call[0] for call in smtp.return_value.__enter__.return_value.method_calls]
            self.assertEqual(names, ['ehlo', 'starttls', 'ehlo', 'login', 'send_message'])

    def test_unconfigured_does_not_connect(self):
        self.config.SMTP_PASSWORD = None
        with patch.object(correo, 'settings', self.config), patch.object(correo.smtplib, 'SMTP_SSL') as smtp:
            self.assertFalse(correo.enviar_correo_recuperacion('recipient@example.invalid', 'test-token'))
            smtp.assert_not_called()


if __name__ == '__main__':
    unittest.main()
