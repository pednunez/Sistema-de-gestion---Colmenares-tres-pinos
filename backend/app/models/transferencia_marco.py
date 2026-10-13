
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# MODELO: TRANSFERENCIAS DE MARCOS
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================
#
# Registra los movimientos de marcos entre colmenas.
#
# Permite tanto:
# 1. Transferencias manuales independientes.
# 2. Transferencias originadas durante una inspección.
#
# Los campos asociados a una inspección son opcionales
# para mantener compatibles los registros históricos.
# ==========================================================


class TransferenciaMarco(Base):

    __tablename__ = "transferencias_marcos"

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
    )

    # ======================================================
    # COLMENA DE ORIGEN
    # ======================================================

    colmena_origen_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False,
    )

    # ======================================================
    # COLMENA DE DESTINO
    # ======================================================

    colmena_destino_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False,
    )

    # ======================================================
    # USUARIO RESPONSABLE
    # ======================================================

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    # ======================================================
    # INSPECCIÓN DE ORIGEN (OPCIONAL)
    # ======================================================
    #
    # NULL: transferencia manual o histórica.
    # ID: transferencia realizada durante una inspección.
    # ======================================================

    inspeccion_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("inspecciones.id"),
        nullable=True,
    )

    # ======================================================
    # FECHA DE TRANSFERENCIA
    # ======================================================

    fecha_transferencia: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # ======================================================
    # CANTIDAD DE MARCOS
    # ======================================================

    cantidad_marcos: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # TIPO GENERAL DEL MARCO
    # ======================================================
    #
    # CRIA / MIEL / POLEN / VACIO / OTRO
    # ======================================================

    tipo_marco: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ======================================================
    # DETALLE DEL MARCO TRANSFERIDO
    # ======================================================
    #
    # Ubicación:
    #   CAMARA_CRIA / ALZA
    #
    # Número:
    #   1 a 10
    #
    # Contenido:
    #   MIEL_Y_CRIA
    #   SOLO_CRIA
    #   SOLO_MIEL
    #   CERA_ESTIRADA
    #   CERA_ESTAMPADA
    #   CERA_UNTADA
    #   SIN_MARCO
    #
    # Son opcionales porque las transferencias manuales
    # existentes no necesariamente tienen este detalle.
    # ======================================================

    ubicacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    numero_marco: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    contenido: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ======================================================
    # MOTIVO
    # ======================================================

    motivo: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # ======================================================
    # OBSERVACIONES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ======================================================
    # FECHA DE CREACIÓN
    # ======================================================

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
