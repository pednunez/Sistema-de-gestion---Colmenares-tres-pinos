from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.tratamiento import (
    TratamientoCreate,
    TratamientoUpdate,
    TratamientoResponse
)
from app.services import tratamiento as tratamiento_service


router = APIRouter(
    prefix="/tratamientos",
    tags=["Tratamientos"]
)


# ==========================================================
# LISTAR TRATAMIENTOS
# ==========================================================

@router.get(
    "/",
    response_model=list[TratamientoResponse]
)
def listar_tratamientos(
    db: Session = Depends(get_db)
):
    return tratamiento_service.listar_tratamientos(db)


# ==========================================================
# OBTENER TRATAMIENTO POR ID
# ==========================================================

@router.get(
    "/{tratamiento_id}",
    response_model=TratamientoResponse
)
def obtener_tratamiento(
    tratamiento_id: int,
    db: Session = Depends(get_db)
):
    tratamiento = tratamiento_service.obtener_tratamiento(
        db,
        tratamiento_id
    )

    if tratamiento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tratamiento no encontrado"
        )

    return tratamiento


# ==========================================================
# CREAR TRATAMIENTO
# ==========================================================

@router.post(
    "/",
    response_model=TratamientoResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_tratamiento(
    datos: TratamientoCreate,
    db: Session = Depends(get_db)
):
    # Verificar colmena
    colmena = tratamiento_service.obtener_colmena_activa(
        db,
        datos.colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena indicada no existe o está inactiva"
        )

    # Verificar usuario
    usuario = tratamiento_service.obtener_usuario_activo(
        db,
        datos.usuario_id
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe o está inactivo"
        )

    # Verificar inspección si fue indicada
    if datos.inspeccion_id is not None:

        inspeccion = tratamiento_service.obtener_inspeccion(
            db,
            datos.inspeccion_id
        )

        if inspeccion is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La inspección indicada no existe o está inactiva"
            )

        # La inspección debe pertenecer a la misma colmena
        if inspeccion.colmena_id != datos.colmena_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La inspección no pertenece a la colmena indicada"
            )

    return tratamiento_service.crear_tratamiento(
        db,
        datos
    )


# ==========================================================
# ACTUALIZAR TRATAMIENTO
# ==========================================================

@router.patch(
    "/{tratamiento_id}",
    response_model=TratamientoResponse
)
def actualizar_tratamiento(
    tratamiento_id: int,
    datos: TratamientoUpdate,
    db: Session = Depends(get_db)
):
    tratamiento = tratamiento_service.obtener_tratamiento(
        db,
        tratamiento_id
    )

    if tratamiento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tratamiento no encontrado"
        )

    return tratamiento_service.actualizar_tratamiento(
        db,
        tratamiento,
        datos
    )


# ==========================================================
# CANCELAR TRATAMIENTO
# ==========================================================

@router.delete(
    "/{tratamiento_id}",
    response_model=TratamientoResponse
)
def cancelar_tratamiento(
    tratamiento_id: int,
    db: Session = Depends(get_db)
):
    tratamiento = tratamiento_service.obtener_tratamiento(
        db,
        tratamiento_id
    )

    if tratamiento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tratamiento no encontrado"
        )

    return tratamiento_service.cancelar_tratamiento(
        db,
        tratamiento
    )