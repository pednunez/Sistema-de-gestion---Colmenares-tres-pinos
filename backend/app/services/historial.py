from sqlalchemy import text
from sqlalchemy.orm import Session


# ==========================================================
# HISTORIAL COMPLETO DE UNA COLMENA
# ==========================================================

def obtener_historial_colmena(
    db: Session,
    colmena_id: int
):
    consulta = text("""
        SELECT
            colmena_id,
            fecha,
            tipo_evento,
            evento_id,
            detalle
        FROM vw_historial_colmenas
        WHERE colmena_id = :colmena_id
        ORDER BY fecha DESC;
    """)

    resultado = db.execute(
        consulta,
        {
            "colmena_id": colmena_id
        }
    )

    return [
        dict(fila)
        for fila in resultado.mappings().all()
    ]