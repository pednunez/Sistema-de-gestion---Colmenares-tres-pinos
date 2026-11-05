
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Identity,
    Index,
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
# Permite:
# 1. Transferencias manuales independientes.
# 2. Transferencias originadas durante una inspeccion.
# 3. Identificar ubicaciones de origen y destino.
# 4. Registrar marcos desplazados.
# 5. Mantener la trazabilidad de los intercambios.
#
# Los campos opcionales mantienen compatibilidad
# con las transferencias historicas.
# ==========================================================


class TransferenciaMarco(Base):

    __tablename__ = "transferencias_marcos"

    # ======================================================
    # INDICES EXISTENTES EN POSTGRESQL
    # ======================================================

    __table_args__ = (
        Index(
            "idx_transferencia_destino",
            "colmena_destino_id",
        ),
        Index(
            "idx_transferencia_origen",
            "colmena_origen_id",
        ),
        Index(
            "ix_transferencias_marcos_inspeccion_id",
            "inspeccion_id",
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
    # INSPECCION DE ORIGEN (OPCIONAL)
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
    # UBICACION ORIGINAL DEL MARCO
    # ======================================================
    #
    # CAMARA_CRIA / ALZA
    # ======================================================

    ubicacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # ======================================================
    # NUMERO DEL MARCO EN ORIGEN
    # ======================================================

    numero_marco: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # ======================================================
    # CONTENIDO DEL MARCO TRANSFERIDO
    # ======================================================

    contenido: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ======================================================
    # MOTIVO DE TRANSFERENCIA
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
    # FECHA DE CREACION
    # ======================================================

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    # ======================================================
    # S3-T06 - UBICACION DEL MARCO EN EL DESTINO
    # ======================================================
    #
    # CAMARA_CRIA:
    # Marco instalado en la camara de cria.
    #
    # ALZA:
    # Marco instalado en el alza.
    #
    # None:
    # Transferencia historica sin detalle de destino.
    # ======================================================

    ubicacion_destino: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # ======================================================
    # S3-T06 - NUMERO DE POSICION EN DESTINO
    # ======================================================
    #
    # Posicion fisica del 1 al 10.
    # ======================================================

    numero_destino: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # ======================================================
    # S3-T06 - MARCO DESPLAZADO
    # ======================================================
    #
    # Identifica la posicion del marco que sale
    # del piso cuando se encuentra completo.
    #
    # None: no hubo desplazamiento.
    # ======================================================

    marco_desplazado_numero: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # ======================================================
    # S3-T06 - CONTENIDO DEL MARCO DESPLAZADO
    # ======================================================

    contenido_desplazado: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    # ======================================================
    # S3-T06 - ACCION DEL MARCO DESPLAZADO
    # ======================================================
    #
    # INTERCAMBIO:
    # El marco desplazado vuelve a la colmena origen.
    #
    # BODEGA:
    # El marco desplazado se registra en inventario.
    #
    # None:
    # No hubo desplazamiento.
    # ======================================================

    accion_desplazado: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
