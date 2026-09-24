from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.apiario import (
    ApiarioCreate,
    ApiarioUpdate,
    ApiarioResponse
)
from app.services import apiario as apiario_service


router = APIRouter(
    prefix="/apiarios",
    tags=["Apiarios"]
)


# ==========================================================
# LISTAR APIARIOS
# ==========================================================

@router.get(
    "/",
    response_model=list[ApiarioResponse]
)
def listar_apiarios(
    db: Session = Depends(get_db)
):
    return apiario_service.listar_apiarios(db)


# ==========================================================
# OBTENER APIARIO POR ID
# ==========================================================

@router.get(
    "/{apiario_id}",
    response_model=ApiarioResponse
)
def obtener_apiario(
    apiario_id: int,
    db: Session = Depends(get_db)
):
    apiario = apiario_service.obtener_apiario(
        db,
        apiario_id
    )

    if apiario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apiario no encontrado"
        )

    return apiario


# ==========================================================
# CREAR APIARIO
# ==========================================================

@router.post(
    "/",
    response_model=ApiarioResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_apiario(
    datos: ApiarioCreate,
    db: Session = Depends(get_db)
):
    return apiario_service.crear_apiario(
        db,
        datos
    )


# ==========================================================
# ACTUALIZAR APIARIO
# ==========================================================

@router.patch(
    "/{apiario_id}",
    response_model=ApiarioResponse
)
def actualizar_apiario(
    apiario_id: int,
    datos: ApiarioUpdate,
    db: Session = Depends(get_db)
):
    apiario = apiario_service.obtener_apiario(
        db,
        apiario_id
    )

    if apiario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apiario no encontrado"
        )

    return apiario_service.actualizar_apiario(
        db,
        apiario,
        datos
    )


# ==========================================================
# BAJA LÓGICA
# ==========================================================

@router.delete(
    "/{apiario_id}",
    response_model=ApiarioResponse
)
def eliminar_apiario(
    apiario_id: int,
    db: Session = Depends(get_db)
):
    apiario = apiario_service.obtener_apiario(
        db,
        apiario_id
    )

    if apiario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Apiario no encontrado"
        )

    return apiario_service.eliminar_apiario(
        db,
        apiario
    )