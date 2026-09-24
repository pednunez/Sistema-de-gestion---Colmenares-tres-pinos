from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    text
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Inspeccion(Base):
    __tablename__ = "inspecciones"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    fecha_inspeccion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    estado_general: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    reina_observada: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )

    presencia_cria: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )

    nivel_poblacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    reservas_alimento: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    signos_enfermedad: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false")
    )

    enfermedad_observada: Mapped[str | None] = mapped_column(
        Text,
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