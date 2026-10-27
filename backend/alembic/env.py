import os
import sys
from pathlib import Path
from logging.config import fileConfig

from alembic import context
from dotenv import dotenv_values

# ==========================================================
# CONFIGURACION ALEMBIC - COLMENARES TRES PINOS
# ==========================================================

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ==========================================================
# RUTAS DEL PROYECTO
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# ==========================================================
# SEGURIDAD: UTILIZAR SOLO NEON TESTING
# ==========================================================

ARCHIVO_TESTING = BASE_DIR / ".env.testing"

HOST_TESTING = (
    "ep-muddy-surf-b6szorsn.c-2.sa-east-1.aws.neon.tech"
)

if not ARCHIVO_TESTING.is_file():
    raise RuntimeError(
        "SEGURIDAD: No existe backend/.env.testing"
    )

variables = dotenv_values(ARCHIVO_TESTING)

if variables.get("DB_HOST") != HOST_TESTING:
    raise RuntimeError(
        "SEGURIDAD: Alembic solo permite Neon TESTING"
    )

CLAVES_OBLIGATORIAS = [
    "DB_USER",
    "DB_PASSWORD",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "JWT_SECRET_KEY",
]

for clave in CLAVES_OBLIGATORIAS:
    valor = variables.get(clave)

    # La configuracion de Alembic no necesita generar JWT,
    # pero Settings requiere que exista una clave.
    if clave == "JWT_SECRET_KEY" and not valor:
        valor = "alembic-testing-only-not-for-authentication"

    if not valor:
        raise RuntimeError(
            f"Falta configurar {clave} para Alembic"
        )

    os.environ[clave] = valor

# ==========================================================
# IMPORTAR SQLALCHEMY Y MODELOS
# ==========================================================

from app.database import Base, engine, settings
import app.models  # Registrar los modelos en Base.metadata

if settings.DB_HOST != HOST_TESTING:
    raise RuntimeError(
        "SEGURIDAD: Configuracion de base no autorizada"
    )

if engine.url.host != HOST_TESTING:
    raise RuntimeError(
        "SEGURIDAD: Motor PostgreSQL no autorizado"
    )

# ==========================================================
# METADATOS DE LOS MODELOS
# ==========================================================

target_metadata = Base.metadata

# ==========================================================
# MIGRACIONES OFFLINE
# ==========================================================

def run_migrations_offline():
    raise RuntimeError(
        "Modo offline deshabilitado durante las pruebas "
        "del Sprint 2"
    )

# ==========================================================
# MIGRACIONES ONLINE
# ==========================================================

def run_migrations_online():

    with engine.connect() as connection:

        if connection.engine.url.host != HOST_TESTING:
            raise RuntimeError(
                "SEGURIDAD: Conexion fuera de Neon TESTING"
            )

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()

# ==========================================================
# EJECUCION
# ==========================================================

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()