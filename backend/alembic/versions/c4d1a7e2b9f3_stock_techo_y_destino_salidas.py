"""Agregar TECHO al catalogo y destino de las salidas de stock.

Revision ID: c4d1a7e2b9f3
Revises: b7f2c8e90a41

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "c4d1a7e2b9f3"

down_revision: Union[str, Sequence[str], None] = (
    "b7f2c8e90a41"
)

branch_labels = None
depends_on = None


# ==========================================================
# CATALOGOS
# ==========================================================

MATERIALES_GENERALES_ANTERIORES = (
    "MARCO",
    "ALZA",
    "CAJON",
    "TAPA",
    "TECHO_LATA",
    "TECHO_AMERICANO",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "ENTRETAPA",
    "PISO",
)

MATERIALES_GENERALES = (
    MATERIALES_GENERALES_ANTERIORES + ("TECHO",)
)

MATERIALES_STOCK_ANTERIORES = (
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
)

# Se agregan CAJON y TECHO al modulo Stock.
MATERIALES_STOCK = (
    MATERIALES_STOCK_ANTERIORES + ("CAJON", "TECHO")
)


def condicion_materiales(materiales):
    """Construye el CHECK SQL para los materiales."""

    valores = ", ".join(
        f"'{material}'"
        for material in materiales
    )

    return f"material IN ({valores})"


RESTRICCIONES = (
    ("inventario_stock", "ck_inventario_material", "general"),
    ("inventario_movimientos", "ck_inv_mov_material", "general"),
    ("inventario_incidencias", "ck_inv_incidencia_material", "general"),
    ("stock_minimos", "ck_stock_minimos_material", "stock"),
)


def reemplazar_restricciones(general, stock) -> None:
    for tabla, restriccion, catalogo in RESTRICCIONES:

        op.drop_constraint(
            restriccion,
            tabla,
            type_="check",
        )

        op.create_check_constraint(
            restriccion,
            tabla,
            condicion_materiales(
                general if catalogo == "general" else stock
            ),
        )


# ==========================================================
# UPGRADE
# ==========================================================

def upgrade() -> None:
    """Amplia el catalogo y guarda el destino de ENVIO."""

    reemplazar_restricciones(
        MATERIALES_GENERALES,
        MATERIALES_STOCK,
    )

    # Destino informado en una salida de bodega.
    # Es solo referencia: no suma stock en el destino.
    op.add_column(
        "inventario_movimientos",
        sa.Column(
            "salida_apiario_id",
            sa.BigInteger(),
            nullable=True,
        ),
    )

    op.add_column(
        "inventario_movimientos",
        sa.Column(
            "salida_colmena_id",
            sa.BigInteger(),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_inv_mov_salida_apiario",
        "inventario_movimientos",
        "apiarios",
        ["salida_apiario_id"],
        ["id"],
    )

    op.create_foreign_key(
        "fk_inv_mov_salida_colmena",
        "inventario_movimientos",
        "colmenas",
        ["salida_colmena_id"],
        ["id"],
    )


# ==========================================================
# DOWNGRADE
# ==========================================================

def downgrade() -> None:
    """Revierte solo si no se perderan datos."""

    conexion = op.get_bind()

    con_destino = conexion.scalar(
        sa.text(
            "SELECT COUNT(*) FROM inventario_movimientos "
            "WHERE salida_apiario_id IS NOT NULL "
            "OR salida_colmena_id IS NOT NULL"
        )
    )

    if con_destino:
        raise RuntimeError(
            "No se puede revertir: existen salidas "
            "con destino registrado."
        )

    for tabla, _, catalogo in RESTRICCIONES:

        anteriores = (
            MATERIALES_GENERALES_ANTERIORES
            if catalogo == "general"
            else MATERIALES_STOCK_ANTERIORES
        )

        cantidad_nuevos = conexion.scalar(
            sa.text(
                f"SELECT COUNT(*) FROM {tabla} "
                f"WHERE NOT ({condicion_materiales(anteriores)})"
            )
        )

        if cantidad_nuevos:
            raise RuntimeError(
                "No se puede revertir: existen "
                f"materiales nuevos en {tabla}."
            )

    op.drop_constraint(
        "fk_inv_mov_salida_colmena",
        "inventario_movimientos",
        type_="foreignkey",
    )

    op.drop_constraint(
        "fk_inv_mov_salida_apiario",
        "inventario_movimientos",
        type_="foreignkey",
    )

    op.drop_column("inventario_movimientos", "salida_colmena_id")
    op.drop_column("inventario_movimientos", "salida_apiario_id")

    reemplazar_restricciones(
        MATERIALES_GENERALES_ANTERIORES,
        MATERIALES_STOCK_ANTERIORES,
    )
