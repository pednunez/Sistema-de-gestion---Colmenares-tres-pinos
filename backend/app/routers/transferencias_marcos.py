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
    Convierte tipos especiales de Python a valores
    compatibles con JSON para almacenarlos en auditoría.
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
    Convierte las columnas de una transferencia
    SQLAlchemy a un diccionario compatible con JSON.
    """

    return {
        columna.key: valor_json(
            getattr(transferencia, columna.key)
        )
        for columna in sa_inspect(
            transferencia
        ).mapper.column_attrs
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
    return transferencia_service.listar_transferencias(
        db
    )


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
    transferencia = (
        transferencia_service.obtener_transferencia(
            db,
            transferencia_id
        )
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
    usuario_actual: Usuario = Depends(
        obtener_usuario_actual
    )
):

    # ------------------------------------------------------
    # VALIDAR ORIGEN Y DESTINO DIFERENTES
    # ------------------------------------------------------

    if (
        datos.colmena_origen_id
        == datos.colmena_destino_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La colmena de origen y destino "
                "deben ser diferentes"
            )
        )

    # ------------------------------------------------------
    # VALIDAR CANTIDAD DE MARCOS
    # ------------------------------------------------------

    if datos.cantidad_marcos <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La cantidad de marcos debe ser "
                "mayor que cero"
            )
        )

    # ------------------------------------------------------
    # VALIDAR COLMENA DE ORIGEN
    # ------------------------------------------------------

    colmena_origen = (
        transferencia_service.obtener_colmena_activa(
            db,
            datos.colmena_origen_id
        )
    )

    if colmena_origen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La colmena de origen no existe "
                "o está inactiva"
            )
        )

    # ------------------------------------------------------
    # VALIDAR COLMENA DE DESTINO
    # ------------------------------------------------------

    colmena_destino = (
        transferencia_service.obtener_colmena_activa(
            db,
            datos.colmena_destino_id
        )
    )

    if colmena_destino is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La colmena de destino no existe "
                "o está inactiva"
            )
        )

    # ------------------------------------------------------
    # VALIDAR MARCOS DISPONIBLES
    # ------------------------------------------------------
    #
    # Esta primera validación permite entregar un mensaje
    # claro al usuario antes de intentar la transferencia.
    #
    # El servicio vuelve a validar la disponibilidad,
    # porque es allí donde se realiza la operación real.
    # ------------------------------------------------------

    marcos_disponibles = (
        colmena_origen.cantidad_marcos
        if colmena_origen.cantidad_marcos is not None
        else 0
    )

    if (
        marcos_disponibles
        < datos.cantidad_marcos
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La colmena de origen no tiene "
                "suficientes marcos disponibles. "
                f"Tiene {marcos_disponibles} y se "
                f"intentan transferir "
                f"{datos.cantidad_marcos}."
            )
        )

    # ------------------------------------------------------
    # USUARIO REAL OBTENIDO DESDE EL JWT
    # ------------------------------------------------------
    #
    # No confiamos en el usuario_id recibido desde
    # el frontend.
    #
    # Se reemplaza por el ID del usuario autenticado.
    # ------------------------------------------------------

    datos_seguros = datos.model_copy(
        update={
            "usuario_id": usuario_actual.id
        }
    )

    # ------------------------------------------------------
    # CREAR TRANSFERENCIA
    # ------------------------------------------------------
    #
    # El servicio:
    #
    # 1. vuelve a validar los marcos disponibles;
    # 2. descuenta del origen;
    # 3. suma al destino;
    # 4. crea la transferencia;
    # 5. guarda todo en una misma transacción.
    #
    # Los errores de negocio generados por el servicio
    # se convierten en HTTP 400.
    # ------------------------------------------------------

    try:
        transferencia = (
            transferencia_service.crear_transferencia(
                db,
                datos_seguros
            )
        )

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error)
        ) from error

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

    # ------------------------------------------------------
    # RESPUESTA
    # ------------------------------------------------------

    return transferencia