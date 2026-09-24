from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.colmena import (
    ColmenaCreate,
    ColmenaUpdate,
    ColmenaResponse
)
from app.services import colmena as colmena_service


router = APIRouter(
    prefix="/colmenas",
    tags=["Colmenas"]
)


# ==========================================================
# LISTAR COLMENAS
# ==========================================================

@router.get(
    "/",
    response_model=list[ColmenaResponse]
)
def listar_colmenas(
    db: Session = Depends(get_db)
):
    return colmena_service.listar_colmenas(db)


# ==========================================================
# OBTENER COLMENA POR ID
# ==========================================================

@router.get(
    "/{colmena_id}",
    response_model=ColmenaResponse
)
def obtener_colmena(
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

    return colmena


# ==========================================================
# CREAR COLMENA
# ==========================================================

@router.post(
    "/",
    response_model=ColmenaResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_colmena(
    datos: ColmenaCreate,
    db: Session = Depends(get_db)
):
    # Verificar que el apiario exista y esté activo
    apiario = colmena_service.obtener_apiario_activo(
        db,
        datos.apiario_id
    )

    if apiario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El apiario indicado no existe o está inactivo"
        )

    # Evitar códigos de colmena duplicados
    colmena_existente = colmena_service.obtener_colmena_por_codigo(
        db,
        datos.codigo
    )

    if colmena_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una colmena con ese código"
        )

    return colmena_service.crear_colmena(
        db,
        datos
    )


# ==========================================================
# ACTUALIZAR COLMENA
# ==========================================================

@router.patch(
    "/{colmena_id}",
    response_model=ColmenaResponse
)
def actualizar_colmena(
    colmena_id: int,
    datos: ColmenaUpdate,
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

    # Si se cambia el apiario, comprobar que exista
    if datos.apiario_id is not None:

        apiario = colmena_service.obtener_apiario_activo(
            db,
            datos.apiario_id
        )

        if apiario is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El apiario indicado no existe o está inactivo"
            )

    # Si se cambia el código, comprobar que no esté utilizado
    if datos.codigo is not None:

        existente = colmena_service.obtener_colmena_por_codigo(
            db,
            datos.codigo
        )

        if (
            existente is not None
            and existente.id != colmena_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una colmena con ese código"
            )

    return colmena_service.actualizar_colmena(
        db,
        colmena,
        datos
    )


# ==========================================================
# BAJA LÓGICA DE COLMENA
# ==========================================================

@router.delete(
    "/{colmena_id}",
    response_model=ColmenaResponse
)
def eliminar_colmena(
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

    return colmena_service.eliminar_colmena(
        db,
        colmena
    )