from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# MODELO: SESION DE REVISION POR GRUPO (D-07 / S2-T16)
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================
#
# Recorrido en terreno de las colmenas de un grupo,
# "Colmena n de 5" con "Guardar y siguiente". El sistema no
# obliga a completar el grupo: se puede omitir una colmena y
# finalizar con colmenas pendientes.
# ==========================================================

class SesionRevision(Base):

    __tablename__ = "sesiones_revision"

    __table_args__ = (
        CheckConstraint(
            "estado IN ('EN_CURSO', 'FINALIZADA')",
            name="ck_sesiones_revision_estado",
        ),
        Index("idx_sesiones_revision_grupo", "grupo_id"),
        Index("uq_sesiones_revision_id_cliente", "id_cliente", unique=True),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    apiario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("apiarios.id"),
        nullable=False,
    )

    grupo_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("grupos_colmenas.id"),
        nullable=False,
    )

    # Responsable de la revision.
    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="EN_CURSO",
        server_default=text("'EN_CURSO'"),
    )

    # UUID del telefono para sincronizar sin duplicar.
    id_cliente: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )

    fecha_inicio: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    fecha_fin: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


# ==========================================================
# MODELO: COLMENA DENTRO DE UNA SESION
# ==========================================================
#
# La lista se fija al iniciar la sesion, en orden de codigo:
# reasignar colmenas del grupo despues no cambia el recorrido.
# ==========================================================

class SesionRevisionColmena(Base):

    __tablename__ = "sesiones_revision_colmenas"

    __table_args__ = (
        CheckConstraint(
            "estado IN ('PENDIENTE', 'REVISADA', 'OMITIDA')",
            name="ck_sesiones_revision_colmenas_estado",
        ),
        UniqueConstraint(
            "sesion_id",
            "colmena_id",
            name="uq_sesiones_revision_colmena",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    sesion_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("sesiones_revision.id"),
        nullable=False,
    )

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False,
    )

    # Posicion en el recorrido, desde 1.
    orden: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDIENTE",
        server_default=text("'PENDIENTE'"),
    )

    inspeccion_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("inspecciones.id"),
        nullable=True,
    )

    motivo_omision: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    fecha_actualizacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
