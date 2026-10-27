"""Ampliar la restriccion de estado_general de inspecciones (PB-08).

Revision ID: b3d7f9a2c5e8
Revises: a9c4e1f7b3d2

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING

La base original solo aceptaba BUENO, REGULAR y CRITICO, asi que guardar
una inspeccion con la escala nueva del cliente (H005-E4) fallaba con un
error 500 aunque la API la validara. Se aceptan los cinco valores nuevos
y se conservan los tres antiguos para no invalidar inspecciones previas.
"""

from typing import Sequence, Union

from alembic import op


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "b3d7f9a2c5e8"

down_revision: Union[str, Sequence[str], None] = (
    "a9c4e1f7b3d2"
)

branch_labels = None
depends_on = None


RESTRICCION = "inspecciones_estado_general_check"

ESCALA_ANTERIOR = ("BUENO", "REGULAR", "CRITICO")

ESCALA_NUEVA = (
    "COMPLETA",
    "EN_DESARROLLO",
    "DONANTE",
    "DEBIL",
    "REQUIERE_REVISION",
)


def condicion(valores) -> str:
    lista = ", ".join(f"'{valor}'" for valor in valores)
    return f"estado_general IS NULL OR estado_general IN ({lista})"


def upgrade() -> None:
    op.drop_constraint(RESTRICCION, "inspecciones", type_="check")
    op.create_check_constraint(
        RESTRICCION,
        "inspecciones",
        condicion(ESCALA_NUEVA + ESCALA_ANTERIOR),
    )


def downgrade() -> None:
    conexion = op.get_bind()

    from sqlalchemy import text

    nuevos = conexion.scalar(
        text(
            "SELECT COUNT(*) FROM inspecciones "
            f"WHERE NOT ({condicion(ESCALA_ANTERIOR)})"
        )
    )

    if nuevos:
        raise RuntimeError(
            "No se puede revertir: existen inspecciones con la escala nueva."
        )

    op.drop_constraint(RESTRICCION, "inspecciones", type_="check")
    op.create_check_constraint(
        RESTRICCION,
        "inspecciones",
        condicion(ESCALA_ANTERIOR),
    )
