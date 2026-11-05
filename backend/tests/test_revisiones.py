"""Sesiones de revision por grupo (D-07 / S2-T16) sobre SQLite."""
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
from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion
from app.models.inspeccion import Inspeccion
from app.models.inspeccion_marco import InspeccionMarco
from app.models.revision import SesionRevision, SesionRevisionColmena
from app.models.transferencia_marco import TransferenciaMarco
from app.models.usuario import Usuario


@compiles(BigInteger, 'sqlite')
def sqlite_identifier(type_, compiler, **kwargs):
    return 'INTEGER'


async def request(method, url, data=None):
    path, _, query = url.partition('?')
    messages=[]
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method=method,scheme='http',
               path=path,raw_path=path.encode(),root_path='',query_string=query.encode(),
               headers=[(b'content-type',b'application/json')],client=('127.0.0.1',1),server=('test',80))
    async def receive():
        return {'type':'http.request','body':json.dumps(data or {}).encode(),'more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    status=next(m['status'] for m in messages if m['type']=='http.response.start')
    return status,json.loads(b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body'))


class RevisionesTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine, 'connect')
        def sqlite_functions(connection, record):
            connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
        for model in [Usuario,Apiario,Colmena,GrupoColmena,GrupoColmenaAsignacion,Inspeccion,
                      InspeccionMarco,TransferenciaMarco,SesionRevision,SesionRevisionColmena]:
            model.__table__.create(self.engine)
        self.connection=self.engine.connect()
        self.addCleanup(self.connection.close)
        self.db=Session(bind=self.connection,expire_on_commit=False)
        self.addCleanup(self.db.close)
        previous=app.dependency_overrides.copy()
        self.addCleanup(lambda:(app.dependency_overrides.clear(),app.dependency_overrides.update(previous)))
        app.dependency_overrides[get_db]=lambda:self.db
        for uid,rol in [(1,'APICULTOR'),(2,'APICULTOR'),(3,'ADMIN')]:
            self.db.add(Usuario(id=uid,nombre=f'U{uid}',email=f'u{uid}@example.invalid',
                                password_hash='x',rol=rol,activo=True))
        a=Apiario(nombre='A',activo=True);self.db.add(a);self.db.flush()
        self.h={}
        for code,estado in [('A3','ACTIVA'),('A1','ACTIVA'),('A2','EN_OBSERVACION'),('ABAJA','BAJA'),('FUERA','ACTIVA')]:
            self.h[code]=Colmena(codigo=code,apiario_id=a.id,estado=estado,cantidad_marcos=10)
        self.db.add_all(self.h.values());self.db.flush()
        self.grupo=GrupoColmena(apiario_id=a.id,nombre='Fila 1');self.vacio=GrupoColmena(apiario_id=a.id,nombre='Vacia')
        self.db.add_all([self.grupo,self.vacio]);self.db.flush()
        for code in ['A3','A1','A2','ABAJA']:
            self.db.add(GrupoColmenaAsignacion(grupo_id=self.grupo.id,colmena_id=self.h[code].id,usuario_id=3))
        self.db.commit()
        self.como(1)
        self.audit_patch=patch('app.services.auditoria.registrar_auditoria')
        self.audit_patch.start();self.addCleanup(self.audit_patch.stop)

    def como(self,uid,rol='APICULTOR'):
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=uid,rol=rol)

    def call(self,*args):
        return asyncio.run(request(*args))

    def iniciar(self,**extra):
        status,body=self.call('POST','/revisiones/',{'grupo_id':self.grupo.id,**extra})
        self.assertIn(status,(200,201),body)
        return body

    def inspeccionar(self,sesion,code,estado='COMPLETA'):
        return self.call('POST','/inspecciones/',{'colmena_id':self.h[code].id,'usuario_id':1,
                                                  'estado_general':estado,'sesion_revision_id':sesion['id']})

    def test_start_fixes_operational_hives_in_code_order(self):
        sesion=self.iniciar()
        self.assertEqual([c['codigo'] for c in sesion['colmenas']],['A1','A2','A3'])
        self.assertEqual([c['orden'] for c in sesion['colmenas']],[1,2,3])
        self.assertEqual((sesion['estado'],sesion['grupo_nombre'],sesion['usuario_id']),('EN_CURSO','Fila 1',1))
        self.assertEqual(sesion['progreso'],{'total':3,'revisadas':0,'omitidas':0,'pendientes':3})
        self.assertEqual(sesion['siguiente_colmena_id'],self.h['A1'].id)

    def test_one_session_in_progress_per_group(self):
        self.iniciar()
        self.assertEqual(self.call('POST','/revisiones/',{'grupo_id':self.grupo.id})[0],409)

    def test_save_and_next_marks_hive_and_summarizes(self):
        sesion=self.iniciar()
        status,inspeccion=self.inspeccionar(sesion,'A1','COMPLETA')
        self.assertEqual(status,201,inspeccion)
        detalle=self.call('GET',f"/revisiones/{sesion['id']}")[1]
        a1=detalle['colmenas'][0]
        self.assertEqual((a1['estado'],a1['inspeccion_id'],a1['estado_general']),('REVISADA',inspeccion['id'],'COMPLETA'))
        self.assertEqual(detalle['siguiente_colmena_id'],self.h['A2'].id)
        self.inspeccionar(sesion,'A2','DEBIL')
        detalle=self.call('GET',f"/revisiones/{sesion['id']}")[1]
        self.assertEqual(detalle['resumen_estados'],{'COMPLETA':1,'DEBIL':1})
        self.assertEqual(detalle['progreso']['revisadas'],2)

    def test_inspection_rules_inside_a_session(self):
        sesion=self.iniciar()
        self.inspeccionar(sesion,'A1')
        self.assertEqual(self.inspeccionar(sesion,'A1')[0],409)
        self.assertEqual(self.inspeccionar(sesion,'FUERA')[0],422)
        self.assertEqual(self.call('POST','/inspecciones/',{'colmena_id':self.h['A1'].id,'usuario_id':1,'sesion_revision_id':999})[0],404)
        self.como(2)
        self.assertEqual(self.inspeccionar(sesion,'A2')[0],403)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(Inspeccion)),1)

    def test_skip_is_voluntary_and_can_be_revisited(self):
        sesion=self.iniciar()
        status,detalle=self.call('POST',f"/revisiones/{sesion['id']}/omitir",{'colmena_id':self.h['A1'].id,'motivo':' Abejas agresivas '})
        self.assertEqual(status,200,detalle)
        a1=detalle['colmenas'][0]
        self.assertEqual((a1['estado'],a1['motivo_omision']),('OMITIDA','Abejas agresivas'))
        self.assertEqual(detalle['siguiente_colmena_id'],self.h['A2'].id)
        self.assertEqual(self.inspeccionar(sesion,'A1')[0],201)
        a1=self.call('GET',f"/revisiones/{sesion['id']}")[1]['colmenas'][0]
        self.assertEqual((a1['estado'],a1['motivo_omision']),('REVISADA',None))
        self.assertEqual(self.call('POST',f"/revisiones/{sesion['id']}/omitir",{'colmena_id':self.h['A1'].id})[0],409)
        self.assertEqual(self.call('POST',f"/revisiones/{sesion['id']}/omitir",{'colmena_id':self.h['FUERA'].id})[0],422)

    def test_partial_finish_and_closed_session(self):
        sesion=self.iniciar();self.inspeccionar(sesion,'A1')
        status,detalle=self.call('POST',f"/revisiones/{sesion['id']}/finalizar")
        self.assertEqual((status,detalle['estado']),(200,'FINALIZADA'))
        self.assertIsNotNone(detalle['fecha_fin'])
        self.assertEqual(detalle['progreso'],{'total':3,'revisadas':1,'omitidas':0,'pendientes':2})
        for method,url,body in [('POST',f"/revisiones/{sesion['id']}/finalizar",None),
                                ('POST',f"/revisiones/{sesion['id']}/omitir",{'colmena_id':self.h['A2'].id})]:
            self.assertEqual(self.call(method,url,body)[0],409)
        self.assertEqual(self.inspeccionar(sesion,'A2')[0],409)
        self.assertEqual(self.iniciar()['estado'],'EN_CURSO')

    def test_only_owner_or_admin_changes_the_session(self):
        sesion=self.iniciar()
        self.como(2)
        self.assertEqual(self.call('POST',f"/revisiones/{sesion['id']}/omitir",{'colmena_id':self.h['A1'].id})[0],403)
        self.assertEqual(self.call('POST',f"/revisiones/{sesion['id']}/finalizar")[0],403)
        self.assertEqual(self.call('GET',f"/revisiones/{sesion['id']}")[0],200)
        self.como(3,'ADMIN')
        self.assertEqual(self.call('POST',f"/revisiones/{sesion['id']}/finalizar")[0],200)

    def test_reassigning_after_start_does_not_change_the_route(self):
        sesion=self.iniciar()
        self.db.add(GrupoColmenaAsignacion(grupo_id=self.grupo.id,colmena_id=self.h['FUERA'].id,usuario_id=3))
        self.db.commit()
        self.assertEqual(self.call('GET',f"/revisiones/{sesion['id']}")[1]['progreso']['total'],3)

    def test_resent_with_id_cliente_returns_same_session(self):
        id_cliente=str(uuid4())
        primera=self.iniciar(id_cliente=id_cliente)
        status,segunda=self.call('POST','/revisiones/',{'grupo_id':self.grupo.id,'id_cliente':id_cliente})
        self.assertEqual((status,segunda['id']),(200,primera['id']))
        self.como(2)
        self.assertEqual(self.call('POST','/revisiones/',{'grupo_id':self.grupo.id,'id_cliente':id_cliente})[0],409)

    def test_start_errors_and_listing(self):
        self.assertEqual(self.call('POST','/revisiones/',{'grupo_id':self.vacio.id})[0],422)
        self.assertEqual(self.call('POST','/revisiones/',{'grupo_id':999})[0],404)
        self.assertEqual(self.call('POST','/revisiones/',{'grupo_id':self.grupo.id,'otro':1})[0],422)
        self.assertEqual(self.call('GET','/revisiones/999')[0],404)
        sesion=self.iniciar()
        self.assertEqual([s['id'] for s in self.call('GET','/revisiones/?estado=EN_CURSO')[1]],[sesion['id']])
        self.assertEqual(self.call('GET','/revisiones/?estado=FINALIZADA')[1],[])
        app.dependency_overrides.pop(obtener_usuario_actual)
        self.assertEqual(self.call('GET','/revisiones/')[0],401)


if __name__ == '__main__':
    unittest.main()
