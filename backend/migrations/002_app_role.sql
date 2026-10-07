-- Ejecutar como propietario desde Neon SQL Editor o una conexion de migraciones.
-- No incluye contrasenas. Habilitar LOGIN con una clave privada fuera de Git.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'colmenares_app') THEN
        CREATE ROLE colmenares_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
END $$;

GRANT USAGE ON SCHEMA public TO colmenares_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM colmenares_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM colmenares_app;
GRANT SELECT, INSERT, UPDATE ON public.usuarios, public.apiarios,
    public.colmenas, public.inspecciones, public.tratamientos,
    public.transferencias_marcos TO colmenares_app;
GRANT SELECT, INSERT ON public.auditoria TO colmenares_app;
GRANT USAGE ON SEQUENCE public.usuarios_id_seq, public.apiarios_id_seq,
    public.colmenas_id_seq, public.inspecciones_id_seq, public.tratamientos_id_seq,
    public.transferencias_marcos_id_seq, public.auditoria_id_seq TO colmenares_app;
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO colmenares_app', current_database());
END $$;
-- Sin DELETE/TRUNCATE: las bajas del sistema son logicas (UPDATE).
-- Las tablas nuevas requieren permisos explicitos en su migracion.
-- No otorgar membresia de neondb_owner/neon_superuser ni propiedad de objetos.
