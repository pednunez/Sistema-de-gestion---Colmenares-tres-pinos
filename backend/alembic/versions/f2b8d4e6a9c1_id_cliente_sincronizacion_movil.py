"""Agregar id_cliente a inspecciones y tratamientos (sincronizacion movil).

Revision ID: f2b8d4e6a9c1
Revises: e7a3c9d2f1b5

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING

La app movil genera un UUID por registro y lo envia al sincronizar.
El indice unico permite responder el registro ya creado cuando la app
reintenta, sin duplicarlo. Los registros web quedan con NULL.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "f2b8d4e6a9c1"

down_revision: Union[str, Sequence[str], None] = (
    "e7a3c9d2f1b5"
)

branch_labels = None
depends_on = None


TABLAS = (
    ("inspecciones", "uq_inspecciones_id_cliente"),
    ("tratamientos", "uq_tratamientos_id_cliente"),
)


def upgrade() -> None:
    for tabla, indice in TABLAS:
        op.add_column(
            tabla,
            sa.Column(
                "id_cliente",
                postgresql.UUID(as_uuid=True),
                nullable=True,
            ),
        )
        op.create_index(indice, tabla, ["id_cliente"], unique=True)


def downgrade() -> None:
    for tabla, indice in TABLAS:
        op.drop_index(indice, table_name=tabla)
        op.drop_column(tabla, "id_cliente")
