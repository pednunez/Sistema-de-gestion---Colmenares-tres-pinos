"""CRUD y auditoria persistente. RF03_POSTGRES=1 usa tablas temporales en Neon."""
import asyncio
import json
import unittest
from unittest.mock import patch
from sqlalchemy import select, text
import test_password_recovery as recovery
from test_cookie_sessions import call
from app.models.usuario import Usuario
from app.models.auditoria import Auditoria
from app.core.security import verificar_password


class UserAuditTests(unittest.TestCase):
    setUp = recovery.RecoveryTests.setUp
    restore_overrides = recovery.RecoveryTests.restore_overrides

    def request(self, path, data=None, **kwargs):
        return asyncio.run(call(path, data, **kwargs))

    def login(self, admin=True):
        self.user.rol = 'ADMIN' if admin else 'APICULTOR'
        self.db.commit()
        status, body, headers = self.request('/auth/login', {'email':self.user.email,'password':self.old_password})
        self.assertEqual(status,200)
        return dict(cookie=next(v.split(';')[0] for k,v in headers if k=='set-cookie'),csrf=body['csrf_token'])

    def create(self, auth, **changes):
        data=dict(nombre='Usuario de prueba',apellido='Temporal',email='nuevo@example.invalid',password=self.new_password,rol='APICULTOR')
        data.update(changes)
        return self.request('/usuarios/',data,**auth)

    def events(self, entity='usuarios'):
        return self.db.scalars(select(Auditoria).where(Auditoria.entidad==entity).order_by(Auditoria.id)).all()

    def test_create_read_update_role_and_deactivate(self):
        auth=self.login()
        status,body,_=self.create(auth); self.assertEqual(status,201); uid=body['id']
        stored=self.db.get(Usuario,uid)
        self.assertTrue(verificar_password(self.new_password,stored.password_hash))
        self.assertNotIn('password',json.dumps(body))
        self.assertEqual(self.request(f'/usuarios/{uid}',**auth)[0],200)
        status,body,_=self.request(f'/usuarios/{uid}',{'rol':'ADMIN','apellido':None},method='PATCH',**auth)
        self.assertEqual(status,200);self.assertEqual(body['rol'],'ADMIN');self.assertIsNone(body['apellido'])
        self.assertEqual(self.request(f'/usuarios/{uid}',method='DELETE',**auth)[0],200)
        self.assertEqual(self.request(f'/usuarios/{uid}',**auth)[0],404)
        self.assertNotIn(uid,[u['id'] for u in self.request('/usuarios/',**auth)[1]])
        self.db.refresh(stored);self.assertFalse(stored.activo);self.assertIsNotNone(stored.fecha_eliminacion)
        rows=self.events();self.assertEqual([r.accion for r in rows],['CREAR','MODIFICAR','ELIMINAR'])
        self.assertTrue(all(r.usuario_id==self.user.id and r.entidad_id==uid for r in rows))
        self.assertEqual(rows[1].datos_anteriores['rol'],'APICULTOR')
        self.assertEqual(rows[1].datos_nuevos['rol'],'ADMIN')
        self.assertFalse(rows[2].datos_nuevos['activo'])

    def test_duplicate_email_active_and_inactive(self):
        auth=self.login();_,body,_=self.create(auth);uid=body['id']
        self.assertEqual(self.create(auth)[0],409)
        self.request(f'/usuarios/{uid}',method='DELETE',**auth)
        self.assertEqual(self.create(auth)[0],409)
        self.assertEqual(len(self.events()),2)

    def test_duplicate_update_and_unchanged_email(self):
        auth=self.login();_,body,_=self.create(auth);url=f"/usuarios/{body['id']}"
        self.assertEqual(self.request(url,{'email':self.user.email},method='PATCH',**auth)[0],409)
        self.assertEqual(self.request(url,{'email':body['email']},method='PATCH',**auth)[0],200)

    def test_anonymous_and_apicultor_permissions(self):
        auth=self.login(admin=False)
        for credentials,expected in [({},401),(auth,403)]:
            for method,path,data in [('GET','/usuarios/',None),('GET',f'/usuarios/{self.user.id}',None),('POST','/usuarios/',dict(nombre='Test',email='test@example.invalid',password=self.new_password)),('PATCH',f'/usuarios/{self.user.id}',{'rol':'ADMIN'}),('DELETE',f'/usuarios/{self.user.id}',None),('GET','/auditoria/',None)]:
                with self.subTest(method=method,path=path):
                    self.assertEqual(self.request(path,data,method=method,**credentials)[0],expected)
        self.assertEqual(self.events(),[])

    def test_missing_ids(self):
        auth=self.login()
        for method,data in [('GET',None),('PATCH',{'nombre':'Cambio'}),('DELETE',None)]:
            self.assertEqual(self.request('/usuarios/999999999',data,method=method,**auth)[0],404)
        self.assertEqual(self.events(),[])

    def test_invalid_payloads_no_change(self):
        auth=self.login()
        for changes in [{'rol':'ROOT'},{'password':'corta'},{'nombre':'x'}]:
            self.assertEqual(self.create(auth,**changes)[0],422)
        for field in ['nombre','email','rol']:
            self.assertEqual(self.request(f'/usuarios/{self.user.id}',{field:None},method='PATCH',**auth)[0],422)
        self.assertEqual(self.events(),[])

    def test_login_success_failure_and_audit_has_no_secrets(self):
        self.login()
        for email,password in [(self.user.email,self.new_password),('missing@example.invalid',self.old_password)]:
            self.assertEqual(self.request('/auth/login',dict(email=email,password=password))[0],401)
        rows=self.events('sesion')
        self.assertEqual([r.datos_nuevos['resultado'] for r in rows],['EXITO','FALLO','FALLO'])
        self.assertIsNone(rows[1].usuario_id)
        serialized=json.dumps([r.datos_nuevos for r in rows])
        for secret in [self.old_password,self.new_password,self.user.password_hash,'missing@example.invalid']:
            self.assertNotIn(secret,serialized)

    def test_user_audit_excludes_credentials(self):
        auth=self.login();self.create(auth)
        serialized=json.dumps([r.datos_nuevos for r in self.events()])
        for secret in [self.new_password,'password_hash','password_reset','csrf','version_sesion']:
            self.assertNotIn(secret,serialized)
        status,rows,_=self.request('/auditoria/',**auth)
        self.assertEqual(status,200);self.assertTrue(any(r['entidad']=='usuarios' for r in rows))

    def test_audit_failure_rolls_back_creation(self):
        auth=self.login()
        with patch('app.services.usuario.auditoria.registrar_auditoria',side_effect=RuntimeError('test audit failure')):
            with self.assertRaises(RuntimeError):self.create(auth)
        self.assertIsNone(self.db.scalar(select(Usuario).where(Usuario.email=='nuevo@example.invalid')))
        self.assertEqual(self.events(),[])

    def test_audit_failure_rolls_back_update_and_delete(self):
        auth=self.login();_,body,_=self.create(auth);uid=body['id']
        for method,data in [('PATCH',{'nombre':'Cambio'}),('DELETE',None)]:
            with patch('app.services.usuario.auditoria.registrar_auditoria',side_effect=RuntimeError('test audit failure')):
                with self.assertRaises(RuntimeError):self.request(f'/usuarios/{uid}',data,method=method,**auth)
            stored=self.db.get(Usuario,uid);self.db.refresh(stored)
            self.assertTrue(stored.activo);self.assertEqual(stored.nombre,'Usuario de prueba')
        self.assertEqual(len(self.events()),1)

    def test_failed_commit_rolls_back_user_and_audit(self):
        auth=self.login()
        with patch.object(self.db,'commit',side_effect=RuntimeError('test commit failure')):
            with self.assertRaises(RuntimeError): self.create(auth)
        self.assertEqual(self.events(),[])
        self.assertIsNone(self.db.scalar(select(Usuario).where(Usuario.email=='nuevo@example.invalid')))

    def test_role_change_and_deactivation_revoke_sessions(self):
        auth=self.login();_,body,_=self.create(auth);uid=body['id']
        def target_login():
            status,result,headers=self.request('/auth/login',dict(email=body['email'],password=self.new_password))
            self.assertEqual(status,200)
            return next(v.split(';')[0] for k,v in headers if k=='set-cookie')
        cookie=target_login()
        self.assertEqual(self.request(f'/usuarios/{uid}',{'rol':'ADMIN'},method='PATCH',**auth)[0],200)
        self.assertEqual(self.request('/auth/me',cookie=cookie)[0],401)
        cookie=target_login()
        self.request(f'/usuarios/{uid}',method='DELETE',**auth)
        self.assertEqual(self.request('/auth/me',cookie=cookie)[0],401)
        self.assertEqual(self.request('/auth/login',dict(email=body['email'],password=self.new_password))[0],401)
