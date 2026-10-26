"""Pruebas del modulo Stock sobre SQLite en memoria."""
import asyncio
import json
from types import SimpleNamespace
from urllib.parse import urlsplit
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
from app.models.inventario_incidencia import InventarioIncidencia
from app.models.inventario_movimiento import InventarioMovimiento
from app.models.inventario_stock import InventarioStock
from app.models.stock_minimo import StockMinimo


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


class StockTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        @event.listens_for(self.engine, 'connect')
        def sqlite_functions(connection, record):
            connection.create_function('gen_random_uuid',0,lambda:uuid4().hex)
            # El bloqueo de PostgreSQL no aplica en una sola conexion de prueba.
            connection.create_function('pg_advisory_xact_lock',2,lambda espacio,recurso:None)
        for model in [Apiario,Colmena,InventarioStock,InventarioMovimiento,InventarioIncidencia,StockMinimo]:
            model.__table__.create(self.engine)
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
        self.hive_a=Colmena(codigo='A1',apiario_id=self.a.id,cantidad_marcos=10)
        self.hive_baja=Colmena(codigo='A2',apiario_id=self.a.id,estado='BAJA',cantidad_marcos=10)
        self.db.add_all([self.hive_a,self.hive_baja]);self.db.commit()
        self.audit_patch=patch('app.services.auditoria.registrar_auditoria')
        self.audit=self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)

    def restore(self,previous):
        app.dependency_overrides.clear();app.dependency_overrides.update(previous)

    def set_role(self,role):
        app.dependency_overrides[obtener_usuario_actual]=lambda:SimpleNamespace(id=1,rol=role)

    def call(self,method,url,data=None):
        return asyncio.run(request(method,url,data))

    def move(self,tipo,cantidad,material='ALZA',**extra):
        return self.call('POST','/stock/movimientos/',dict(material=material,tipo=tipo,cantidad=cantidad,**extra))

    def ok(self,tipo,cantidad,material='ALZA',**extra):
        status,body=self.move(tipo,cantidad,material,**extra)
        self.assertIn(status,(200,201),body)
        return body

    def row(self,material='ALZA'):
        status,body=self.call('GET','/stock/')
        self.assertEqual(status,200)
        return next(r for r in body if r['material']==material)

    def test_summary_lists_every_material_with_new_fields(self):
        status,body=self.call('GET','/stock/')
        self.assertEqual(status,200)
        self.assertEqual({r['material'] for r in body},{'CAJON','ALZA','PISO','TECHO','TECHO_AMERICANO','ENTRETAPA',
                                                        'MARCO_VACIO','MARCO_CERA_ESTIRADA','MARCO_CERA_UNTADA'})
        self.assertEqual({k:body[0][k] for k in ['disponible','danado','en_reparacion','merma']},
                         dict(disponible=0,danado=0,en_reparacion=0,merma=0))

    def test_envio_discounts_available_and_records_destination(self):
        self.ok('INGRESO',10)
        body=self.ok('ENVIO',3,colmena_id=self.hive_a.id)
        self.assertEqual((body['tipo'],body['apiario_id'],body['colmena_id']),('ENVIO',self.a.id,self.hive_a.id))
        self.assertEqual(self.row()['disponible'],7)
        self.ok('ENVIO',2)
        self.ok('ENVIO',1,apiario_id=self.b.id)
        self.assertEqual(self.row()['disponible'],4)
        status,history=self.call('GET','/stock/movimientos/?tipo=ENVIO')
        self.assertEqual(status,200)
        self.assertEqual([(m['cantidad'],m['apiario_id'],m['colmena_id']) for m in history],
                         [(1,self.b.id,None),(2,None,None),(3,self.a.id,self.hive_a.id)])

    def test_envio_does_not_add_stock_anywhere(self):
        self.ok('INGRESO',5)
        self.ok('ENVIO',5,colmena_id=self.hive_a.id)
        total=sum(self.db.scalars(select(InventarioStock.cantidad)).all())
        self.assertEqual(total,0)

    def test_envio_rejections(self):
        self.ok('INGRESO',2)
        self.assertEqual(self.move('ENVIO',3)[0],409)
        self.assertEqual(self.move('ENVIO',1,apiario_id=self.b.id,colmena_id=self.hive_a.id)[0],422)
        self.assertEqual(self.move('ENVIO',1,apiario_id=self.inactive.id)[0],409)
        self.assertEqual(self.move('ENVIO',1,colmena_id=self.hive_baja.id)[0],409)
        self.assertEqual(self.move('ENVIO',1,colmena_id=9999)[0],404)
        self.assertEqual(self.move('ENVIO',1,apiario_id=9999)[0],404)
        self.assertEqual(self.row()['disponible'],2)

    def test_full_damage_repair_and_merma_cycle(self):
        self.ok('INGRESO',10)
        self.ok('DANO',4)
        r=self.row();self.assertEqual((r['disponible'],r['danado'],r['en_reparacion'],r['merma']),(6,4,0,0))
        self.ok('ENVIO_REPARACION',3)
        r=self.row();self.assertEqual((r['disponible'],r['danado'],r['en_reparacion'],r['merma']),(6,1,3,0))
        self.ok('REPARACION',2)
        r=self.row();self.assertEqual((r['disponible'],r['danado'],r['en_reparacion'],r['merma']),(8,1,1,0))
        body=self.ok('DESCARTE',1,estado_origen='EN_REPARACION')
        self.assertEqual(body['estado_origen'],'EN_REPARACION')
        self.ok('DESCARTE',1,estado_origen='DANADO')
        r=self.row();self.assertEqual((r['disponible'],r['danado'],r['en_reparacion'],r['merma']),(8,0,0,2))
        incidencia=self.db.scalars(select(InventarioIncidencia)).one()
        self.assertEqual((incidencia.cantidad_pendiente,incidencia.cantidad_en_reparacion,
                          incidencia.cantidad_reparada,incidencia.cantidad_baja),(0,0,2,2))
        self.assertIsNotNone(incidencia.fecha_cierre)
        status,history=self.call('GET','/stock/movimientos/')
        self.assertEqual([m['tipo'] for m in history],
                         ['DESCARTE','DESCARTE','REPARACION','ENVIO_REPARACION','DANO','INGRESO'])
        self.assertEqual([m['estado_origen'] for m in history][:2],['DANADO','EN_REPARACION'])

    def test_repair_requires_material_in_repair(self):
        self.ok('INGRESO',5)
        self.ok('DANO',2)
        self.assertEqual(self.move('REPARACION',1)[0],409)
        self.assertEqual(self.move('DESCARTE',1,estado_origen='EN_REPARACION')[0],409)
        self.assertEqual(self.move('ENVIO_REPARACION',3)[0],409)

    def test_wax_frames_damage_as_empty_frames_and_skip_repair(self):
        self.ok('INGRESO',3,'MARCO_CERA_ESTIRADA')
        self.ok('DANO',2,'MARCO_CERA_ESTIRADA')
        self.assertEqual(self.row('MARCO_VACIO')['danado'],2)
        self.assertEqual(self.move('ENVIO_REPARACION',1,'MARCO_CERA_ESTIRADA')[0],422)
        self.ok('ENVIO_REPARACION',2,'MARCO_VACIO')

    def test_contract_validation(self):
        self.assertEqual(self.move('DESCARTE',1)[0],422)
        self.assertEqual(self.move('ENVIO',1,estado_origen='DANADO')[0],422)
        self.assertEqual(self.move('DANO',1,apiario_id=self.a.id)[0],422)
        self.assertEqual(self.move('INGRESO',1,observaciones='x'*501)[0],422)

    def test_new_materials_accepted(self):
        for material in ['CAJON','TECHO']:
            self.ok('INGRESO',2,material)
            self.assertEqual(self.row(material)['disponible'],2)

    def test_only_admin_registers_movements(self):
        self.set_role('APICULTOR')
        self.assertEqual(self.move('INGRESO',1)[0],403)
        self.assertEqual(self.call('GET','/stock/')[0],200)


if __name__ == '__main__':
    unittest.main()
