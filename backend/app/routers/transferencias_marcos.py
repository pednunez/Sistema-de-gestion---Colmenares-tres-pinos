from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.transferencia_marco import (
    TransferenciaMarcoCreate,
    TransferenciaMarcoResponse
)
from app.schemas.auditoria import AuditoriaCreate

from app.services import transferencia_marco as transferencia_service
from app.services import auditoria as auditoria_service


router = APIRouter(
    prefix="/transferencias-marcos",
    tags=["Transferencias de Marcos"]
)


# ==========================================================
# FUNCIONES AUXILIARES PARA AUDITORÍA
# ==========================================================

def valor_json(valor):
    """
    Convierte tipos especiales a valores compatibles con JSON.
    """

    if isinstance(valor, (datetime, date)):
        return valor.isoformat()

    if isinstance(valor, UUID):
        return str(valor)

    if isinstance(valor, Enum):
        return valor.value

    if isinstance(valor, Decimal):
        return float(valor)

    return valor


def transferencia_a_dict(transferencia):
    """
    Convierte automáticamente todas las columnas
    de una transferencia a un diccionario.
    """

    return {
        columna.key: valor_json(
            getattr(transferencia, columna.key)
        )
        for columna in sa_inspect(transferencia).mapper.column_attrs
    }


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
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
):

    # ------------------------------------------------------
    # VALIDAR QUE ORIGEN Y DESTINO SEAN DIFERENTES
    # ------------------------------------------------------

    if datos.colmena_origen_id == datos.colmena_destino_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La colmena de origen y destino deben ser diferentes"
        )

    # ------------------------------------------------------
    # VALIDAR COLMENA DE ORIGEN
    # ------------------------------------------------------

    colmena_origen = transferencia_service.obtener_colmena_activa(
        db,
        datos.colmena_origen_id
    )

    if colmena_origen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena de origen no existe o está inactiva"
        )

    # ------------------------------------------------------
    # VALIDAR COLMENA DE DESTINO
    # ------------------------------------------------------

    colmena_destino = transferencia_service.obtener_colmena_activa(
        db,
        datos.colmena_destino_id
    )

    if colmena_destino is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena de destino no existe o está inactiva"
        )

    # ------------------------------------------------------
    # USUARIO REAL OBTENIDO DESDE JWT
    # ------------------------------------------------------

    datos_seguros = datos.model_copy(
        update={
            "usuario_id": usuario_actual.id
        }
    )

    # ------------------------------------------------------
    # CREAR TRANSFERENCIA
    # ------------------------------------------------------

    transferencia = transferencia_service.crear_transferencia(
        db,
        datos_seguros
    )

    # ------------------------------------------------------
    # AUDITORÍA AUTOMÁTICA
    # ------------------------------------------------------

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_actual.id,
            entidad="TRANSFERENCIA_MARCO",
            entidad_id=transferencia.id,
            accion="CREAR",
            datos_anteriores=None,
            datos_nuevos=transferencia_a_dict(
                transferencia
            )
        )
    )

    return transferencia