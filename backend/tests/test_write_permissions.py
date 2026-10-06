"""Permisos de escritura y estado de la API, sin conexiones externas."""
import asyncio
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch, MagicMock

from fastapi import HTTPException
from app.main import app
from app.database import get_db
from app.core.dependencies import obtener_usuario_actual, verificar_autor_o_admin


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


class ReachedMutation(Exception):
    pass


class WritePermissionsTests(unittest.TestCase):
    def setUp(self):
        previous=app.dependency_overrides.copy()
        self.addCleanup(self.restore,previous)
        self.db=MagicMock()
        app.dependency_overrides[get_db]=lambda:self.db

    def restore(self,previous):
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)

    def role(self,role,identifier=10):
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=identifier,rol=role)

    def call(self,method,path,data=None):
        return asyncio.run(request(method,path,data))

    def test_anonymous_cannot_write(self):
        for resource in ['apiarios','colmenas','inspecciones','tratamientos']:
            for method,path in [('POST',f'/{resource}/'),('PATCH',f'/{resource}/1'),('DELETE',f'/{resource}/1')]:
                with self.subTest(method=method,path=path):
                    self.assertEqual(self.call(method,path)[0],401)
        self.assertFalse(self.db.mock_calls)

    def test_apicultor_cannot_write_apiarios_or_colmenas(self):
        self.role('APICULTOR')
        for resource in ['apiarios','colmenas']:
            for method,path in [('POST',f'/{resource}/'),('PATCH',f'/{resource}/1'),('DELETE',f'/{resource}/1')]:
                with self.subTest(method=method,path=path):
                    self.assertEqual(self.call(method,path)[0],403)
        self.assertFalse(self.db.mock_calls)

    def test_admin_reaches_apiario_and_colmena_creation(self):
        self.role('ADMIN')
        with patch('app.routers.apiarios.apiario_service.crear_apiario',side_effect=ReachedMutation):
            with self.assertRaises(ReachedMutation):
                self.call('POST','/apiarios/',{'nombre':'Prueba'})
        with patch('app.routers.colmenas.colmena_service.obtener_apiario_activo',return_value=object()), \
             patch('app.routers.colmenas.colmena_service.obtener_colmena_por_codigo',return_value=None), \
             patch('app.routers.colmenas.colmena_service.crear_colmena',side_effect=ReachedMutation):
            with self.assertRaises(ReachedMutation):
                self.call('POST','/colmenas/',{'apiario_id':1,'codigo':'PRUEBA'})

    def test_other_apicultor_cannot_change_inspections_or_treatments(self):
        self.role('APICULTOR',10)
        for resource,singular in [('inspecciones','inspeccion'),('tratamientos','tratamiento')]:
            prefix=f'app.routers.{resource}.{singular}_service'
            with patch(f'{prefix}.obtener_{singular}',return_value=SimpleNamespace(id=1,usuario_id=20)), \
                 patch(f'{prefix}.actualizar_{singular}') as update, \
                 patch(f'{prefix}.{"cancelar" if singular == "tratamiento" else "eliminar"}_{singular}') as delete:
                self.assertEqual(self.call('PATCH',f'/{resource}/1')[0],403)
                self.assertEqual(self.call('DELETE',f'/{resource}/1')[0],403)
                update.assert_not_called();delete.assert_not_called()

    def test_owner_and_admin_reach_modification(self):
        for role,identifier in [('APICULTOR',20),('ADMIN',10)]:
            self.role(role,identifier)
            for resource,singular in [('inspecciones','inspeccion'),('tratamientos','tratamiento')]:
                prefix=f'app.routers.{resource}.{singular}_service'
                item=SimpleNamespace(id=1,usuario_id=20,colmena_id=1,inspeccion_id=None)
                with patch(f'{prefix}.obtener_{singular}',return_value=item), \
                     patch(f'app.routers.{resource}.{singular}_a_dict',return_value={}), \
                     patch(f'{prefix}.actualizar_{singular}',side_effect=ReachedMutation), \
                     patch(f'{prefix}.{"cancelar" if singular == "tratamiento" else "eliminar"}_{singular}',side_effect=ReachedMutation):
                    for method in ['PATCH','DELETE']:
                        with self.subTest(role=role,method=method,resource=resource):
                            with self.assertRaises(ReachedMutation):
                                self.call(method,f'/{resource}/1')

    def test_nonexistent_record_returns_404(self):
        self.role('APICULTOR')
        for resource,singular in [('inspecciones','inspeccion'),('tratamientos','tratamiento')]:
            with patch(f'app.routers.{resource}.{singular}_service.obtener_{singular}',return_value=None):
                self.assertEqual(self.call('PATCH',f'/{resource}/1')[0],404)
                self.assertEqual(self.call('DELETE',f'/{resource}/1')[0],404)

    def test_health_and_openapi(self):
        self.assertEqual(self.call('GET','/health'),(200,{'status':'ok'}))
        self.assertIn('/health',app.openapi()['paths'])
        self.assertFalse(self.db.mock_calls)


if __name__=='__main__':
    unittest.main()
