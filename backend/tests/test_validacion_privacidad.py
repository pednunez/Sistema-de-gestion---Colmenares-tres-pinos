import asyncio
import json
import unittest

from test_cookie_sessions import call


class ValidacionPrivacidadTests(unittest.TestCase):
    def test_errores_no_devuelven_password_ni_tokens(self):
        casos = [
            ("/auth/login", {"email": "prueba@example.invalid", "password": "secreto"}),
            ("/auth/token", {"email": "prueba@example.invalid", "password": "secreto"}),
            ("/auth/restablecer-password", {"token": "token-sensible", "nueva_password": "clave1",
                                           "confirmar_password": "clave2"}),
        ]
        for ruta, cuerpo in casos:
            with self.subTest(ruta=ruta):
                status, respuesta, _ = asyncio.run(call(ruta, cuerpo))
                self.assertEqual(status, 422)
                serializada = json.dumps(respuesta)
                for valor in cuerpo.values():
                    self.assertNotIn(valor, serializada)
                self.assertTrue(all(set(e) == {"loc", "msg", "type"} for e in respuesta["detail"]))
