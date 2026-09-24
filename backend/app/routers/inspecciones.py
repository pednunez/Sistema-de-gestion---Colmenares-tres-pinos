from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.inspeccion import (
    InspeccionCreate,
    InspeccionUpdate,
    InspeccionResponse
)
from app.services import inspeccion as inspeccion_service


router = APIRouter(
    prefix="/inspecciones",
    tags=["Inspecciones"]
)


# ==========================================================
# LISTAR INSPECCIONES
# ==========================================================

@router.get(
    "/",
    response_model=list[InspeccionResponse]
)
def listar_inspecciones(
    db: Session = Depends(get_db)
):
    return inspeccion_service.listar_inspecciones(db)


# ==========================================================
# OBTENER INSPECCIÓN POR ID
# ==========================================================

@router.get(
    "/{inspeccion_id}",
    response_model=InspeccionResponse
)
def obtener_inspeccion(
    inspeccion_id: int,
    db: Session = Depends(get_db)
):
    inspeccion = inspeccion_service.obtener_inspeccion(
        db,
        inspeccion_id
    )

    if inspeccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inspección no encontrada"
        )

    return inspeccion


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================

@router.post(
    "/",
    response_model=InspeccionResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_inspeccion(
    datos: InspeccionCreate,
    db: Session = Depends(get_db)
):
    colmena = inspeccion_service.obtener_colmena_activa(
        db,
        datos.colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena indicada no existe o está inactiva"
        )

    usuario = inspeccion_service.obtener_usuario_activo(
        db,
        datos.usuario_id
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe o está inactivo"
        )

    return inspeccion_service.crear_inspeccion(
        db,
        datos
    )


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================

@router.patch(
    "/{inspeccion_id}",
    response_model=InspeccionResponse
)
def actualizar_inspeccion(
    inspeccion_id: int,
    datos: InspeccionUpdate,
    db: Session = Depends(get_db)
):
    inspeccion = inspeccion_service.obtener_inspeccion(
        db,
        inspeccion_id
    )

    if inspeccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inspección no encontrada"
        )

    return inspeccion_service.actualizar_inspeccion(
        db,
        inspeccion,
        datos
    )


# ==========================================================
# BAJA LÓGICA
# ==========================================================

@router.delete(
    "/{inspeccion_id}",
    response_model=InspeccionResponse
)
def eliminar_inspeccion(
    inspeccion_id: int,
    db: Session = Depends(get_db)
):
    inspeccion = inspeccion_service.obtener_inspeccion(
        db,
        inspeccion_id
    )

    if inspeccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inspección no encontrada"
        )

    return inspeccion_service.eliminar_inspeccion(
        db,
        inspeccion
    )