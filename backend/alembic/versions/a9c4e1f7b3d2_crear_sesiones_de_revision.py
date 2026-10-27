"""Crear sesiones de revision por grupo (D-07 / S2-T16).

Revision ID: a9c4e1f7b3d2
Revises: f2b8d4e6a9c1

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING

Crea sesiones_revision y sesiones_revision_colmenas y da a la cuenta
de la app (colmenares_app) los mismos permisos que en el resto de las
tablas, si el rol existe.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "a9c4e1f7b3d2"

down_revision: Union[str, Sequence[str], None] = (
    "f2b8d4e6a9c1"
)

branch_labels = None
depends_on = None


ROL_APP = "colmenares_app"

TABLAS = ("sesiones_revision", "sesiones_revision_colmenas")


def _para_rol(sentencia: str) -> str:
    return (
        "DO $$ BEGIN "
        f"IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{ROL_APP}') THEN "
        f"{sentencia}; "
        "END IF; "
        "END $$"
    )


def upgrade() -> None:

    op.create_table(
        "sesiones_revision",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("apiario_id", sa.BigInteger(), nullable=False),
        sa.Column("grupo_id", sa.BigInteger(), nullable=False),
        sa.Column("usuario_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "estado",
            sa.String(length=20),
            server_default=sa.text("'EN_CURSO'"),
            nullable=False,
        ),
        sa.Column("id_cliente", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "fecha_inicio",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("fecha_fin", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "estado IN ('EN_CURSO', 'FINALIZADA')",
            name="ck_sesiones_revision_estado",
        ),
        sa.ForeignKeyConstraint(["apiario_id"], ["apiarios.id"]),
        sa.ForeignKeyConstraint(["grupo_id"], ["grupos_colmenas.id"]),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_sesiones_revision_grupo", "sesiones_revision", ["grupo_id"])
    op.create_index(
        "uq_sesiones_revision_id_cliente",
        "sesiones_revision",
        ["id_cliente"],
        unique=True,
    )

    op.create_table(
        "sesiones_revision_colmenas",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("sesion_id", sa.BigInteger(), nullable=False),
        sa.Column("colmena_id", sa.BigInteger(), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.Column(
            "estado",
            sa.String(length=20),
            server_default=sa.text("'PENDIENTE'"),
            nullable=False,
        ),
        sa.Column("inspeccion_id", sa.BigInteger(), nullable=True),
        sa.Column("motivo_omision", sa.Text(), nullable=True),
        sa.Column("fecha_actualizacion", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "estado IN ('PENDIENTE', 'REVISADA', 'OMITIDA')",
            name="ck_sesiones_revision_colmenas_estado",
        ),
        sa.ForeignKeyConstraint(["sesion_id"], ["sesiones_revision.id"]),
        sa.ForeignKeyConstraint(["colmena_id"], ["colmenas.id"]),
        sa.ForeignKeyConstraint(["inspeccion_id"], ["inspecciones.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sesion_id", "colmena_id", name="uq_sesiones_revision_colmena"),
    )

    for tabla in TABLAS:
        op.execute(
            _para_rol(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tabla} TO {ROL_APP}")
        )


def downgrade() -> None:
    """Revierte solo si no se perderan datos."""

    conexion = op.get_bind()

    if conexion.scalar(sa.text("SELECT COUNT(*) FROM sesiones_revision")):
        raise RuntimeError(
            "No se puede revertir: existen sesiones de revisión registradas."
        )

    op.drop_table("sesiones_revision_colmenas")
    op.drop_table("sesiones_revision")
