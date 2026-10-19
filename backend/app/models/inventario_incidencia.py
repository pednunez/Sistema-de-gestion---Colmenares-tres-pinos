
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
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# INCIDENCIAS Y REPARACIONES DEL INVENTARIO
# COLMENARES TRES PINOS
# ==========================================================
#
# Permite registrar materiales DANADOS o ROTOS.
#
# Cada incidencia puede representar:
# - Una pieza individual.
# - Un lote de varias piezas del mismo material.
#
# Conserva el historial de:
# - Cantidad afectada originalmente.
# - Cantidad pendiente de reparacion.
# - Cantidad en reparacion.
# - Cantidad reparada.
# - Cantidad dada de baja.
#
# Las cantidades reparadas y dadas de baja son
# resultados historicos de la incidencia.
# NO deben sumarse nuevamente al stock general.
# ==========================================================


class InventarioIncidencia(Base):

    __tablename__ = "inventario_incidencias"

    __table_args__ = (

        # Materiales permitidos.
        CheckConstraint(
            "material IN ("
            "'MARCO', 'ALZA', 'CAJON', 'TAPA', "
            "'TECHO_LATA', 'TECHO_AMERICANO')",
            name="ck_inv_incidencia_material",
        ),

        # Diferenciar dano de rotura.
        CheckConstraint(
            "tipo_dano IN ('DANADO', 'ROTO')",
            name="ck_inv_incidencia_tipo_dano",
        ),

        # Ubicacion donde se detecto el problema.
        CheckConstraint(
            "ubicacion_detectada IN ('BODEGA', 'INSTALADO')",
            name="ck_inv_incidencia_ubicacion",
        ),

        # Si estaba instalado, debe indicar colmena.
        CheckConstraint(
            "("
            "ubicacion_detectada = 'BODEGA' "
            "AND colmena_detectada_id IS NULL"
            ") OR ("
            "ubicacion_detectada = 'INSTALADO' "
            "AND colmena_detectada_id IS NOT NULL"
            ")",
            name="ck_inv_incidencia_colmena",
        ),

        # Cantidad afectada obligatoriamente positiva.
        CheckConstraint(
            "cantidad_afectada > 0",
            name="ck_inv_incidencia_afectada",
        ),

        # Ninguna cantidad puede ser negativa.
        CheckConstraint(
            "cantidad_pendiente >= 0 "
            "AND cantidad_en_reparacion >= 0 "
            "AND cantidad_reparada >= 0 "
            "AND cantidad_baja >= 0",
            name="ck_inv_incidencia_no_negativa",
        ),

        # Todas las cantidades deben cuadrar.
        CheckConstraint(
            "cantidad_pendiente + "
            "cantidad_en_reparacion + "
            "cantidad_reparada + "
            "cantidad_baja = cantidad_afectada",
            name="ck_inv_incidencia_balance",
        ),

        Index(
            "idx_inv_incidencia_material",
            "material",
        ),

        Index(
            "idx_inv_incidencia_colmena",
            "colmena_detectada_id",
        ),

        Index(
            "idx_inv_incidencia_fecha",
            "fecha_deteccion",
        ),
    )

    # ======================================================
    # IDENTIFICADOR UNICO DE LA INCIDENCIA
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    # ======================================================
    # MATERIAL AFECTADO
    # ======================================================

    material: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # ======================================================
    # DANADO O ROTO
    # ======================================================

    tipo_dano: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # UBICACION DONDE SE DETECTO EL DANO
    # ======================================================

    ubicacion_detectada: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    colmena_detectada_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    # ======================================================
    # CANTIDAD AFECTADA ORIGINALMENTE
    # ======================================================

    cantidad_afectada: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # CANTIDADES SEGUN AVANCE DE REPARACION
    # ======================================================

    cantidad_pendiente: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    cantidad_en_reparacion: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    cantidad_reparada: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    cantidad_baja: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    # ======================================================
    # DESCRIPCION DEL PROBLEMA
    # ======================================================

    descripcion_dano: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # ======================================================
    # DETALLE DE REPARACIONES REALIZADAS
    # ======================================================

    detalle_reparacion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ======================================================
    # USUARIO QUE REGISTRO LA INCIDENCIA
    # ======================================================

    usuario_reporte_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    # ======================================================
    # FECHAS
    # ======================================================

    fecha_deteccion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    fecha_cierre: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
