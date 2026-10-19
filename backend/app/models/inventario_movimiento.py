
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
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# HISTORIAL DE MOVIMIENTOS DEL INVENTARIO
# COLMENARES TRES PINOS
# ==========================================================
#
# Cada registro describe un movimiento de materiales:
#
# INGRESO: material nuevo al inventario.
# RETIRO: material que sale del inventario.
# TRASLADO: bodega a colmena, colmena a bodega
#           o entre colmenas.
# DANAR: material pasa a estado DANADO.
# ROMPER: material pasa a estado ROTO.
# INICIAR_REPARACION: material pasa a EN_REPARACION.
# REPARAR: material vuelve a estar disponible.
# BAJA: material que deja de formar parte del stock.
# AJUSTE_INICIAL: registro del conteo inicial.
#
# Los movimientos no deben eliminarse, para conservar
# la trazabilidad.
# ==========================================================


class InventarioMovimiento(Base):

    __tablename__ = "inventario_movimientos"

    __table_args__ = (
        CheckConstraint(
            "cantidad > 0",
            name="ck_inv_mov_cantidad_positiva",
        ),
        CheckConstraint(
            "material IN ("
            "'MARCO', 'ALZA', 'CAJON', 'TAPA', "
            "'TECHO_LATA', 'TECHO_AMERICANO')",
            name="ck_inv_mov_material",
        ),
        CheckConstraint(
            "tipo_movimiento IN ("
            "'INGRESO', 'RETIRO', 'TRASLADO', "
            "'DANAR', 'ROMPER', 'INICIAR_REPARACION', "
            "'REPARAR', 'BAJA', 'AJUSTE_INICIAL')",
            name="ck_inv_mov_tipo",
        ),
        CheckConstraint(
            "origen_ubicacion IS NULL "
            "OR origen_ubicacion IN ('BODEGA', 'INSTALADO')",
            name="ck_inv_mov_origen_ubicacion",
        ),
        CheckConstraint(
            "destino_ubicacion IS NULL "
            "OR destino_ubicacion IN ('BODEGA', 'INSTALADO')",
            name="ck_inv_mov_destino_ubicacion",
        ),
        CheckConstraint(
            "origen_estado IS NULL OR origen_estado IN ("
            "'BUENO', 'DANADO', 'ROTO', "
            "'EN_REPARACION', 'REPARADO')",
            name="ck_inv_mov_origen_estado",
        ),
        CheckConstraint(
            "destino_estado IS NULL OR destino_estado IN ("
            "'BUENO', 'DANADO', 'ROTO', "
            "'EN_REPARACION', 'REPARADO')",
            name="ck_inv_mov_destino_estado",
        ),
        CheckConstraint(
            "("
            "origen_ubicacion IS NULL "
            "AND colmena_origen_id IS NULL"
            ") OR ("
            "origen_ubicacion = 'BODEGA' "
            "AND colmena_origen_id IS NULL"
            ") OR ("
            "origen_ubicacion = 'INSTALADO' "
            "AND colmena_origen_id IS NOT NULL"
            ")",
            name="ck_inv_mov_origen_colmena",
        ),
        CheckConstraint(
            "("
            "destino_ubicacion IS NULL "
            "AND colmena_destino_id IS NULL"
            ") OR ("
            "destino_ubicacion = 'BODEGA' "
            "AND colmena_destino_id IS NULL"
            ") OR ("
            "destino_ubicacion = 'INSTALADO' "
            "AND colmena_destino_id IS NOT NULL"
            ")",
            name="ck_inv_mov_destino_colmena",
        ),
        CheckConstraint(
            "origen_ubicacion IS NOT NULL "
            "OR destino_ubicacion IS NOT NULL",
            name="ck_inv_mov_requiere_ubicacion",
        ),
        Index(
            "idx_inv_mov_material",
            "material",
        ),
        Index(
            "idx_inv_mov_fecha",
            "fecha_creacion",
        ),
        Index(
            "idx_inv_mov_usuario",
            "usuario_id",
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

    tipo_movimiento: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    cantidad: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    origen_ubicacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    colmena_origen_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    origen_estado: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    destino_ubicacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    colmena_destino_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    destino_estado: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
