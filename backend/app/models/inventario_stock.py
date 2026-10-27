
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
#
# Cada registro representa una cantidad de materiales
# de un tipo, en una ubicacion y en una condicion.
#
# BODEGA:
# Material disponible o danado en bodega.
#
# INSTALADO:
# Material asignado a una colmena.
#
# Un mismo material no debe contarse dos veces.
# ==========================================================


class InventarioStock(Base):

    __tablename__ = "inventario_stock"

    __table_args__ = (

        # ==================================================
        # MATERIALES PERMITIDOS
        # ==================================================
        #
        # Se conservan los seis materiales originales.
        # Se incorporan cinco materiales nuevos.
        #
        # Total: 11 identificadores permitidos.
        #
        # Esta restriccion debe coincidir con Alembic.
        # ==================================================

        CheckConstraint(
            "material IN ("
            "'MARCO', "
            "'ALZA', "
            "'CAJON', "
            "'TAPA', "
            "'TECHO_LATA', "
            "'TECHO', "
            "'TECHO_AMERICANO', "
            "'MARCO_VACIO', "
            "'MARCO_CERA_ESTIRADA', "
            "'MARCO_CERA_UNTADA', "
            "'ENTRETAPA', "
            "'PISO'"
            ")",
            name="ck_inventario_material",
        ),

        # ==================================================
        # UBICACIONES PERMITIDAS
        # ==================================================

        CheckConstraint(
            "ubicacion IN ('BODEGA', 'INSTALADO')",
            name="ck_inventario_ubicacion",
        ),

        # ==================================================
        # ESTADOS DE LOS MATERIALES
        # ==================================================

        CheckConstraint(
            "estado IN ("
            "'BUENO', "
            "'DANADO', "
            "'ROTO', "
            "'EN_REPARACION', "
            "'REPARADO'"
            ")",
            name="ck_inventario_estado",
        ),

        # ==================================================
        # EVITAR CANTIDADES NEGATIVAS
        # ==================================================

        CheckConstraint(
            "cantidad >= 0",
            name="ck_inventario_cantidad_no_negativa",
        ),

        # ==================================================
        # VALIDAR UBICACION Y COLMENA
        # ==================================================
        #
        # BODEGA:
        # No requiere identificador de colmena.
        #
        # INSTALADO:
        # Requiere una colmena existente.
        #
        # Los envios a un apiario sin colmena asignada
        # se resolveran en una etapa posterior.
        # ==================================================

        CheckConstraint(
            "("
            "ubicacion = 'BODEGA' "
            "AND colmena_id IS NULL"
            ") OR ("
            "ubicacion = 'INSTALADO' "
            "AND colmena_id IS NOT NULL"
            ")",
            name="ck_inventario_ubicacion_colmena",
        ),

        # ==================================================
        # EVITAR REGISTROS DUPLICADOS EN BODEGA
        # ==================================================
        #
        # Solo puede existir un registro por combinacion
        # de material y estado dentro de la bodega.
        # ==================================================

        Index(
            "uq_inventario_bodega_material_estado",
            "material",
            "estado",
            unique=True,
            postgresql_where=text(
                "ubicacion = 'BODEGA'"
            ),
        ),

        # ==================================================
        # EVITAR REGISTROS DUPLICADOS EN COLMENAS
        # ==================================================
        #
        # Cada colmena puede tener registros separados
        # por material y estado.
        # ==================================================

        Index(
            "uq_inventario_instalado_material_estado_colmena",
            "material",
            "estado",
            "colmena_id",
            unique=True,
            postgresql_where=text(
                "ubicacion = 'INSTALADO'"
            ),
        ),
    )

    # ======================================================
    # IDENTIFICADOR UNICO
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    # ======================================================
    # MATERIAL
    # ======================================================

    material: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # ======================================================
    # UBICACION ACTUAL
    # ======================================================

    ubicacion: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # COLMENA ASOCIADA
    # ======================================================

    colmena_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    # ======================================================
    # ESTADO DEL MATERIAL
    # ======================================================

    estado: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # CANTIDAD ACTUAL
    # ======================================================

    cantidad: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    # ======================================================
    # FECHA DE ACTUALIZACION
    # ======================================================

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
