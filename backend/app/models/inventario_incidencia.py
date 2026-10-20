
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
# Este modelo permite registrar materiales:
#
# - DANADOS
# - ROTOS
# - EN REPARACION
# - REPARADOS
# - DADOS DE BAJA
#
# Una incidencia puede representar:
#
# 1. Una pieza individual.
# 2. Un lote de varias piezas del mismo material.
#
# El historial debe conservarse para mantener
# la trazabilidad de los materiales.
#
# IMPORTANTE:
# Las cantidades reparadas y dadas de baja son
# resultados historicos de la incidencia.
# No deben sumarse nuevamente al stock general.
# ==========================================================


class InventarioIncidencia(Base):

    __tablename__ = "inventario_incidencias"

    __table_args__ = (

        # ==================================================
        # MATERIALES PERMITIDOS
        # ==================================================
        #
        # Conservamos los seis materiales anteriores.
        # Incorporamos cinco nuevos materiales.
        #
        # Total: 11 identificadores permitidos.
        #
        # Esta restriccion debe coincidir con:
        #
        # - inventario_stock.py
        # - inventario_movimiento.py
        # - Migracion Alembic
        # ==================================================

        CheckConstraint(
            "material IN ("
            "'MARCO', "
            "'ALZA', "
            "'CAJON', "
            "'TAPA', "
            "'TECHO_LATA', "
            "'TECHO_AMERICANO', "
            "'MARCO_VACIO', "
            "'MARCO_CERA_ESTIRADA', "
            "'MARCO_CERA_UNTADA', "
            "'ENTRETAPA', "
            "'PISO'"
            ")",
            name="ck_inv_incidencia_material",
        ),

        # ==================================================
        # TIPO DE DANO
        # ==================================================
        #
        # DANADO:
        # Material deteriorado.
        #
        # ROTO:
        # Material con rotura.
        # ==================================================

        CheckConstraint(
            "tipo_dano IN ('DANADO', 'ROTO')",
            name="ck_inv_incidencia_tipo_dano",
        ),

        # ==================================================
        # UBICACION DONDE SE DETECTO EL DANO
        # ==================================================

        CheckConstraint(
            "ubicacion_detectada IN ("
            "'BODEGA', 'INSTALADO'"
            ")",
            name="ck_inv_incidencia_ubicacion",
        ),

        # ==================================================
        # VALIDAR UBICACION Y COLMENA
        # ==================================================
        #
        # Si se detecta en BODEGA:
        # No necesita identificador de colmena.
        #
        # Si se detecta INSTALADO:
        # Se debe identificar la colmena.
        # ==================================================

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

        # ==================================================
        # CANTIDAD AFECTADA POSITIVA
        # ==================================================

        CheckConstraint(
            "cantidad_afectada > 0",
            name="ck_inv_incidencia_afectada",
        ),

        # ==================================================
        # EVITAR CANTIDADES NEGATIVAS
        # ==================================================

        CheckConstraint(
            "cantidad_pendiente >= 0 "
            "AND cantidad_en_reparacion >= 0 "
            "AND cantidad_reparada >= 0 "
            "AND cantidad_baja >= 0",
            name="ck_inv_incidencia_no_negativa",
        ),

        # ==================================================
        # VALIDAR BALANCE DE LA INCIDENCIA
        # ==================================================
        #
        # La suma de las cantidades registradas
        # debe coincidir con la cantidad afectada.
        #
        # Ejemplo:
        #
        # Cantidad afectada: 10
        # Pendiente: 4
        # En reparacion: 2
        # Reparada: 3
        # Baja: 1
        #
        # Total: 10
        # ==================================================

        CheckConstraint(
            "cantidad_pendiente + "
            "cantidad_en_reparacion + "
            "cantidad_reparada + "
            "cantidad_baja = cantidad_afectada",
            name="ck_inv_incidencia_balance",
        ),

        # ==================================================
        # INDICES PARA CONSULTAS
        # ==================================================

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
    # IDENTIFICADOR UNICO
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
    # TIPO DE DANO
    # ======================================================

    tipo_dano: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # UBICACION DONDE OCURRIO EL DANO
    # ======================================================

    ubicacion_detectada: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # COLMENA ASOCIADA
    # ======================================================

    colmena_detectada_id: Mapped[int | None] = (
        mapped_column(
            BigInteger,
            ForeignKey("colmenas.id"),
            nullable=True,
        )
    )

    # ======================================================
    # CANTIDAD ORIGINAL AFECTADA
    # ======================================================

    cantidad_afectada: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # CANTIDAD PENDIENTE DE REPARACION
    # ======================================================

    cantidad_pendiente: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # CANTIDAD ACTUALMENTE EN REPARACION
    # ======================================================

    cantidad_en_reparacion: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    # ======================================================
    # CANTIDAD REPARADA
    # ======================================================

    cantidad_reparada: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    # ======================================================
    # CANTIDAD DADA DE BAJA
    # ======================================================

    cantidad_baja: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )

    # ======================================================
    # DESCRIPCION DEL DANO
    # ======================================================

    descripcion_dano: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    # ======================================================
    # DETALLE DE LA REPARACION
    # ======================================================

    detalle_reparacion: Mapped[str | None] = (
        mapped_column(
            Text,
            nullable=True,
        )
    )

    # ======================================================
    # OBSERVACIONES ADICIONALES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ======================================================
    # USUARIO QUE REPORTA LA INCIDENCIA
    # ======================================================

    usuario_reporte_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    # ======================================================
    # FECHA DE DETECCION
    # ======================================================

    fecha_deteccion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # ======================================================
    # ULTIMA ACTUALIZACION
    # ======================================================

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ======================================================
    # FECHA DE CIERRE DE LA INCIDENCIA
    # ======================================================

    fecha_cierre: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
