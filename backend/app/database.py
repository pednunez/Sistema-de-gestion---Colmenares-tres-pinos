from pathlib import Path
from typing import Literal
from pydantic import model_validator

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, declarative_base
from pydantic_settings import BaseSettings, SettingsConfigDict


# ==========================================================
# RUTA BASE DEL BACKEND
# ==========================================================
#
# __file__ apunta a:
# backend/app/database.py
#
# parent       -> backend/app
# parent.parent -> backend
#
# Por eso BASE_DIR queda apuntando directamente a la carpeta:
# backend/
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent.parent


# ==========================================================
# CONFIGURACIÓN DEL SISTEMA
# ==========================================================
#
# Esta clase obtiene las variables almacenadas en:
#
# backend/.env
#
# Esto evita problemas aunque FastAPI se ejecute desde
# la carpeta raíz del proyecto.
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

    JWT_SECRET_KEY: str

    JWT_ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    SESSION_COOKIE_NAME: str = "colmenares_session"
    SESSION_COOKIE_SECURE: bool = True
    SESSION_COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @model_validator(mode="after")
    def validar_cookie(self):
        if self.SESSION_COOKIE_SAMESITE == "none" and not self.SESSION_COOKIE_SECURE:
            raise ValueError("SameSite=None requiere Secure")
        if "*" in self.CORS_ORIGINS:
            raise ValueError("CORS requiere origenes explicitos")
        return self


    # ------------------------------------------------------
    # ARCHIVO .env
    # ------------------------------------------------------
    #
    # Aquí ya no usamos:
    #
    # env_file=".env"
    #
    # porque eso depende de la carpeta desde la que
    # se ejecuta Python.
    #
    # Ahora usamos una ruta absoluta construida desde
    # la ubicación real de database.py.
    # ------------------------------------------------------

    model_config = SettingsConfigDict(
    env_file=BASE_DIR / ".env",
    env_file_encoding="utf-8",
    extra="ignore"
)


# ==========================================================
# CARGAR CONFIGURACIÓN
# ==========================================================

settings = Settings()


# ==========================================================
# BASE PARA LOS MODELOS SQLALCHEMY
# ==========================================================

Base = declarative_base()


# ==========================================================
# URL DE CONEXIÓN A POSTGRESQL
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

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)


# ==========================================================
# SESIONES DE BASE DE DATOS
# ==========================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# ==========================================================
# DEPENDENCIA DE BASE DE DATOS PARA FASTAPI
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

def probar_conexion():

    with engine.connect() as conexion:

        resultado = conexion.execute(
            text("SELECT version();")
        )

        return resultado.scalar()