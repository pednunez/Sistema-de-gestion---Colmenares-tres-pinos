"""Dar a la cuenta de la app permisos sobre las tablas de grupos.

Revision ID: e7a3c9d2f1b5
Revises: d5e2f8a1c6b4

Proyecto: Colmenares Tres Pinos
Entorno autorizado: Neon TESTING

La migracion d5e2f8a1c6b4 crea las tablas con la cuenta duena;
la cuenta restringida de la app (colmenares_app) no recibe permisos
por defecto y la API respondia "permission denied". Se le dan los
mismos permisos que tiene sobre el resto de las tablas: SELECT,
INSERT, UPDATE y DELETE. Si el rol no existe, no se hace nada.
"""

from typing import Sequence, Union

from alembic import op


# ==========================================================
# IDENTIFICADORES ALEMBIC
# ==========================================================

revision: str = "e7a3c9d2f1b5"

down_revision: Union[str, Sequence[str], None] = (
    "d5e2f8a1c6b4"
)

branch_labels = None
depends_on = None


ROL_APP = "colmenares_app"

TABLAS = (
    "grupos_colmenas",
    "grupos_colmenas_asignaciones",
)


def _para_rol(sentencia: str) -> str:
    """Ejecuta la sentencia solo si el rol de la app existe."""

    return (
        "DO $$ BEGIN "
        f"IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{ROL_APP}') THEN "
        f"{sentencia}; "
        "END IF; "
        "END $$"
    )


def upgrade() -> None:
    for tabla in TABLAS:
        op.execute(
            _para_rol(
                f"GRANT SELECT, INSERT, UPDATE, DELETE ON {tabla} TO {ROL_APP}"
            )
        )


def downgrade() -> None:
    for tabla in TABLAS:
        op.execute(
            _para_rol(
                f"REVOKE SELECT, INSERT, UPDATE, DELETE ON {tabla} FROM {ROL_APP}"
            )
        )
