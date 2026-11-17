"""S3-T07: registrar EXTRACCION como tipo de movimiento en inventario.

Revision ID: f4c9b7d2e601
Revises: e9a3c2d5f704
"""
from alembic import op
import sqlalchemy as sa

revision = "f4c9b7d2e601"
down_revision = "e9a3c2d5f704"
branch_labels = None
depends_on = None

ANTERIORES = (
    "INGRESO", "RETIRO", "TRASLADO", "DANAR", "ROMPER",
    "INICIAR_REPARACION", "REPARAR", "BAJA", "AJUSTE_INICIAL",
)

def condicion(tipos):
    return "tipo_movimiento IN (" + ", ".join(f"'{tipo}'" for tipo in tipos) + ")"

def upgrade():
    op.drop_constraint("ck_inv_mov_tipo", "inventario_movimientos", type_="check")
    op.create_check_constraint(
        "ck_inv_mov_tipo", "inventario_movimientos",
        condicion(ANTERIORES + ("EXTRACCION",)),
    )

def downgrade():
    connection = op.get_bind()
    cantidad = connection.scalar(sa.text(
        "SELECT COUNT(*) FROM inventario_movimientos WHERE tipo_movimiento = 'EXTRACCION'"
    ))
    if cantidad:
        raise RuntimeError("No se puede revertir: existen extracciones historicas")
    op.drop_constraint("ck_inv_mov_tipo", "inventario_movimientos", type_="check")
    op.create_check_constraint(
        "ck_inv_mov_tipo", "inventario_movimientos", condicion(ANTERIORES),
    )
