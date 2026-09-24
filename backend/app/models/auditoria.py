from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    text
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Auditoria(Base):
    __tablename__ = "auditoria"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    usuario_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=True
    )

    entidad: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    entidad_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True
    )

    accion: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    datos_anteriores: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True
    )

    datos_nuevos: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True
    )

    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )