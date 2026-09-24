from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.historial import HistorialEventoResponse
from app.services import historial as historial_service
from app.services import colmena as colmena_service


router = APIRouter(
    prefix="/historial",
    tags=["Historial"]
)


@router.get(
    "/colmenas/{colmena_id}",
    response_model=list[HistorialEventoResponse]
)
def obtener_historial_colmena(
    colmena_id: int,
    db: Session = Depends(get_db)
):
    colmena = colmena_service.obtener_colmena(
        db,
        colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colmena no encontrada"
        )

    return historial_service.obtener_historial_colmena(
        db,
        colmena_id
    )