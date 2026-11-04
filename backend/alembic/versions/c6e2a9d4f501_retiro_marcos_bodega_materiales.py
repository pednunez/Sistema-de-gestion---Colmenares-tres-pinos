
"""S3-T05: retiro de marcos a bodega y nuevos materiales."""

from alembic import op
import sqlalchemy as sa


revision = "c6e2a9d4f501"
down_revision = "b3d7f9a2c5e8"
branch_labels = None
depends_on = None


NUEVOS = (
    "MARCO_CERA_ESTAMPADA",
    "MARCO_MIEL",
)

GENERAL_ANTERIOR = (
    "MARCO",
    "ALZA",
    "CAJON",
    "TAPA",
    "TECHO_LATA",
    "TECHO",
    "TECHO_AMERICANO",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "ENTRETAPA",
    "PISO",
)

STOCK_ANTERIOR = (
    "CAJON",
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
)

RESTRICCIONES = (
    ("inventario_stock", "ck_inventario_material", "general"),
    ("inventario_movimientos", "ck_inv_mov_material", "general"),
    ("inventario_incidencias", "ck_inv_incidencia_material", "general"),
    ("stock_minimos", "ck_stock_minimos_material", "stock"),
)


def condicion_materiales(materiales):
    valores = ", ".join(
        f"'{material}'"
        for material in materiales
    )
    return f"material IN ({valores})"


def actualizar_restricciones(general, stock):
    for tabla, restriccion, catalogo in RESTRICCIONES:
        op.drop_constraint(
            restriccion,
            tabla,
            type_="check",
        )

        materiales = (
            general if catalogo == "general" else stock
        )

        op.create_check_constraint(
            restriccion,
            tabla,
            condicion_materiales(materiales),
        )


def upgrade():
    op.add_column(
        "inspeccion_marcos",
        sa.Column(
            "retirar_a_bodega",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.create_check_constraint(
        "ck_inspeccion_marco_retiro_bodega",
        "inspeccion_marcos",
        "NOT retirar_a_bodega OR ("
        "contenido IN ("
        "'SOLO_MIEL', "
        "'CERA_ESTIRADA', "
        "'CERA_ESTAMPADA', "
        "'CERA_UNTADA'"
        ") AND transferido_a_colmena_id IS NULL"
        ")",
    )

    actualizar_restricciones(
        GENERAL_ANTERIOR + NUEVOS,
        STOCK_ANTERIOR + NUEVOS,
    )


def downgrade():
    conexion = op.get_bind()

    retiros = conexion.scalar(
        sa.text(
            "SELECT COUNT(*) FROM inspeccion_marcos "
            "WHERE retirar_a_bodega = TRUE"
        )
    )

    if retiros:
        raise RuntimeError(
            "Existen retiros historicos a bodega"
        )

    for tabla, _, _ in RESTRICCIONES:
        cantidad = conexion.scalar(
            sa.text(
                f"SELECT COUNT(*) FROM {tabla} "
                "WHERE material IN ("
                "'MARCO_CERA_ESTAMPADA', 'MARCO_MIEL'"
                ")"
            )
        )

        if cantidad:
            raise RuntimeError(
                f"Existen materiales nuevos en {tabla}"
            )

    actualizar_restricciones(
        GENERAL_ANTERIOR,
        STOCK_ANTERIOR,
    )

    op.drop_constraint(
        "ck_inspeccion_marco_retiro_bodega",
        "inspeccion_marcos",
        type_="check",
    )

    op.drop_column(
        "inspeccion_marcos",
        "retirar_a_bodega",
    )
