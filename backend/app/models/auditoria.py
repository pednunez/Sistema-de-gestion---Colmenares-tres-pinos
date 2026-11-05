from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    text,
)

from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# MODELO: AUDITORIA
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================

class Auditoria(Base):

    __tablename__ = "auditoria"

    # ======================================================
    # INDICES EXISTENTES EN POSTGRESQL
    # ======================================================

    __table_args__ = (
        Index(
            "idx_auditoria_usuario",
            "usuario_id",
        ),
    )

    # ======================================================
    # IDENTIFICADOR AUTOMATICO
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    # ======================================================
    # USUARIO RESPONSABLE DE LA OPERACION
    # ======================================================

    usuario_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=True,
    )

    # ======================================================
    # ENTIDAD AFECTADA
    # ======================================================

    entidad: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # ======================================================
    # IDENTIFICADOR DEL REGISTRO AFECTADO
    # ======================================================

    entidad_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )

    # ======================================================
    # ACCION REALIZADA
    # ======================================================

    accion: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # DATOS ANTERIORES Y NUEVOS
    # ======================================================

    datos_anteriores: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    datos_nuevos: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # ======================================================
    # FECHA DE LA OPERACION
    # ======================================================

    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )