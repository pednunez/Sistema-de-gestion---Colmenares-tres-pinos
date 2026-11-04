
"""Pruebas S3-T05: retiro de marcos a bodega."""

import asyncio
import json
import unittest

from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    create_engine,
    event,
    func,
    select,
)
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.core.dependencies import obtener_usuario_actual

from app.models.usuario import Usuario
from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.inspeccion_marco import InspeccionMarco
from app.models.inventario_stock import InventarioStock
from app.models.inventario_movimiento import InventarioMovimiento


@compiles(BigInteger, "sqlite")
def sqlite_big_integer(type_, compiler, **kwargs):
    return "INTEGER"


async def request(method, path, data):
    messages = []

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "root_path": "",
        "query_string": b"",
        "headers": [
            (b"content-type", b"application/json")
        ],
        "client": ("127.0.0.1", 1),
        "server": ("test", 80),
    }

    async def receive():
        return {
            "type": "http.request",
            "body": json.dumps(data).encode(),
            "more_body": False,
        }

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)

    status = next(
        item["status"]
        for item in messages
        if item["type"] == "http.response.start"
    )

    body = b"".join(
        item.get("body", b"")
        for item in messages
        if item["type"] == "http.response.body"
    )

    return status, json.loads(body)


class RetiroMarcosBodegaTests(unittest.TestCase):

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(self.engine.dispose)

        @event.listens_for(self.engine, "connect")
        def sqlite_functions(connection, record):
            connection.create_function(
                "gen_random_uuid",
                0,
                lambda: uuid4().hex,
            )
            connection.create_function(
                "pg_advisory_xact_lock",
                2,
                lambda espacio, recurso: None,
            )

        for model in [
            Usuario,
            Apiario,
            Colmena,
            Inspeccion,
            InspeccionMarco,
            InventarioStock,
            InventarioMovimiento,
        ]:
            model.__table__.create(self.engine)

        self.connection = self.engine.connect()
        self.addCleanup(self.connection.close)

        self.db = Session(
            bind=self.connection,
            expire_on_commit=False,
        )
        self.addCleanup(self.db.close)

        anteriores = app.dependency_overrides.copy()

        def restaurar():
            app.dependency_overrides.clear()
            app.dependency_overrides.update(anteriores)

        self.addCleanup(restaurar)

        app.dependency_overrides[get_db] = (
            lambda: self.db
        )

        app.dependency_overrides[
            obtener_usuario_actual
        ] = lambda: SimpleNamespace(
            id=1,
            rol="APICULTOR",
        )

        self.audit_patch = patch(
            "app.services.auditoria.registrar_auditoria"
        )
        self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)

        usuario = Usuario(
            id=1,
            nombre="Usuario prueba",
            email="retiro@example.invalid",
            password_hash="x",
            rol="APICULTOR",
            activo=True,
        )
        apiario = Apiario(
            nombre="Apiario prueba",
            activo=True,
        )

        self.db.add_all([usuario, apiario])
        self.db.flush()

        self.colmena = Colmena(
            codigo="RET-01",
            apiario_id=apiario.id,
            cantidad_marcos=10,
        )
        self.db.add(self.colmena)
        self.db.commit()

    def call(self, method, path, body):
        return asyncio.run(request(method, path, body))

    def cuerpo(self, contenido, retirar=True):
        marcos = [
            {
                "ubicacion": "CAMARA_CRIA",
                "numero": 1,
                "contenido": contenido,
                "retirar_a_bodega": retirar,
            }
        ]

        for numero in range(2, 11):
            marcos.append({
                "ubicacion": "CAMARA_CRIA",
                "numero": numero,
                "contenido": "SIN_MARCO",
            })

        return {
            "colmena_id": self.colmena.id,
            "usuario_id": 1,
            "estado_general": "COMPLETA",
            "cantidad_marcos": 1,
            "tiene_alza": False,
            "marcos": marcos,
            "id_cliente": str(uuid4()),
        }

    def movimientos(self):
        return self.db.scalar(
            select(func.count()).select_from(
                InventarioMovimiento
            )
        )

    def stock(self, material):
        return self.db.scalar(
            select(InventarioStock).where(
                InventarioStock.material == material,
                InventarioStock.ubicacion == "BODEGA",
            )
        )

    def test_retiro_cera_estirada(self):
        status, respuesta = self.call(
            "POST",
            "/inspecciones/",
            self.cuerpo("CERA_ESTIRADA"),
        )

        self.assertEqual(status, 201, respuesta)

        self.assertEqual(
            self.stock("MARCO_CERA_ESTIRADA").cantidad,
            1,
        )
        self.assertEqual(self.movimientos(), 1)

        self.db.refresh(self.colmena)
        self.assertEqual(self.colmena.cantidad_marcos, 0)

        marco = self.db.scalar(
            select(InspeccionMarco)
        )
        self.assertTrue(marco.retirar_a_bodega)

    def test_retiro_miel(self):
        status, respuesta = self.call(
            "POST",
            "/inspecciones/",
            self.cuerpo("SOLO_MIEL"),
        )

        self.assertEqual(status, 201, respuesta)

        self.assertEqual(
            self.stock("MARCO_MIEL").cantidad,
            1,
        )
        self.assertEqual(self.movimientos(), 1)

    def test_sincronizacion_no_duplica_retiro(self):
        datos = self.cuerpo("CERA_ESTAMPADA")

        status1, primera = self.call(
            "POST", "/inspecciones/", datos
        )
        status2, segunda = self.call(
            "POST", "/inspecciones/", datos
        )

        self.assertEqual(status1, 201, primera)
        self.assertEqual(status2, 200, segunda)
        self.assertEqual(primera["id"], segunda["id"])

        self.assertEqual(
            self.stock("MARCO_CERA_ESTAMPADA").cantidad,
            1,
        )
        self.assertEqual(self.movimientos(), 1)

    def test_no_permite_retirar_cria(self):
        status, _ = self.call(
            "POST",
            "/inspecciones/",
            self.cuerpo("SOLO_CRIA"),
        )

        self.assertEqual(status, 422)
        self.assertEqual(self.movimientos(), 0)


if __name__ == "__main__":
    unittest.main()
