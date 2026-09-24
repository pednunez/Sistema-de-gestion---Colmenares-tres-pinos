from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
    text
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Tratamiento(Base):
    __tablename__ = "tratamientos"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    inspeccion_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("inspecciones.id"),
        nullable=True
    )

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    tipo_tratamiento: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    producto: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True
    )

    dosis: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    motivo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    fecha_inicio: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )

    fecha_fin: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="EN_CURSO",
        server_default=text("'EN_CURSO'")
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

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )