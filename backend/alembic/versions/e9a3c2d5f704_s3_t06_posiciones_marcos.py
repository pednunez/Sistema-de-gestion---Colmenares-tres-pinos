"""S3-T06: estado de marcos por piso y detalle de transferencias.

Revision ID: e9a3c2d5f704
Revises: c6e2a9d4f501

IMPORTANTE: esta migracion no reconstruye posiciones historicas.
Las colmenas existentes requieren una inspeccion fiable antes
de habilitar transferencias con validacion de capacidad.
"""

from alembic import op
import sqlalchemy as sa


revision = "e9a3c2d5f704"
down_revision = "c6e2a9d4f501"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "colmena_marcos_estado",
        sa.Column(
            "colmena_id",
            sa.BigInteger(),
            sa.ForeignKey("colmenas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ubicacion", sa.String(length=20), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("contenido", sa.String(length=30), nullable=False),
        sa.Column(
            "fecha_actualizacion",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint(
            "colmena_id", "ubicacion", "numero",
            name="pk_colmena_marcos_estado",
        ),
        sa.CheckConstraint(
            "ubicacion IN ('CAMARA_CRIA', 'ALZA')",
            name="ck_colmena_marcos_estado_ubicacion",
        ),
        sa.CheckConstraint(
            "numero BETWEEN 1 AND 10",
            name="ck_colmena_marcos_estado_numero",
        ),
        sa.CheckConstraint(
            "contenido IN ("
            "'MIEL_Y_CRIA', 'SOLO_CRIA', 'SOLO_MIEL', "
            "'CERA_ESTIRADA', 'CERA_ESTAMPADA', "
            "'CERA_UNTADA', 'SIN_MARCO'"
            ")",
            name="ck_colmena_marcos_estado_contenido",
        ),
    )
    op.add_column(
        "transferencias_marcos",
        sa.Column("ubicacion_destino", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "transferencias_marcos",
        sa.Column("numero_destino", sa.Integer(), nullable=True),
    )
    op.add_column(
        "transferencias_marcos",
        sa.Column("marco_desplazado_numero", sa.Integer(), nullable=True),
    )
    op.add_column(
        "transferencias_marcos",
        sa.Column("contenido_desplazado", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "transferencias_marcos",
        sa.Column("accion_desplazado", sa.String(length=20), nullable=True),
    )
    op.create_check_constraint(
        "ck_transferencias_marcos_ubicacion_destino",
        "transferencias_marcos",
        "ubicacion_destino IS NULL OR "
        "ubicacion_destino IN ('CAMARA_CRIA', 'ALZA')",
    )
    op.create_check_constraint(
        "ck_transferencias_marcos_numero_destino",
        "transferencias_marcos",
        "numero_destino IS NULL OR numero_destino BETWEEN 1 AND 10",
    )
    op.create_check_constraint(
        "ck_transferencias_marcos_desplazado_numero",
        "transferencias_marcos",
        "marco_desplazado_numero IS NULL OR "
        "marco_desplazado_numero BETWEEN 1 AND 10",
    )
    op.create_check_constraint(
        "ck_transferencias_marcos_accion_desplazado",
        "transferencias_marcos",
        "accion_desplazado IS NULL OR "
        "accion_desplazado IN ('INTERCAMBIO', 'BODEGA')",
    )


def downgrade():
    op.drop_constraint(
        "ck_transferencias_marcos_accion_desplazado",
        "transferencias_marcos", type_="check",
    )
    op.drop_constraint(
        "ck_transferencias_marcos_desplazado_numero",
        "transferencias_marcos", type_="check",
    )
    op.drop_constraint(
        "ck_transferencias_marcos_numero_destino",
        "transferencias_marcos", type_="check",
    )
    op.drop_constraint(
        "ck_transferencias_marcos_ubicacion_destino",
        "transferencias_marcos", type_="check",
    )
    for columna in (
        "accion_desplazado",
        "contenido_desplazado",
        "marco_desplazado_numero",
        "numero_destino",
        "ubicacion_destino",
    ):
        op.drop_column("transferencias_marcos", columna)
    op.drop_table("colmena_marcos_estado")
