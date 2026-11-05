from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# MODELO: GRUPO O FILA DE COLMENAS (PB-06)
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================
#
# Organiza las colmenas de un apiario para identificarlas
# en terreno. El nombre es unico entre los grupos activos
# del mismo apiario. La baja es logica.
# ==========================================================

class GrupoColmena(Base):

    __tablename__ = "grupos_colmenas"

    __table_args__ = (
        Index(
            "uq_grupos_apiario_nombre_activo",
            "apiario_id",
            func.lower(text("nombre")),
            unique=True,
            postgresql_where=text("activo"),
            sqlite_where=text("activo = 1"),
        ),
        Index(
            "idx_grupos_apiario",
            "apiario_id",
        ),
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

    nombre: Mapped[str] = mapped_column(
        String(60),
        nullable=False,
    )

    descripcion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    fecha_eliminacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


# ==========================================================
# MODELO: ASIGNACION DE UNA COLMENA A UN GRUPO
# ==========================================================
#
# Historial completo: al reasignar o retirar una colmena se
# completa fecha_retiro y nunca se borra la fila.
#
# Una colmena tiene a lo sumo una asignacion vigente
# (fecha_retiro IS NULL).
# ==========================================================

class GrupoColmenaAsignacion(Base):

    __tablename__ = "grupos_colmenas_asignaciones"

    __table_args__ = (
        Index(
            "uq_grupos_asignacion_vigente_colmena",
            "colmena_id",
            unique=True,
            postgresql_where=text("fecha_retiro IS NULL"),
            sqlite_where=text("fecha_retiro IS NULL"),
        ),
        Index(
            "idx_grupos_asignaciones_grupo",
            "grupo_id",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    grupo_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("grupos_colmenas.id"),
        nullable=False,
    )

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False,
    )

    # Quien asigno la colmena al grupo.
    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    fecha_asignacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    fecha_retiro: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
