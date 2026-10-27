"""Crear grupos o filas de colmenas e historial de asignaciones.

Revision ID: d5e2f8a1c6b4
Revises: c4d1a7e2b9f3

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "d5e2f8a1c6b4"

down_revision: Union[str, Sequence[str], None] = (
    "c4d1a7e2b9f3"
)

branch_labels = None
depends_on = None


# ==========================================================
# UPGRADE
# ==========================================================

def upgrade() -> None:
    """Crea grupos por apiario y el historial de asignaciones."""

    op.create_table(
        "grupos_colmenas",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            nullable=False,
        ),
        sa.Column("apiario_id", sa.BigInteger(), nullable=False),
        sa.Column("nombre", sa.String(length=60), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column(
            "activo",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "fecha_creacion",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "fecha_actualizacion",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "fecha_eliminacion",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["apiario_id"], ["apiarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_grupos_apiario",
        "grupos_colmenas",
        ["apiario_id"],
    )

    # Nombre unico sin distinguir mayusculas, solo entre
    # los grupos activos del mismo apiario.
    op.create_index(
        "uq_grupos_apiario_nombre_activo",
        "grupos_colmenas",
        ["apiario_id", sa.text("lower(nombre)")],
        unique=True,
        postgresql_where=sa.text("activo"),
    )

    op.create_table(
        "grupos_colmenas_asignaciones",
        sa.Column(
            "id",
            sa.BigInteger(),
            sa.Identity(always=True),
            nullable=False,
        ),
        sa.Column("grupo_id", sa.BigInteger(), nullable=False),
        sa.Column("colmena_id", sa.BigInteger(), nullable=False),
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "fecha_asignacion",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "fecha_retiro",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(["grupo_id"], ["grupos_colmenas.id"]),
        sa.ForeignKeyConstraint(["colmena_id"], ["colmenas.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_grupos_asignaciones_grupo",
        "grupos_colmenas_asignaciones",
        ["grupo_id"],
    )

    # Una colmena tiene a lo sumo una asignacion vigente.
    op.create_index(
        "uq_grupos_asignacion_vigente_colmena",
        "grupos_colmenas_asignaciones",
        ["colmena_id"],
        unique=True,
        postgresql_where=sa.text("fecha_retiro IS NULL"),
    )


# ==========================================================
# DOWNGRADE
# ==========================================================

def downgrade() -> None:
    """Revierte solo si no se perderan datos."""

    conexion = op.get_bind()

    cantidad = conexion.scalar(
        sa.text("SELECT COUNT(*) FROM grupos_colmenas")
    )

    if cantidad:
        raise RuntimeError(
            "No se puede revertir: existen grupos registrados."
        )

    op.drop_table("grupos_colmenas_asignaciones")
    op.drop_table("grupos_colmenas")
