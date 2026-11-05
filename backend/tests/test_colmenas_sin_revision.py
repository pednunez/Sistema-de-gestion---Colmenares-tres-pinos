"""Colmenas sin revision en el periodo (RF-45 / S2-T22) sobre SQLite."""
import asyncio
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4
import unittest

from sqlalchemy import BigInteger, create_engine, event
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.core.dependencies import obtener_usuario_actual
from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion


@compiles(BigInteger, 'sqlite')
def sqlite_identifier(type_, compiler, **kwargs):
    return 'INTEGER'


async def request(method, url):
    path, _, query = url.partition('?')
    messages=[]
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method=method,
               scheme='http',path=path,raw_path=path.encode(),root_path='',
               query_string=query.encode(),headers=[],client=('127.0.0.1',1),server=('test',80))
    async def receive():
        return {'type':'http.request','body':b'','more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    status=next(m['status'] for m in messages if m['type']=='http.response.start')
    payload=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
    return status,json.loads(payload)


class ColmenasSinRevisionTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine, 'connect')
        def sqlite_functions(connection, record):
            connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
        for model in [Apiario,Colmena,Inspeccion]:
            model.__table__.create(self.engine)
        self.connection=self.engine.connect()
        self.addCleanup(self.connection.close)
        self.db=Session(bind=self.connection,expire_on_commit=False)
        self.addCleanup(self.db.close)
        previous=app.dependency_overrides.copy()
        self.addCleanup(lambda:(app.dependency_overrides.clear(),app.dependency_overrides.update(previous)))
        app.dependency_overrides[get_db]=lambda:self.db
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=1,rol='APICULTOR')
        self.a=Apiario(nombre='A',activo=True);self.b=Apiario(nombre='B',activo=True)
        self.db.add_all([self.a,self.b]);self.db.flush()
        hoy=datetime.now(timezone.utc)
        self.hives={}
        for code,apiary,estado,activo in [('RECIENTE',self.a,'ACTIVA',True),('ANTIGUA',self.a,'ACTIVA',True),
                                          ('NUNCA',self.a,'EN_OBSERVACION',True),('OTRO',self.b,'ACTIVA',True),
                                          ('INACTIVA',self.a,'INACTIVA',True),('BORRADA',self.a,'ACTIVA',False)]:
            hive=Colmena(codigo=code,apiario_id=apiary.id,estado=estado,activo=activo,cantidad_marcos=10)
            self.db.add(hive);self.hives[code]=hive
        self.db.flush()
        for code,dias,activo in [('RECIENTE',3,True),('ANTIGUA',45,True),('ANTIGUA',5,False),
                                 ('OTRO',60,True),('INACTIVA',90,True),('BORRADA',90,True)]:
            self.db.add(Inspeccion(colmena_id=self.hives[code].id,usuario_id=1,
                                   fecha_inspeccion=hoy-timedelta(days=dias),activo=activo))
        self.db.commit()

    def call(self,url):
        return asyncio.run(request('GET',url))

    def test_lists_never_reviewed_first_then_oldest(self):
        status,body=self.call('/colmenas/sin-revision')
        self.assertEqual(status,200,body)
        self.assertEqual([c['codigo'] for c in body],['NUNCA','OTRO','ANTIGUA'])
        self.assertIsNone(body[0]['ultima_inspeccion'])
        self.assertIsNone(body[0]['dias_sin_revision'])
        self.assertEqual(body[2]['dias_sin_revision'],45)

    def test_deleted_inspections_do_not_count_as_review(self):
        codigos=[c['codigo'] for c in self.call('/colmenas/sin-revision?dias=10')[1]]
        self.assertIn('ANTIGUA',codigos)
        self.assertNotIn('RECIENTE',codigos)

    def test_period_and_apiary_filters(self):
        self.assertEqual([c['codigo'] for c in self.call('/colmenas/sin-revision?dias=50')[1]],['NUNCA','OTRO'])
        self.assertEqual([c['codigo'] for c in self.call(f'/colmenas/sin-revision?apiario_id={self.b.id}')[1]],['OTRO'])
        self.assertEqual([c['codigo'] for c in self.call('/colmenas/sin-revision?dias=1')[1]],
                         ['NUNCA','OTRO','ANTIGUA','RECIENTE'])

    def test_invalid_period(self):
        for query in ['dias=0','dias=366','dias=abc','apiario_id=0']:
            with self.subTest(query=query):
                self.assertEqual(self.call('/colmenas/sin-revision?'+query)[0],422)

    def test_requires_session(self):
        app.dependency_overrides.pop(obtener_usuario_actual)
        self.assertEqual(self.call('/colmenas/sin-revision')[0],401)


if __name__ == '__main__':
    unittest.main()
