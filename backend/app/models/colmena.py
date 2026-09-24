from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    text
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Colmena(Base):
    __tablename__ = "colmenas"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    apiario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("apiarios.id"),
        nullable=False
    )

    codigo: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False
    )

    codigo_qr: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        unique=True,
        nullable=False,
        server_default=text("gen_random_uuid()")
    )

    estado: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="ACTIVA",
        server_default=text("'ACTIVA'")
    )

    fecha_instalacion: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true")
    )

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    fecha_eliminacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )