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


# ==========================================================
# MODELO: TRANSFERENCIAS DE MARCOS
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================
#
# Registra los movimientos de marcos realizados entre
# diferentes colmenas.
#
# Conserva el origen, destino, responsable, cantidad
# y características de la transferencia.
#
# Los campos específicos de la inspección se
# incorporarán posteriormente con otra migración.
# ==========================================================

class TransferenciaMarco(Base):

    __tablename__ = "transferencias_marcos"

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    # ======================================================
    # COLMENA DE ORIGEN
    # ======================================================

    colmena_origen_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    # ======================================================
    # COLMENA DE DESTINO
    # ======================================================

    colmena_destino_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    # ======================================================
    # USUARIO RESPONSABLE
    # ======================================================

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    # ======================================================
    # FECHA DE TRANSFERENCIA
    # ======================================================

    fecha_transferencia: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # CANTIDAD DE MARCOS TRANSFERIDOS
    # ======================================================

    cantidad_marcos: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    # ======================================================
    # TIPO DE MARCO
    # ======================================================
    #
    # CRIA
    # MIEL
    # POLEN
    # VACIO
    # OTRO
    # ======================================================

    tipo_marco: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True
    )

    # ======================================================
    # MOTIVO DE LA TRANSFERENCIA
    # ======================================================

    motivo: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    # ======================================================
    # OBSERVACIONES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # ======================================================
    # FECHA DE CREACIÓN
    # ======================================================

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )
