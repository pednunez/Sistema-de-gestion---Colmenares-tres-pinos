"""Grupos o filas de colmenas (PB-06 / S2-T01) sobre SQLite."""
import asyncio
import json
from types import SimpleNamespace
from uuid import uuid4
import unittest
from unittest.mock import patch

from sqlalchemy import BigInteger, create_engine, event, select
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.core.dependencies import obtener_usuario_actual
from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion


@compiles(BigInteger, 'sqlite')
def sqlite_identifier(type_, compiler, **kwargs):
    return 'INTEGER'


async def request(method, url, data=None):
    path, _, query = url.partition('?')
    messages=[]
    scope=dict(type='http',asgi={'version':'3.0'},http_version='1.1',method=method,
               scheme='http',path=path,raw_path=path.encode(),root_path='',
               query_string=query.encode(),headers=[(b'content-type',b'application/json')],
               client=('127.0.0.1',1),server=('test',80))
    async def receive():
        return {'type':'http.request','body':json.dumps(data or {}).encode(),'more_body':False}
    async def send(message):
        messages.append(message)
    await app(scope,receive,send)
    status=next(m['status'] for m in messages if m['type']=='http.response.start')
    payload=b''.join(m.get('body',b'') for m in messages if m['type']=='http.response.body')
    return status,json.loads(payload)


class GruposTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine, 'connect')
        def sqlite_functions(connection, record):
            connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
        for model in [Apiario,Colmena,GrupoColmena,GrupoColmenaAsignacion]:
            model.__table__.create(self.engine)
        self.connection=self.engine.connect()
        self.addCleanup(self.connection.close)
        self.db=Session(bind=self.connection,expire_on_commit=False)
        self.addCleanup(self.db.close)
        previous=app.dependency_overrides.copy()
        self.addCleanup(lambda:(app.dependency_overrides.clear(),app.dependency_overrides.update(previous)))
        app.dependency_overrides[get_db]=lambda:self.db
        self.set_role('ADMIN')
        self.a=Apiario(nombre='A',activo=True);self.b=Apiario(nombre='B',activo=True)
        self.off=Apiario(nombre='Off',activo=False)
        self.db.add_all([self.a,self.b,self.off]);self.db.flush()
        self.h={}
        for code,apiary,estado,activo in [('A1',self.a,'ACTIVA',True),('A2',self.a,'ACTIVA',True),
                                          ('A3',self.a,'EN_OBSERVACION',True),('B1',self.b,'ACTIVA',True),
                                          ('ABAJA',self.a,'BAJA',True),('ABORR',self.a,'ACTIVA',False)]:
            hive=Colmena(codigo=code,apiario_id=apiary.id,estado=estado,activo=activo,cantidad_marcos=10)
            self.db.add(hive);self.h[code]=hive
        self.db.commit()
        self.audit_patch=patch('app.services.auditoria.registrar_auditoria')
        self.audit=self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)

    def set_role(self,role):
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=1,rol=role)

    def call(self,method,url,data=None):
        return asyncio.run(request(method,url,data))

    def crear(self,nombre='Fila 1',apiario=None):
        status,body=self.call('POST','/grupos/',{'apiario_id':(apiario or self.a).id,'nombre':nombre})
        self.assertEqual(status,201,body)
        return body

    def asignar(self,grupo,*codigos):
        return self.call('POST',f"/grupos/{grupo['id']}/colmenas",{'colmena_ids':[self.h[c].id for c in codigos]})

    def codigos(self,grupo_id):
        return [c['codigo'] for c in self.call('GET',f'/grupos/{grupo_id}')[1]['colmenas']]

    def test_create_and_list(self):
        grupo=self.crear('  Fila   norte ')
        self.assertEqual((grupo['nombre'],grupo['cantidad_colmenas'],grupo['colmenas']),('Fila norte',0,[]))
        self.crear('Fila sur',self.b)
        self.assertEqual([g['nombre'] for g in self.call('GET',f'/grupos/?apiario_id={self.a.id}')[1]],['Fila norte'])
        self.assertEqual(len(self.call('GET','/grupos/')[1]),2)

    def test_name_unique_per_apiary_ignoring_case(self):
        self.crear('Fila 1')
        self.assertEqual(self.call('POST','/grupos/',{'apiario_id':self.a.id,'nombre':'FILA 1'})[0],409)
        self.crear('Fila 1',self.b)
        otro=self.crear('Fila 2')
        self.assertEqual(self.call('PATCH',f"/grupos/{otro['id']}",{'nombre':'fila 1'})[0],409)

    def test_name_can_be_reused_after_deactivation(self):
        grupo=self.crear('Fila 1')
        self.assertEqual(self.call('DELETE',f"/grupos/{grupo['id']}")[0],200)
        self.crear('Fila 1')

    def test_create_validations(self):
        for body in [{'apiario_id':self.off.id,'nombre':'X'},{'apiario_id':999,'nombre':'X'}]:
            self.assertEqual(self.call('POST','/grupos/',body)[0],422)
        for body in [{'apiario_id':self.a.id,'nombre':'   '},{'apiario_id':self.a.id,'nombre':'x'*61},
                     {'apiario_id':self.a.id},{'apiario_id':self.a.id,'nombre':'X','otro':1}]:
            with self.subTest(body=body):
                self.assertEqual(self.call('POST','/grupos/',body)[0],422)

    def test_assign_only_active_hives_of_same_apiary(self):
        grupo=self.crear()
        status,body=self.asignar(grupo,'A1','A3')
        self.assertEqual(status,200,body)
        self.assertEqual((body['cantidad_colmenas'],self.codigos(grupo['id'])),(2,['A1','A3']))
        for codigo in ['B1','ABAJA','ABORR']:
            with self.subTest(codigo=codigo):
                status,body=self.asignar(grupo,'A2',codigo)
                self.assertEqual(status,422)
                self.assertIn(str(self.h[codigo].id),body['detail'])
        self.assertEqual(self.codigos(grupo['id']),['A1','A3'])
        status,_=self.call('POST',f"/grupos/{grupo['id']}/colmenas",{'colmena_ids':[self.h['A1'].id]*2})
        self.assertEqual(status,422)

    def test_reassign_moves_hive_and_keeps_history(self):
        fila1=self.crear('Fila 1');fila2=self.crear('Fila 2')
        self.asignar(fila1,'A1','A2')
        self.asignar(fila2,'A1')
        self.assertEqual((self.codigos(fila1['id']),self.codigos(fila2['id'])),(['A2'],['A1']))
        historial=self.call('GET',f"/grupos/{fila1['id']}/historial")[1]
        cerrada=next(r for r in historial if r['codigo']=='A1')
        self.assertIsNotNone(cerrada['fecha_retiro'])
        vigentes=self.db.scalars(select(GrupoColmenaAsignacion).where(
            GrupoColmenaAsignacion.colmena_id==self.h['A1'].id,GrupoColmenaAsignacion.fecha_retiro.is_(None))).all()
        self.assertEqual(len(vigentes),1)

    def test_assigning_twice_is_a_no_op(self):
        grupo=self.crear();self.asignar(grupo,'A1')
        self.audit.reset_mock()
        self.assertEqual(self.asignar(grupo,'A1')[0],200)
        self.audit.assert_not_called()
        self.assertEqual(len(self.call('GET',f"/grupos/{grupo['id']}/historial")[1]),1)

    def test_remove_hive_from_group(self):
        grupo=self.crear();self.asignar(grupo,'A1','A2')
        status,body=self.call('DELETE',f"/grupos/{grupo['id']}/colmenas/{self.h['A1'].id}")
        self.assertEqual((status,[c['codigo'] for c in body['colmenas']]),(200,['A2']))
        self.assertEqual(self.call('DELETE',f"/grupos/{grupo['id']}/colmenas/{self.h['A1'].id}")[0],404)

    def test_deactivate_keeps_history_and_frees_hives(self):
        fila1=self.crear('Fila 1');self.asignar(fila1,'A1','A2')
        status,body=self.call('DELETE',f"/grupos/{fila1['id']}")
        self.assertEqual((status,body['activo'],body['colmenas']),(200,False,[]))
        self.assertEqual(self.call('GET','/grupos/')[1],[])
        self.assertEqual(len(self.call('GET','/grupos/?incluir_inactivos=true')[1]),1)
        self.assertEqual(len(self.call('GET',f"/grupos/{fila1['id']}/historial")[1]),2)
        self.assertEqual(self.call('PATCH',f"/grupos/{fila1['id']}",{'nombre':'X'})[0],404)
        self.assertEqual(self.call('DELETE',f"/grupos/{fila1['id']}")[0],404)
        fila2=self.crear('Fila 2')
        self.assertEqual(self.asignar(fila2,'A1')[0],200)

    def test_update(self):
        grupo=self.crear()
        status,body=self.call('PATCH',f"/grupos/{grupo['id']}",{'descripcion':'Junto al estero'})
        self.assertEqual((status,body['descripcion'],body['nombre']),(200,'Junto al estero','Fila 1'))
        for cuerpo in [{},{'nombre':None},{'apiario_id':self.b.id}]:
            with self.subTest(cuerpo=cuerpo):
                self.assertEqual(self.call('PATCH',f"/grupos/{grupo['id']}",cuerpo)[0],422)

    def test_writes_are_audited(self):
        grupo=self.crear();self.asignar(grupo,'A1')
        self.call('DELETE',f"/grupos/{grupo['id']}")
        acciones=[c.args[1].accion for c in self.audit.call_args_list]
        self.assertEqual(acciones,['CREAR','MODIFICAR','ELIMINAR'])
        self.assertEqual(self.audit.call_args_list[2].args[1].datos_nuevos['colmenas_liberadas'],[self.h['A1'].id])

    def test_apicultor_reads_but_cannot_write(self):
        grupo=self.crear();self.asignar(grupo,'A1')
        self.set_role('APICULTOR')
        self.assertEqual(self.call('GET','/grupos/')[0],200)
        self.assertEqual(self.codigos(grupo['id']),['A1'])
        for method,url,body in [('POST','/grupos/',{'apiario_id':self.a.id,'nombre':'X'}),
                                ('PATCH',f"/grupos/{grupo['id']}",{'nombre':'X'}),
                                ('POST',f"/grupos/{grupo['id']}/colmenas",{'colmena_ids':[self.h['A2'].id]}),
                                ('DELETE',f"/grupos/{grupo['id']}/colmenas/{self.h['A1'].id}",None),
                                ('DELETE',f"/grupos/{grupo['id']}",None)]:
            with self.subTest(method=method,url=url):
                self.assertEqual(self.call(method,url,body)[0],403)

    def test_missing_group_and_session(self):
        self.assertEqual(self.call('GET','/grupos/999')[0],404)
        self.assertEqual(self.call('GET','/grupos/999/historial')[0],404)
        app.dependency_overrides.pop(obtener_usuario_actual)
        self.assertEqual(self.call('GET','/grupos/')[0],401)


if __name__ == '__main__':
    unittest.main()
