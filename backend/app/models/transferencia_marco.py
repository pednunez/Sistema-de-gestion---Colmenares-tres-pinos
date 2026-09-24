from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TransferenciaMarco(Base):
    __tablename__ = "transferencias_marcos"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    colmena_origen_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    colmena_destino_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    fecha_transferencia: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    cantidad_marcos: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    tipo_marco: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True
    )

    motivo: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )