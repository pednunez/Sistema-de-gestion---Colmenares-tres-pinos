from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, declarative_base
from pydantic_settings import BaseSettings, SettingsConfigDict


# ==========================================================
# CONFIGURACIÓN DEL SISTEMA
# ==========================================================
# Esta clase obtiene las variables almacenadas en el archivo
# .env ubicado dentro de la carpeta backend.
#
# Aquí NO escribimos contraseñas ni claves secretas directamente.
# ==========================================================

class Settings(BaseSettings):

    # ------------------------------------------------------
    # CONFIGURACIÓN POSTGRESQL
    # ------------------------------------------------------

    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str


    # ------------------------------------------------------
    # CONFIGURACIÓN JWT
    # ------------------------------------------------------
    # JWT_SECRET_KEY:
    # Clave privada utilizada para firmar los tokens.
    #
    # JWT_ALGORITHM:
    # Algoritmo utilizado para firmar el token.
    #
    # ACCESS_TOKEN_EXPIRE_MINUTES:
    # Tiempo que permanecerá válido el token.
    # ------------------------------------------------------

    JWT_SECRET_KEY: str

    JWT_ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60


    # ------------------------------------------------------
    # CONFIGURACIÓN DEL ARCHIVO .env
    # ------------------------------------------------------

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8"
    )


# ==========================================================
# CARGAR CONFIGURACIÓN
# ==========================================================

settings = Settings()


# ==========================================================
# BASE PARA LOS MODELOS SQLALCHEMY
# ==========================================================
# Todos nuestros modelos utilizan esta Base:
#
# class Apiario(Base)
# class Colmena(Base)
# class Usuario(Base)
# class Inspeccion(Base)
# etc.
#
# Esto permite que SQLAlchemy reconozca nuestras clases ORM.
# ==========================================================

Base = declarative_base()


# ==========================================================
# URL DE CONEXIÓN A POSTGRESQL
# ==========================================================
# Construimos la conexión utilizando las variables del .env.
#
# Ejemplo conceptual:
#
# postgresql+psycopg://usuario:clave@localhost:5432/base
#
# Utilizamos URL.create() para manejar de manera segura
# caracteres especiales que pueda contener la contraseña.
# ==========================================================

DATABASE_URL = URL.create(
    drivername="postgresql+psycopg",
    username=settings.DB_USER,
    password=settings.DB_PASSWORD,
    host=settings.DB_HOST,
    port=settings.DB_PORT,
    database=settings.DB_NAME
)


# ==========================================================
# MOTOR DE CONEXIÓN
# ==========================================================
# engine administra las conexiones entre FastAPI/SQLAlchemy
# y PostgreSQL.
#
# pool_pre_ping=True permite comprobar si una conexión sigue
# activa antes de utilizarla.
# ==========================================================

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)


# ==========================================================
# SESIONES DE BASE DE DATOS
# ==========================================================
# SessionLocal crea sesiones independientes para realizar
# operaciones sobre PostgreSQL.
#
# Por ejemplo:
#
# SELECT
# INSERT
# UPDATE
# DELETE
# ==========================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# ==========================================================
# DEPENDENCIA DE BASE DE DATOS PARA FASTAPI
# ==========================================================
# Esta función será utilizada en nuestros routers:
#
# db: Session = Depends(get_db)
#
# Abre una sesión para cada petición y la cierra
# automáticamente al finalizar.
# ==========================================================

def get_db():

    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


# ==========================================================
# PRUEBA DE CONEXIÓN
# ==========================================================
# Esta función es la que actualmente utilizamos en:
#
# GET /database
#
# Ejecuta:
#
# SELECT version();
#
# para comprobar que FastAPI puede comunicarse
# correctamente con PostgreSQL.
# ==========================================================

def probar_conexion():

    with engine.connect() as conexion:

        resultado = conexion.execute(
            text("SELECT version();")
        )

        return resultado.scalar()