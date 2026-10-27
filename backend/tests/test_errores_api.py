"""Casos de error de los endpoints del Sprint 2 (S2-T24), sin conexiones externas.

Cada fila documenta el endpoint, el caso y la respuesta esperada. Junto con
test_access_control (401 en lecturas), test_write_permissions (401/403/404 en
escrituras) y test_stock_movimientos (403/404/409/422 de stock), cada endpoint
nuevo del Sprint 2 queda con al menos un caso de error probado.
"""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

from app.main import app
from app.database import get_db
from app.core.dependencies import obtener_usuario_actual


async def request(method, path, data=None):
    messages = []
    scope = dict(type='http', asgi={'version':'3.0'}, http_version='1.1',
                 method=method, scheme='http', path=path, raw_path=path.encode(),
                 root_path='', query_string=b'', headers=[(b'content-type',b'application/json')],
                 client=('127.0.0.1',1), server=('test',80))
    async def receive():
        return {'type':'http.request','body':json.dumps(data or {}).encode(),'more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    code=next(m['status'] for m in messages if m['type']=='http.response.start')
    body=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
    return code,json.loads(body)


AHORA = datetime.now(timezone.utc)
FUTURO = (AHORA + timedelta(days=2)).isoformat()
PASADO = (AHORA - timedelta(days=1)).isoformat()

INSPECCION = {'colmena_id': 1, 'usuario_id': 1, 'fecha_inspeccion': PASADO}
TRATAMIENTO = {'colmena_id': 1, 'usuario_id': 1, 'tipo_tratamiento': 'Varroa',
               'fecha_inicio': '2026-10-10'}
TRANSFERENCIA = {'colmena_origen_id': 1, 'colmena_destino_id': 2, 'usuario_id': 1,
                 'cantidad_marcos': 1}

INSPECCIONES = 'app.routers.inspecciones.inspeccion_service'
TRATAMIENTOS = 'app.routers.tratamientos.tratamiento_service'
TRANSFERENCIAS = 'app.routers.transferencias_marcos.transferencia_service'


def marco(numero, ubicacion='CAMARA_CRIA'):
    return {'ubicacion': ubicacion, 'numero': numero, 'contenido': 'SOLO_CRIA'}


# (endpoint, caso, metodo, ruta, cuerpo, {funcion: valor}, estado esperado)
CASOS = [
    # ---------------- Inspecciones ----------------
    ('POST /inspecciones/', 'fecha futura', 'POST', '/inspecciones/',
     {**INSPECCION, 'fecha_inspeccion': FUTURO}, {}, 422),
    ('POST /inspecciones/', 'fecha sin zona horaria', 'POST', '/inspecciones/',
     {**INSPECCION, 'fecha_inspeccion': '2026-10-01T10:00:00'}, {}, 422),
    ('POST /inspecciones/', 'tiras de medicamento fuera de 1 a 3', 'POST', '/inspecciones/',
     {**INSPECCION, 'tiras_medicamento': 4}, {}, 422),
    ('POST /inspecciones/', 'posiciones de marco duplicadas', 'POST', '/inspecciones/',
     {**INSPECCION, 'marcos': [marco(1)] * 10 + [marco(1)]}, {}, 422),
    ('POST /inspecciones/', 'estado general desconocido', 'POST', '/inspecciones/',
     {**INSPECCION, 'estado_general': 'EXCELENTE'}, {}, 422),
    ('POST /inspecciones/', 'colmena inexistente o inactiva', 'POST', '/inspecciones/',
     INSPECCION, {f'{INSPECCIONES}.obtener_colmena_activa': None}, 404),
    ('GET /inspecciones/{id}', 'inspeccion inexistente', 'GET', '/inspecciones/999', None,
     {f'{INSPECCIONES}.obtener_inspeccion': None}, 404),

    # ---------------- Tratamientos ----------------
    ('POST /tratamientos/', 'fecha_fin anterior a fecha_inicio', 'POST', '/tratamientos/',
     {**TRATAMIENTO, 'fecha_fin': '2026-10-01'}, {}, 422),
    ('POST /tratamientos/', 'tipo de tratamiento muy corto', 'POST', '/tratamientos/',
     {**TRATAMIENTO, 'tipo_tratamiento': 'V'}, {}, 422),
    ('POST /tratamientos/', 'estado desconocido', 'POST', '/tratamientos/',
     {**TRATAMIENTO, 'estado': 'PAUSADO'}, {}, 422),
    ('POST /tratamientos/', 'colmena inexistente o inactiva', 'POST', '/tratamientos/',
     TRATAMIENTO, {f'{TRATAMIENTOS}.obtener_colmena_activa': None}, 404),
    ('GET /tratamientos/{id}', 'tratamiento inexistente', 'GET', '/tratamientos/999', None,
     {f'{TRATAMIENTOS}.obtener_tratamiento': None}, 404),

    # ---------------- Transferencias de marcos ----------------
    ('POST /transferencias-marcos/', 'origen igual a destino', 'POST', '/transferencias-marcos/',
     {**TRANSFERENCIA, 'colmena_destino_id': 1}, {}, 422),
    ('POST /transferencias-marcos/', 'cantidad cero', 'POST', '/transferencias-marcos/',
     {**TRANSFERENCIA, 'cantidad_marcos': 0}, {}, 422),
    ('POST /transferencias-marcos/', 'transferir una posicion SIN_MARCO', 'POST', '/transferencias-marcos/',
     {**TRANSFERENCIA, 'ubicacion': 'CAMARA_CRIA', 'numero_marco': 1, 'contenido': 'SIN_MARCO'}, {}, 422),
    ('POST /transferencias-marcos/', 'colmena de origen inexistente', 'POST', '/transferencias-marcos/',
     TRANSFERENCIA, {f'{TRANSFERENCIAS}.obtener_colmena_activa': None}, 404),
    ('GET /transferencias-marcos/{id}', 'transferencia inexistente', 'GET', '/transferencias-marcos/999', None,
     {f'{TRANSFERENCIAS}.obtener_transferencia': None}, 404),

    # ---------------- Historial ----------------
    ('GET /historial/colmenas/{id}', 'colmena inexistente', 'GET', '/historial/colmenas/999', None,
     {'app.routers.historial.colmena_service.obtener_colmena': None}, 404),
]


class ErroresApiTests(unittest.TestCase):
    def setUp(self):
        previous = app.dependency_overrides.copy()
        self.addCleanup(lambda: (app.dependency_overrides.clear(), app.dependency_overrides.update(previous)))
        self.db = MagicMock()
        app.dependency_overrides[get_db] = lambda: self.db
        self.rol('ADMIN')

    def rol(self, rol):
        app.dependency_overrides[obtener_usuario_actual] = lambda: SimpleNamespace(id=1, rol=rol)

    def call(self, method, path, data=None):
        return asyncio.run(request(method, path, data))

    def test_casos_de_error(self):
        for endpoint, caso, method, path, body, patches, esperado in CASOS:
            with self.subTest(endpoint=endpoint, caso=caso):
                activos = [patch(nombre, return_value=valor) for nombre, valor in patches.items()]
                for p in activos:
                    p.start()
                try:
                    status, respuesta = self.call(method, path, body)
                finally:
                    for p in activos:
                        p.stop()
                self.assertEqual(status, esperado, respuesta)
                self.assertIn('detail', respuesta)

    def test_validation_errors_do_not_touch_the_database(self):
        for endpoint, caso, method, path, body, patches, esperado in CASOS:
            if esperado == 422:
                with self.subTest(endpoint=endpoint, caso=caso):
                    self.db.reset_mock()
                    self.call(method, path, body)
                    self.assertFalse(self.db.method_calls)

    def test_transfer_more_frames_than_available(self):
        origen = SimpleNamespace(id=1, apiario_id=1, cantidad_marcos=2, activo=True)
        destino = SimpleNamespace(id=2, apiario_id=1, cantidad_marcos=8, activo=True)
        with patch(f'{TRANSFERENCIAS}.obtener_colmena_activa', side_effect=[origen, destino]):
            status, respuesta = self.call('POST', '/transferencias-marcos/', {**TRANSFERENCIA, 'cantidad_marcos': 5})
        self.assertEqual(status, 400, respuesta)

    def test_resending_an_inspection_transfer_returns_the_existing_one(self):
        existente = SimpleNamespace(id=7, colmena_origen_id=1, colmena_destino_id=2, usuario_id=1,
                                    cantidad_marcos=1, tipo_marco='CRIA', inspeccion_id=5,
                                    ubicacion='CAMARA_CRIA', numero_marco=3, contenido='SOLO_CRIA',
                                    motivo=None, observaciones=None,
                                    fecha_transferencia=AHORA, fecha_creacion=AHORA)
        reenvio = {**TRANSFERENCIA, 'inspeccion_id': 5, 'ubicacion': 'CAMARA_CRIA',
                   'numero_marco': 3, 'contenido': 'SOLO_CRIA'}
        with patch(f'{TRANSFERENCIAS}.obtener_transferencia_de_inspeccion', return_value=existente),              patch(f'{TRANSFERENCIAS}.crear_transferencia') as crear:
            status, respuesta = self.call('POST', '/transferencias-marcos/', reenvio)
            self.assertEqual((status, respuesta['id']), (200, 7))
            otro_destino = self.call('POST', '/transferencias-marcos/', {**reenvio, 'colmena_destino_id': 9})
            self.assertEqual(otro_destino[0], 400)
            crear.assert_not_called()
        with patch(f'{TRANSFERENCIAS}.obtener_transferencia_de_inspeccion', return_value=None):
            self.assertEqual(self.call('POST', '/transferencias-marcos/', reenvio)[0], 400)

    def test_audit_is_admin_only(self):
        self.rol('APICULTOR')
        self.assertEqual(self.call('GET', '/auditoria/')[0], 403)


if __name__ == '__main__':
    unittest.main()
