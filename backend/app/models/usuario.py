from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    String,
    Text,
    text
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    # ======================================================
    # DATOS PERSONALES
    # ======================================================

    nombre: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    apellido: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    # ======================================================
    # CORREO
    # ======================================================
    #
    # También se utilizará para recuperación de contraseña.
    # ======================================================

    email: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        nullable=False
    )

    # ======================================================
    # CONTRASEÑA
    # ======================================================
    #
    # Nunca se almacena la contraseña real.
    # Se guarda únicamente el hash Argon2.
    # ======================================================

    password_hash: Mapped[str] = mapped_column(
        Text,
        nullable=False
    )

    # ======================================================
    # RF-03 - TOKEN DE RECUPERACIÓN
    # ======================================================
    #
    # IMPORTANTE:
    #
    # Nunca guardaremos el token enviado al usuario
    # directamente.
    #
    # Se guardará únicamente un hash SHA-256 del token.
    # ======================================================

    password_reset_token_hash: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # ======================================================
    # RF-03 - EXPIRACIÓN DEL TOKEN
    # ======================================================
    #
    # Define hasta qué momento puede utilizarse el token
    # para restablecer la contraseña.
    #
    # Ejemplo:
    #
    # solicitud: 18:00
    # expiración: 18:15
    #
    # Después de esa hora el token deja de ser válido.
    # ======================================================

    password_reset_expira_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # ======================================================
    # RF-03 - ÚLTIMA SOLICITUD DE RECUPERACIÓN
    # ======================================================
    #
    # Permitirá aplicar un límite entre solicitudes para
    # evitar múltiples peticiones de recuperación seguidas.
    # ======================================================

    password_reset_solicitado_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # ======================================================
    # ROL
    # ======================================================

    rol: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="APICULTOR",
        server_default=text("'APICULTOR'")
    )

    # ======================================================
    # ESTADO / BAJA LÓGICA
    # ======================================================

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true")
    )

    # ======================================================
    # FECHA DE CREACIÓN
    # ======================================================

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # FECHA DE ACTUALIZACIÓN
    # ======================================================

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # FECHA DE ELIMINACIÓN
    # ======================================================

    fecha_eliminacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )