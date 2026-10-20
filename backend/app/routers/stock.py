
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.inventario_stock import InventarioStock


# ==========================================================
# STOCK DE BODEGA - COLMENARES TRES PINOS
# ==========================================================
#
# Compatible con el frontend desarrollado por Pedro.
#
# GET /stock/
#
# Solamente consulta materiales en BODEGA.
# Los materiales instalados siguen registrados
# por separado en el inventario general.
# ==========================================================

router = APIRouter(
    prefix="/stock",
    tags=["Stock"],
    dependencies=[Depends(obtener_usuario_actual)],
)


# ==========================================================
# CATALOGO UTILIZADO POR EL FRONTEND
# ==========================================================

MATERIALES_STOCK = (
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
)

ESTADOS_DISPONIBLES = (
    "BUENO",
    "REPARADO",
)

ESTADOS_DANADOS = (
    "DANADO",
    "ROTO",
    "EN_REPARACION",
)


# ==========================================================
# RESPUESTA ESPERADA POR EL FRONTEND
# ==========================================================

class StockFilaResponse(BaseModel):

    material: str

    disponible: int = Field(ge=0)

    danado: int = Field(ge=0)

    minimo: int | None = None

    actualizado_en: datetime | None = None


# ==========================================================
# GET /stock/
# ==========================================================

@router.get(
    "/",
    response_model=list[StockFilaResponse],
)
def consultar_stock(
    db: Session = Depends(get_db),
):

    # Preparar los siete materiales para que todos
    # aparezcan aunque todavia tengan stock cero.

    resumen = {
        material: {
            "material": material,
            "disponible": 0,
            "danado": 0,
            "minimo": None,
            "actualizado_en": None,
        }
        for material in MATERIALES_STOCK
    }

    # Consultar solamente BODEGA.
    #
    # No se suman materiales instalados para evitar
    # confundir el disponible de bodega con el
    # inventario general de la empresa.

    consulta = (
        select(
            InventarioStock.material,
            InventarioStock.estado,
            func.sum(
                InventarioStock.cantidad
            ).label("cantidad"),
            func.max(
                InventarioStock.fecha_actualizacion
            ).label("actualizado_en"),
        )
        .where(
            InventarioStock.ubicacion == "BODEGA",
            InventarioStock.material.in_(
                MATERIALES_STOCK
            ),
        )
        .group_by(
            InventarioStock.material,
            InventarioStock.estado,
        )
    )

    resultados = db.execute(consulta).all()

    for fila in resultados:

        item = resumen[fila.material]

        cantidad = int(fila.cantidad)

        if fila.estado in ESTADOS_DISPONIBLES:
            item["disponible"] += cantidad

        elif fila.estado in ESTADOS_DANADOS:
            item["danado"] += cantidad

        if (
            item["actualizado_en"] is None
            or (
                fila.actualizado_en is not None
                and fila.actualizado_en
                > item["actualizado_en"]
            )
        ):
            item["actualizado_en"] = (
                fila.actualizado_en
            )

    # Por ahora los minimos son NULL.
    #
    # Se almacenaran en PostgreSQL mediante una
    # migracion Alembic posterior.
    #
    # No se generan valores ficticios.

    return list(resumen.values())

