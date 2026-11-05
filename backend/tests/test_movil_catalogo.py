"""Catalogo para la app movil (S2-T31) sobre SQLite."""
import asyncio
import json
from datetime import date
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
from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion
from app.models.tratamiento import Tratamiento


@compiles(BigInteger, 'sqlite')
def sqlite_identifier(type_, compiler, **kwargs):
    return 'INTEGER'


async def request(path):
    messages=[]
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method='GET',scheme='http',
               path=path,raw_path=path.encode(),root_path='',query_string=b'',headers=[],
               client=('127.0.0.1',1),server=('test',80))
    async def receive():
        return {'type':'http.request','body':b'','more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    status=next(m['status'] for m in messages if m['type']=='http.response.start')
    return status,json.loads(b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body'))


class CatalogoMovilTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine, 'connect')
        def sqlite_functions(connection, record):
            connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
        for model in [Apiario,Colmena,GrupoColmena,GrupoColmenaAsignacion,Tratamiento]:
            model.__table__.create(self.engine)
        self.connection=self.engine.connect()
        self.addCleanup(self.connection.close)
        self.db=Session(bind=self.connection,expire_on_commit=False)
        self.addCleanup(self.db.close)
        previous=app.dependency_overrides.copy()
        self.addCleanup(lambda:(app.dependency_overrides.clear(),app.dependency_overrides.update(previous)))
        app.dependency_overrides[get_db]=lambda:self.db
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=1,nombre='Yarek',rol='APICULTOR')
        a=Apiario(nombre='Mandinga',activo=True);off=Apiario(nombre='Cerrado',activo=False)
        self.db.add_all([a,off]);self.db.flush()
        self.h={}
        for code,activo in [('B2',True),('A1',True),('BORRADA',False)]:
            self.h[code]=Colmena(codigo=code,apiario_id=a.id,activo=activo,cantidad_marcos=10)
        self.db.add_all(self.h.values());self.db.flush()
        g=GrupoColmena(apiario_id=a.id,nombre='Fila 1');viejo=GrupoColmena(apiario_id=a.id,nombre='Vieja',activo=False)
        self.db.add_all([g,viejo]);self.db.flush()
        for code in ['B2','A1','BORRADA']:
            self.db.add(GrupoColmenaAsignacion(grupo_id=g.id,colmena_id=self.h[code].id,usuario_id=1))
        for estado in ['EN_CURSO','FINALIZADO']:
            self.db.add(Tratamiento(colmena_id=self.h['A1'].id,usuario_id=1,tipo_tratamiento='Varroa',
                                    fecha_inicio=date(2026,10,1),estado=estado))
        self.db.commit()

    def test_catalog_contents(self):
        status,body=asyncio.run(request('/movil/catalogo'))
        self.assertEqual(status,200,body)
        self.assertEqual(body['usuario'],{'id':1,'nombre':'Yarek','rol':'APICULTOR'})
        self.assertEqual([a['nombre'] for a in body['apiarios']],['Mandinga'])
        self.assertEqual([c['codigo'] for c in body['colmenas']],['A1','B2'])
        self.assertEqual(body['colmenas'][0]['codigo_qr'],str(self.h['A1'].codigo_qr))
        self.assertEqual([(g['nombre'],g['colmena_ids']) for g in body['grupos']],
                         [('Fila 1',[self.h['A1'].id,self.h['B2'].id])])
        self.assertEqual([t['colmena_id'] for t in body['tratamientos_en_curso']],[self.h['A1'].id])
        self.assertEqual(body['opciones']['estado_general'],
                         ['COMPLETA','EN_DESARROLLO','DONANTE','DEBIL','REQUIERE_REVISION'])
        self.assertIn('SIN_MARCO',body['opciones']['contenido_marco'])
        self.assertIn('generado_en',body)

    def test_requires_session(self):
        app.dependency_overrides.pop(obtener_usuario_actual)
        self.assertEqual(asyncio.run(request('/movil/catalogo'))[0],401)


if __name__ == '__main__':
    unittest.main()
