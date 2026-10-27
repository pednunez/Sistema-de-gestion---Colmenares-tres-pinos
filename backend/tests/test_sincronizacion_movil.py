"""Sincronizar sin duplicar con id_cliente (S2-T31) sobre SQLite."""
import asyncio
import json
from types import SimpleNamespace
from uuid import uuid4
import unittest
from unittest.mock import patch

from sqlalchemy import BigInteger, create_engine, event, func, select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.core.dependencies import obtener_usuario_actual
from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.inspeccion_marco import InspeccionMarco
from app.models.transferencia_marco import TransferenciaMarco
from app.models.tratamiento import Tratamiento
from app.models.usuario import Usuario


@compiles(BigInteger, 'sqlite')
def sqlite_identifier(type_, compiler, **kwargs):
    return 'INTEGER'


async def request(method, path, data=None):
    messages=[]
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method=method,scheme='http',
               path=path,raw_path=path.encode(),root_path='',query_string=b'',
               headers=[(b'content-type',b'application/json')],client=('127.0.0.1',1),server=('test',80))
    async def receive():
        return {'type':'http.request','body':json.dumps(data or {}).encode(),'more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    status=next(m['status'] for m in messages if m['type']=='http.response.start')
    return status,json.loads(b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body'))


class SincronizacionMovilTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine, 'connect')
        def sqlite_functions(connection, record):
            connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
        for model in [Usuario,Apiario,Colmena,Inspeccion,InspeccionMarco,TransferenciaMarco,Tratamiento]:
            model.__table__.create(self.engine)
        self.connection=self.engine.connect()
        self.addCleanup(self.connection.close)
        self.db=Session(bind=self.connection,expire_on_commit=False)
        self.addCleanup(self.db.close)
        previous=app.dependency_overrides.copy()
        self.addCleanup(lambda:(app.dependency_overrides.clear(),app.dependency_overrides.update(previous)))
        app.dependency_overrides[get_db]=lambda:self.db
        for uid in (1,2):
            self.db.add(Usuario(id=uid,nombre=f'U{uid}',email=f'u{uid}@example.invalid',
                                password_hash='x',rol='APICULTOR',activo=True))
        a=Apiario(nombre='A',activo=True);self.db.add(a);self.db.flush()
        self.hive=Colmena(codigo='A1',apiario_id=a.id,cantidad_marcos=10);self.db.add(self.hive)
        self.db.commit()
        self.como(1)
        self.audit_patch=patch('app.services.auditoria.registrar_auditoria')
        self.audit_patch.start();self.addCleanup(self.audit_patch.stop)

    def como(self,uid):
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=uid,rol='APICULTOR')

    def call(self,*args):
        return asyncio.run(request(*args))

    def contar(self,modelo):
        return self.db.scalar(select(func.count()).select_from(modelo))

    def test_inspection_resent_is_not_duplicated(self):
        cuerpo={'colmena_id':self.hive.id,'usuario_id':1,'estado_general':'COMPLETA','id_cliente':str(uuid4())}
        status,primera=self.call('POST','/inspecciones/',cuerpo)
        self.assertEqual(status,201,primera)
        self.assertEqual(primera['id_cliente'],cuerpo['id_cliente'])
        status,segunda=self.call('POST','/inspecciones/',cuerpo)
        self.assertEqual((status,segunda['id']),(200,primera['id']))
        self.assertEqual(self.contar(Inspeccion),1)

    def test_treatment_resent_is_not_duplicated(self):
        cuerpo={'colmena_id':self.hive.id,'usuario_id':1,'tipo_tratamiento':'Varroa',
                'fecha_inicio':'2026-10-20','id_cliente':str(uuid4())}
        status,primero=self.call('POST','/tratamientos/',cuerpo)
        self.assertEqual(status,201,primero)
        status,segundo=self.call('POST','/tratamientos/',cuerpo)
        self.assertEqual((status,segundo['id']),(200,primero['id']))
        self.assertEqual(self.contar(Tratamiento),1)

    def test_id_from_another_user_is_rejected(self):
        id_cliente=str(uuid4())
        self.call('POST','/inspecciones/',{'colmena_id':self.hive.id,'usuario_id':1,'id_cliente':id_cliente})
        self.como(2)
        self.assertEqual(self.call('POST','/inspecciones/',{'colmena_id':self.hive.id,'usuario_id':2,'id_cliente':id_cliente})[0],409)
        self.assertEqual(self.contar(Inspeccion),1)

    def test_without_id_cliente_each_post_creates_a_record(self):
        for _ in range(2):
            self.assertEqual(self.call('POST','/inspecciones/',{'colmena_id':self.hive.id,'usuario_id':1})[0],201)
        self.assertEqual(self.contar(Inspeccion),2)

    def test_invalid_id_cliente(self):
        self.assertEqual(self.call('POST','/inspecciones/',{'colmena_id':self.hive.id,'usuario_id':1,'id_cliente':'no-uuid'})[0],422)


if __name__ == '__main__':
    unittest.main()
