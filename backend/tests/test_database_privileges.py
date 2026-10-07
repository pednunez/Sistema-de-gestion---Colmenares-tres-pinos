"""Permisos reales en public, sin conservar registros ni modificar filas existentes.
Activar con RF03_POSTGRES=1. TRUNCATE se intenta solo tras comprobar permiso ausente.
"""
import os
import unittest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from app.database import engine


@unittest.skipUnless(os.getenv('RF03_POSTGRES') == '1', 'Requires explicit Neon integration mode')
class DatabasePrivilegesTests(unittest.TestCase):
    def setUp(self):
        self.connection=engine.connect()
        self.addCleanup(self.connection.close)
        self.transaction=self.connection.begin()
        self.addCleanup(self.transaction.rollback)

    def scalar(self,statement,**parameters):
        return self.connection.execute(text(statement),parameters).scalar()

    def denied(self,statement):
        savepoint=self.connection.begin_nested()
        try:
            with self.assertRaises(DBAPIError) as caught:
                self.connection.execute(text(statement))
            self.assertEqual(getattr(caught.exception.orig,'sqlstate',None),'42501')
        finally:
            savepoint.rollback()

    def test_runtime_role_has_no_admin_membership_or_ownership(self):
        self.assertEqual(self.scalar('SELECT current_user'),'colmenares_app')
        flags=self.connection.execute(text('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user')).one()
        self.assertFalse(any(flags))
        self.assertFalse(self.scalar('SELECT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user))'))
        self.assertFalse(self.scalar("SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))"))
        self.assertFalse(self.scalar("SELECT has_schema_privilege(current_user,'public','CREATE')"))
        self.assertFalse(self.scalar('SELECT has_database_privilege(current_user,current_database(),\'CREATE\')'))

    def test_audit_insert_and_select_are_allowed_with_rollback(self):
        uid=self.scalar("INSERT INTO public.auditoria(entidad,accion,datos_nuevos) VALUES ('prueba_permisos','CREAR',jsonb_build_object('prueba',true)) RETURNING id")
        self.assertEqual(self.scalar('SELECT entidad FROM public.auditoria WHERE id=:id',id=uid),'prueba_permisos')
        # The enclosing transaction is always rolled back, including on failure.

    def test_audit_update_is_denied(self):
        self.denied('UPDATE public.auditoria SET entidad=entidad WHERE false')

    def test_audit_delete_is_denied(self):
        self.denied('DELETE FROM public.auditoria WHERE false')

    def test_audit_truncate_is_denied(self):
        self.assertFalse(self.scalar("SELECT has_table_privilege(current_user,'public.auditoria','TRUNCATE')"))
        self.connection.execute(text("SET LOCAL lock_timeout='2s'"))
        self.denied('TRUNCATE TABLE public.auditoria')

    def test_operational_reads_updates_and_soft_delete_permissions(self):
        for table in ['usuarios','apiarios','colmenas','inspecciones','tratamientos','transferencias_marcos']:
            with self.subTest(table=table):
                for privilege in ['SELECT','INSERT','UPDATE']:
                    self.assertTrue(self.scalar('SELECT has_table_privilege(current_user,:table,:privilege)',table='public.'+table,privilege=privilege))
                self.connection.execute(text(f'SELECT id FROM public.{table} LIMIT 0'))
                self.connection.execute(text(f'UPDATE public.{table} SET id=DEFAULT WHERE false'))
                self.denied(f'DELETE FROM public.{table} WHERE false')
