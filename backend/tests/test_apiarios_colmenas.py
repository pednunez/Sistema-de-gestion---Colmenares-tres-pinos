"""Pruebas de inventario aisladas. INVENTARIO_POSTGRES=1 usa tablas temporales."""
import asyncio
import json
import os
from types import SimpleNamespace
from urllib.parse import urlsplit
from uuid import uuid4
import unittest
from unittest.mock import patch

from sqlalchemy import BigInteger, create_engine, event, select, text
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool, StaticPool

from app.main import app
from app.database import engine as configured_engine, get_db
from app.core.dependencies import obtener_usuario_actual
from app.models.apiario import Apiario
from app.models.colmena import Colmena


@compiles(BigInteger, 'sqlite')
def sqlite_identifier(type_, compiler, **kwargs):
    return 'INTEGER'


async def request(method, url, data=None):
    parts=urlsplit(url)
    messages=[]
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method=method,
               scheme='http',path=parts.path,raw_path=parts.path.encode(),root_path='',
               query_string=parts.query.encode(),headers=[(b'content-type',b'application/json')],
               client=('127.0.0.1',1),server=('test',80))
    async def receive():
        return {'type':'http.request','body':json.dumps(data or {}).encode(),'more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    status=next(m['status'] for m in messages if m['type']=='http.response.start')
    payload=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
    return status,json.loads(payload)


class InventoryTests(unittest.TestCase):
    def setUp(self):
        if os.getenv('INVENTARIO_POSTGRES') == '1':
            self.engine=create_engine(configured_engine.url,poolclass=NullPool,hide_parameters=True)
            self.addCleanup(self.engine.dispose)
            self.connection=self.engine.connect()
            self.addCleanup(self.connection.close)
            for name in ['apiarios','colmenas']:
                # Nombres constantes del test; no se usa entrada del usuario.
                self.connection.execute(text(
                    f'CREATE TEMPORARY TABLE {name} (LIKE public.{name} INCLUDING ALL) ON COMMIT PRESERVE ROWS'))
                self.assertTrue(self.connection.execute(text(
                    f"SELECT '{name}'::regclass::oid = 'pg_temp.{name}'::regclass::oid")).scalar())
            self.connection.commit()
        else:
            self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
            self.addCleanup(self.engine.dispose)
            @event.listens_for(self.engine, 'connect')
            def sqlite_functions(connection, record):
                connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
                connection.execute('PRAGMA foreign_keys=ON')
            Apiario.__table__.create(self.engine)
            Colmena.__table__.create(self.engine)
            self.connection=self.engine.connect()
            self.addCleanup(self.connection.close)
        self.db=Session(bind=self.connection,expire_on_commit=False)
        self.addCleanup(self.db.close)
        previous=app.dependency_overrides.copy()
        self.addCleanup(self.restore,previous)
        app.dependency_overrides[get_db]=lambda:self.db
        self.set_role('ADMIN')
        self.a=Apiario(nombre='Prueba A',activo=True)
        self.b=Apiario(nombre='Prueba B',activo=True)
        self.inactive=Apiario(nombre='Prueba inactivo',activo=False)
        self.db.add_all([self.a,self.b,self.inactive]);self.db.flush()
        self.hives=[]
        for code,apiary,active in [('A1',self.a,True),('B1',self.b,True),('A2',self.a,True),('A3',self.a,True),('BAJA',self.a,False)]:
            hive=Colmena(codigo=code,apiario_id=apiary.id,activo=active,cantidad_marcos=10)
            self.db.add(hive);self.hives.append(hive)
        self.db.commit()
        self.audit_patch=patch('app.services.auditoria.registrar_auditoria')
        self.audit=self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)

    def restore(self,previous):
        app.dependency_overrides.clear();app.dependency_overrides.update(previous)

    def set_role(self,role):
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=1,rol=role)

    def call(self,method,url,data=None):
        return asyncio.run(request(method,url,data))

    def codes(self,url):
        status,body=self.call('GET',url)
        self.assertEqual(status,200)
        self.assertIsInstance(body,list)
        return [row['codigo'] for row in body]

    def test_default_list_preserves_contract_and_excludes_inactive(self):
        self.assertEqual(self.codes('/colmenas/'),['A1','B1','A2','A3'])

    def test_filter_by_apiary_and_paginate_in_stable_order(self):
        url=f'/colmenas/?apiario_id={self.a.id}'
        self.assertEqual(self.codes(url),['A1','A2','A3'])
        self.assertEqual(self.codes(url+'&offset=1&limit=1'),['A2'])
        self.assertEqual(self.codes(url+'&offset=2&limit=2'),['A3'])
        self.assertEqual(self.codes(url+'&offset=9&limit=2'),[])

    def test_unknown_apiary_has_empty_list(self):
        self.assertEqual(self.codes('/colmenas/?apiario_id=999999999'),[])

    def test_invalid_pagination_parameters(self):
        for query in ['limit=0','limit=501','limit=-1','offset=-1','apiario_id=0','apiario_id=-2','limit=abc']:
            with self.subTest(query=query):
                self.assertEqual(self.call('GET','/colmenas/?'+query)[0],422)

    def test_apicultor_can_filter_but_cannot_delete(self):
        self.set_role('APICULTOR')
        self.assertEqual(self.codes(f'/colmenas/?apiario_id={self.b.id}&limit=1'),['B1'])
        self.assertEqual(self.call('DELETE',f'/apiarios/{self.a.id}')[0],403)
        self.db.refresh(self.a);self.assertTrue(self.a.activo)

    def test_anonymous_filter_rejected(self):
        del app.dependency_overrides[obtener_usuario_actual]
        self.assertEqual(self.call('GET','/colmenas/?limit=1')[0],401)

    def test_apiary_with_active_hives_cannot_be_deactivated(self):
        status,body=self.call('DELETE',f'/apiarios/{self.a.id}')
        self.assertEqual(status,409)
        self.assertIn('colmenas activas',body['detail'])
        self.db.refresh(self.a)
        self.assertTrue(self.a.activo);self.assertIsNone(self.a.fecha_eliminacion)
        self.assertEqual(len(self.db.scalars(select(Colmena)).all()),5)
        self.audit.assert_not_called()

    def test_operationally_inactive_hive_still_blocks_apiary_deactivation(self):
        self.hives[1].estado='INACTIVA';self.db.commit()
        self.assertEqual(self.call('DELETE',f'/apiarios/{self.b.id}')[0],409)

    def test_apiary_with_only_soft_deleted_hives_can_be_deactivated(self):
        self.hives[1].activo=False;self.db.commit()
        self.assertEqual(self.call('DELETE',f'/apiarios/{self.b.id}')[0],200)
        self.db.refresh(self.b)
        self.assertFalse(self.b.activo);self.assertIsNotNone(self.b.fecha_eliminacion)
        self.assertIsNotNone(self.db.get(Colmena,self.hives[1].id))
        self.audit.assert_called_once()

    def test_empty_apiary_can_be_deactivated(self):
        empty=Apiario(nombre='Prueba vacio',activo=True)
        self.db.add(empty);self.db.commit()
        self.assertEqual(self.call('DELETE',f'/apiarios/{empty.id}')[0],200)
        self.assertEqual(self.call('DELETE',f'/apiarios/{empty.id}')[0],404)

    def test_create_update_and_soft_delete_hive(self):
        status,created=self.call('POST','/colmenas/',{'apiario_id':self.a.id,'codigo':'NUEVA','cantidad_marcos':6})
        self.assertEqual(status,201)
        path=f'/colmenas/{created["id"]}'
        status,updated=self.call('PATCH',path,{'apiario_id':self.b.id,'codigo':'EDITADA','cantidad_marcos':8})
        self.assertEqual(status,200);self.assertEqual(updated['apiario_id'],self.b.id)
        self.assertEqual(updated['cantidad_marcos'],8)
        self.assertEqual(self.call('DELETE',path)[0],200)
        self.assertEqual(self.call('GET',path)[0],404)
        saved=self.db.get(Colmena,created['id'])
        self.db.refresh(saved)
        self.assertFalse(saved.activo);self.assertEqual(saved.estado,'BAJA')
        self.assertEqual(self.audit.call_count,3)

    def test_duplicate_active_and_deleted_codes_return_409(self):
        for code in ['A1','BAJA']:
            with self.subTest(code=code):
                self.assertEqual(self.call('POST','/colmenas/',{'apiario_id':self.a.id,'codigo':code})[0],409)
                self.assertEqual(self.call('PATCH',f'/colmenas/{self.hives[1].id}',{'codigo':code})[0],409)
        self.audit.assert_not_called()

    def test_unchanged_code_is_allowed(self):
        self.assertEqual(self.call('PATCH',f'/colmenas/{self.hives[0].id}',{'codigo':'A1'})[0],200)

    def test_inactive_and_missing_apiary_rejected_on_create_and_move(self):
        for apiary_id in [self.inactive.id,999999999]:
            with self.subTest(apiary_id=apiary_id):
                self.assertEqual(self.call('POST','/colmenas/',{'apiario_id':apiary_id,'codigo':'INVALIDA'})[0],422)
                self.assertEqual(self.call('PATCH',f'/colmenas/{self.hives[0].id}',{'apiario_id':apiary_id})[0],422)
        self.db.refresh(self.hives[0]);self.assertEqual(self.hives[0].apiario_id,self.a.id)
        self.audit.assert_not_called()

    def test_required_patch_fields_cannot_be_null(self):
        for field in ['apiario_id','codigo','estado','cantidad_marcos']:
            with self.subTest(field=field):
                self.assertEqual(self.call('PATCH',f'/colmenas/{self.hives[0].id}',{field:None})[0],422)
        self.assertEqual(self.call('PATCH',f'/colmenas/{self.hives[0].id}',{'observaciones':None})[0],200)

    def test_missing_hive_returns_404(self):
        for method in ['GET','PATCH','DELETE']:
            self.assertEqual(self.call(method,'/colmenas/999999999')[0],404)


if __name__=='__main__':
    unittest.main()
