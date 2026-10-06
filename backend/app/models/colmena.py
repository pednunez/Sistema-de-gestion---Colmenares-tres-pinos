from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Colmena(Base):
    __tablename__ = "colmenas"

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    # ======================================================
    # APIARIO AL QUE PERTENECE
    # ======================================================

    apiario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("apiarios.id"),
        nullable=False
    )

    # ======================================================
    # CÓDIGO INTERNO DE LA COLMENA
    # ======================================================

    codigo: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False
    )

    # ======================================================
    # CÓDIGO QR ÚNICO
    # ======================================================

    codigo_qr: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        unique=True,
        nullable=False,
        server_default=text("gen_random_uuid()")
    )

    # ======================================================
    # ESTADO OPERACIONAL
    # ======================================================

    estado: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="ACTIVA",
        server_default=text("'ACTIVA'")
    )

    # ======================================================
    # FECHA DE INSTALACIÓN
    # ======================================================

    fecha_instalacion: Mapped[date | None] = mapped_column(
        Date,
        nullable=True
    )

    # ======================================================
    # CANTIDAD ACTUAL DE MARCOS
    # ======================================================
    # RF-25 / RF-40 / RF-41
    #
    # Este campo representa cuántos marcos tiene actualmente
    # la colmena.
    #
    # Permitirá:
    # - registrar los marcos disponibles;
    # - validar transferencias;
    # - descontar marcos de la colmena origen;
    # - sumar marcos a la colmena destino.
    #
    # El valor inicial es 0 para mantener compatibilidad con
    # las colmenas antiguas que ya existen en la base.
    # ======================================================

    cantidad_marcos: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0")
    )

    # ======================================================
    # OBSERVACIONES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
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