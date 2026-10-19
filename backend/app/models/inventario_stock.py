
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# INVENTARIO GENERAL - COLMENARES TRES PINOS
# ==========================================================
# Cada registro representa una cantidad de materiales
# de un tipo, en una ubicacion y en una condicion.
#
# Ejemplo:
# MARCO / BODEGA / BUENO / 50
# MARCO / INSTALADO / BUENO / COLMENA 15 / 10
#
# Una pieza solo pertenece a una ubicacion y estado.
# ==========================================================


class InventarioStock(Base):

    __tablename__ = "inventario_stock"

    __table_args__ = (
        CheckConstraint(
            "material IN ("
            "'MARCO', 'ALZA', 'CAJON', 'TAPA', "
            "'TECHO_LATA', 'TECHO_AMERICANO')",
            name="ck_inventario_material",
        ),
        CheckConstraint(
            "ubicacion IN ('BODEGA', 'INSTALADO')",
            name="ck_inventario_ubicacion",
        ),
        CheckConstraint(
            "estado IN ("
            "'BUENO', 'DANADO', 'ROTO', "
            "'EN_REPARACION', 'REPARADO')",
            name="ck_inventario_estado",
        ),
        CheckConstraint(
            "cantidad >= 0",
            name="ck_inventario_cantidad_no_negativa",
        ),
        CheckConstraint(
            "("
            "ubicacion = 'BODEGA' AND colmena_id IS NULL"
            ") OR ("
            "ubicacion = 'INSTALADO' AND colmena_id IS NOT NULL"
            ")",
            name="ck_inventario_ubicacion_colmena",
        ),
        Index(
            "uq_inventario_bodega_material_estado",
            "material",
            "estado",
            unique=True,
            postgresql_where=text("ubicacion = 'BODEGA'"),
        ),
        Index(
            "uq_inventario_instalado_material_estado_colmena",
            "material",
            "estado",
            "colmena_id",
            unique=True,
            postgresql_where=text("ubicacion = 'INSTALADO'"),
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    material: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    ubicacion: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    colmena_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    cantidad: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
