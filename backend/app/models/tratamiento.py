from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# MODELO: TRATAMIENTOS
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================

class Tratamiento(Base):

    __tablename__ = "tratamientos"

    # ======================================================
    # INDICES EXISTENTES EN POSTGRESQL
    # ======================================================

    __table_args__ = (
        Index(
            "idx_tratamientos_colmena",
            "colmena_id",
        ),
        Index(
            "idx_tratamientos_fecha",
            "fecha_inicio",
        ),
        Index(
            "uq_tratamientos_id_cliente",
            "id_cliente",
            unique=True,
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
    # COLMENA QUE RECIBE EL TRATAMIENTO
    # ======================================================

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False,
    )

    # ======================================================
    # INSPECCION ASOCIADA (OPCIONAL)
    # ======================================================

    inspeccion_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("inspecciones.id"),
        nullable=True,
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
    # TIPO DE TRATAMIENTO
    # ======================================================

    tipo_tratamiento: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # ======================================================
    # PRODUCTO UTILIZADO
    # ======================================================

    producto: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True,
    )

    # ======================================================
    # DOSIS APLICADA
    # ======================================================

    dosis: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # ======================================================
    # MOTIVO DEL TRATAMIENTO
    # ======================================================

    motivo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ======================================================
    # FECHA DE INICIO
    # ======================================================

    fecha_inicio: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    # ======================================================
    # FECHA DE TERMINO (OPCIONAL)
    # ======================================================

    fecha_fin: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    # ======================================================
    # ESTADO DEL TRATAMIENTO
    # ======================================================

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="EN_CURSO",
        server_default=text("'EN_CURSO'"),
    )

    # ======================================================
    # OBSERVACIONES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ======================================================
    # ID GENERADO EN EL TELEFONO (SINCRONIZACION)
    # ======================================================
    #
    # La app movil lo envia al sincronizar. Si llega dos
    # veces, la API devuelve el registro ya creado.
    # ======================================================

    id_cliente: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
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
    # FECHA DE ACTUALIZACION
    # ======================================================

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )