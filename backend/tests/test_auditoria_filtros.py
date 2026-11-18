import asyncio
from datetime import datetime, timezone
import json
import unittest
from urllib.parse import urlsplit

from app.main import app
from app.models.auditoria import Auditoria
import test_password_recovery as recovery
from test_cookie_sessions import call


async def descargar(url, cookie=None, origin=None, bearer=None):
    partes = urlsplit(url)
    mensajes = []
    headers = []
    for nombre, valor in [("cookie", cookie), ("origin", origin),
                          ("authorization", f"Bearer {bearer}" if bearer else None)]:
        if valor:
            headers.append((nombre.encode(), valor.encode()))
    scope = dict(type="http", asgi={"version": "3.0"}, http_version="1.1", method="GET",
                 scheme="https", path=partes.path, raw_path=partes.path.encode(),
                 query_string=partes.query.encode(), root_path="", headers=headers,
                 client=("127.0.0.1", 1), server=("test", 443))
    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}
    async def send(message):
        mensajes.append(message)
    await app(scope, receive, send)
    inicio = next(m for m in mensajes if m["type"] == "http.response.start")
    return inicio["status"], b"".join(m.get("body", b"") for m in mensajes), {
        k.decode(): v.decode() for k, v in inicio["headers"]}


class AuditoriaFiltrosTests(unittest.TestCase):
    setUp = recovery.RecoveryTests.setUp
    restore_overrides = recovery.RecoveryTests.restore_overrides

    def login(self, rol="ADMIN"):
        self.user.rol = rol
        self.db.commit()
        status, _, headers = asyncio.run(call("/auth/login", {
            "email": self.user.email, "password": self.old_password}))
        self.assertEqual(status, 200)
        return next(v.split(";")[0] for k, v in headers if k == "set-cookie")

    def get(self, query="", cookie=None):
        status, body, headers = asyncio.run(descargar("/auditoria/" + query, cookie))
        return status, json.loads(body), headers

    def sembrar(self, fechas):
        for id_, fecha in enumerate(fechas, 100):
            self.db.add(Auditoria(id=id_, usuario_id=self.user.id, entidad="COLMENA",
                                  accion="MODIFICAR", fecha=datetime.fromisoformat(fecha)))
        self.db.commit()

    def test_filtros_combinados_total_orden_y_paginacion(self):
        cookie = self.login()
        self.sembrar(["2026-11-17T02:59:59+00:00", "2026-11-17T03:00:00+00:00",
                      "2026-11-18T02:59:59.999999+00:00", "2026-11-18T03:00:00+00:00"])
        query = f"?entidad=colmena&accion=MODIFICAR&usuario_id={self.user.id}&desde=2026-11-17&hasta=2026-11-17"
        status, rows, headers = self.get(query, cookie)
        self.assertEqual(status, 200)
        self.assertEqual([r["id"] for r in rows], [102, 101])
        self.assertEqual(headers["x-total-count"], "2")
        self.assertEqual(self.get(query + "&offset=1&limit=1", cookie)[1][0]["id"], 101)
        self.assertEqual(self.get(query + "&offset=5", cookie)[1], [])
        self.assertEqual(self.get("?entidad=NO_EXISTE", cookie)[2]["x-total-count"], "0")
        self.assertEqual(self.get("?accion=CREAR&entidad=COLMENA", cookie)[1], [])
        self.assertEqual(self.get("?usuario_id=123", cookie)[1], [])

    def test_limites_horario_invierno_y_desempate(self):
        cookie = self.login()
        self.sembrar(["2026-07-10T03:59:59+00:00", "2026-07-10T04:00:00+00:00",
                      "2026-07-10T04:00:00+00:00", "2026-07-11T04:00:00+00:00"])
        rows = self.get("?entidad=COLMENA&desde=2026-07-10&hasta=2026-07-10", cookie)[1]
        self.assertEqual([r["id"] for r in rows], [102, 101])

    def test_validacion_y_roles(self):
        self.assertEqual(self.get()[0], 401)
        apicultor = self.login("APICULTOR")
        self.assertEqual(self.get("?limit=1", apicultor)[0], 403)
        cookie = self.login()
        for query in ["offset=-1", "limit=0", "limit=501", "usuario_id=0", "desde=no",
                      "desde=2026-11-18&hasta=2026-11-17", "hasta=9999-12-31", "entidad="]:
            with self.subTest(query=query):
                self.assertEqual(self.get("?" + query, cookie)[0], 422)
        self.assertEqual(self.get(cookie=cookie)[0], 200)
