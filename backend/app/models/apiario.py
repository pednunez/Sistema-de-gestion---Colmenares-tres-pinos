from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Identity,
    String,
    Text,
    text,
)

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


# ==========================================================
# MODELO: APIARIO
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================

class Apiario(Base):

    __tablename__ = "apiarios"

    # ======================================================
    # IDENTIFICADOR
    # PostgreSQL utiliza GENERATED ALWAYS AS IDENTITY
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True
    )

    # ======================================================
    # NOMBRE DEL APIARIO
    # ======================================================

    nombre: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False
    )

    # ======================================================
    # UBICACIÓN
    # ======================================================

    ubicacion: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    # ======================================================
    # DESCRIPCIÓN
    # ======================================================

    descripcion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # ======================================================
    # BAJA LÓGICA
    # ======================================================

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true")
    )

    # ======================================================
    # FECHAS DE AUDITORÍA
    # ======================================================

    fecha_creacion: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    fecha_actualizacion: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    fecha_eliminacion: Mapped[object | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )