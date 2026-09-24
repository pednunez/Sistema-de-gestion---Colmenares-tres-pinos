from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.transferencia_marco import (
    TransferenciaMarcoCreate,
    TransferenciaMarcoResponse
)
from app.services import transferencia_marco as transferencia_service


router = APIRouter(
    prefix="/transferencias-marcos",
    tags=["Transferencias de Marcos"]
)


# ==========================================================
# LISTAR TRANSFERENCIAS
# ==========================================================

@router.get(
    "/",
    response_model=list[TransferenciaMarcoResponse]
)
def listar_transferencias(
    db: Session = Depends(get_db)
):
    return transferencia_service.listar_transferencias(db)


# ==========================================================
# OBTENER TRANSFERENCIA POR ID
# ==========================================================

@router.get(
    "/{transferencia_id}",
    response_model=TransferenciaMarcoResponse
)
def obtener_transferencia(
    transferencia_id: int,
    db: Session = Depends(get_db)
):
    transferencia = transferencia_service.obtener_transferencia(
        db,
        transferencia_id
    )

    if transferencia is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transferencia no encontrada"
        )

    return transferencia


# ==========================================================
# CREAR TRANSFERENCIA
# ==========================================================

@router.post(
    "/",
    response_model=TransferenciaMarcoResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_transferencia(
    datos: TransferenciaMarcoCreate,
    db: Session = Depends(get_db)
):
    # Validar colmena de origen
    colmena_origen = transferencia_service.obtener_colmena_activa(
        db,
        datos.colmena_origen_id
    )

    if colmena_origen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena de origen no existe o está inactiva"
        )

    # Validar colmena de destino
    colmena_destino = transferencia_service.obtener_colmena_activa(
        db,
        datos.colmena_destino_id
    )

    if colmena_destino is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena de destino no existe o está inactiva"
        )

    # Validar usuario
    usuario = transferencia_service.obtener_usuario_activo(
        db,
        datos.usuario_id
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe o está inactivo"
        )

    return transferencia_service.crear_transferencia(
        db,
        datos
    )