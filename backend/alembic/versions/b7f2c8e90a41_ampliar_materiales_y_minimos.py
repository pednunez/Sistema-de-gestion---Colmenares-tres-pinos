
"""Ampliar materiales y agregar minimos de stock.

Revision ID: b7f2c8e90a41
Revises: 38c8b966d855

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "b7f2c8e90a41"

down_revision: Union[str, Sequence[str], None] = (
    "38c8b966d855"
)

branch_labels = None
depends_on = None


# ==========================================================
# CATALOGO ORIGINAL
# Se conserva por compatibilidad con el inventario general.
# ==========================================================

MATERIALES_ORIGINALES = (
    "MARCO",
    "ALZA",
    "CAJON",
    "TAPA",
    "TECHO_LATA",
    "TECHO_AMERICANO",
)


# ==========================================================
# SIETE MATERIALES DEL FRONTEND DE PEDRO
# ==========================================================

MATERIALES_STOCK = (
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
)


# ==========================================================
# CATALOGO GENERAL, SIN DUPLICADOS
# ==========================================================

MATERIALES_GENERALES = tuple(
    dict.fromkeys(
        MATERIALES_ORIGINALES + MATERIALES_STOCK
    )
)


def condicion_materiales(materiales):
    """Construye el CHECK SQL para los materiales."""

    valores = ", ".join(
        f"'{material}'"
        for material in materiales
    )

    return f"material IN ({valores})"


# ==========================================================
# RESTRICCIONES EXISTENTES DE POSTGRESQL
# ==========================================================

RESTRICCIONES = (
    ("inventario_stock", "ck_inventario_material"),
    ("inventario_movimientos", "ck_inv_mov_material"),
    ("inventario_incidencias", "ck_inv_incidencia_material"),
)


# ==========================================================
# UPGRADE
# ==========================================================

def upgrade() -> None:
    """Amplia catalogo y crea configuracion de minimos."""

    # 1. Actualizar restricciones de las tres tablas.
    # Se conservan los materiales originales.

    condicion = condicion_materiales(
        MATERIALES_GENERALES
    )

    for tabla, restriccion in RESTRICCIONES:

        op.drop_constraint(
            restriccion,
            tabla,
            type_="check",
        )

        op.create_check_constraint(
            restriccion,
            tabla,
            condicion,
        )

    # 2. Crear tabla de minimos de bodega.
    #
    # No contiene cantidades disponibles.
    # Es solo una configuracion por material.

    op.create_table(
        "stock_minimos",

        sa.Column(
            "material",
            sa.String(length=30),
            nullable=False,
        ),

        sa.Column(
            "minimo",
            sa.Integer(),
            nullable=False,
        ),

        sa.Column(
            "actualizado_en",
            sa.DateTime(timezone=True),
            server_default=sa.text(
                "CURRENT_TIMESTAMP"
            ),
            nullable=False,
        ),

        sa.PrimaryKeyConstraint(
            "material",
        ),

        sa.CheckConstraint(
            condicion_materiales(
                MATERIALES_STOCK
            ),
            name="ck_stock_minimos_material",
        ),

        sa.CheckConstraint(
            "minimo >= 0",
            name="ck_stock_minimos_no_negativo",
        ),
    )


# ==========================================================
# DOWNGRADE
# ==========================================================

def downgrade() -> None:
    """Revierte solo si no se perderan datos."""

    conexion = op.get_bind()

    # No eliminar minimos ya configurados sin avisar.

    cantidad_minimos = conexion.scalar(
        sa.text(
            "SELECT COUNT(*) FROM stock_minimos"
        )
    )

    if cantidad_minimos:
        raise RuntimeError(
            "No se puede revertir: existen "
            "minimos configurados en stock_minimos."
        )

    # No restaurar el catalogo antiguo si ya existen
    # materiales nuevos registrados en alguna tabla.

    condicion_antigua = condicion_materiales(
        MATERIALES_ORIGINALES
    )

    for tabla, _ in RESTRICCIONES:

        cantidad_nuevos = conexion.scalar(
            sa.text(
                f"SELECT COUNT(*) FROM {tabla} "
                f"WHERE NOT ({condicion_antigua})"
            )
        )

        if cantidad_nuevos:
            raise RuntimeError(
                "No se puede revertir: existen "
                f"materiales nuevos en {tabla}."
            )

    op.drop_table("stock_minimos")

    # Restaurar las restricciones originales.

    for tabla, restriccion in RESTRICCIONES:

        op.drop_constraint(
            restriccion,
            tabla,
            type_="check",
        )

        op.create_check_constraint(
            restriccion,
            tabla,
            condicion_antigua,
        )
