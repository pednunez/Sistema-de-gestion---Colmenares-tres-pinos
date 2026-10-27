
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.transferencia_marco import (
    TransferenciaMarcoCreate,
    TransferenciaMarcoResponse,
)
from app.schemas.auditoria import AuditoriaCreate

from app.services import transferencia_marco as transferencia_service
from app.services import auditoria as auditoria_service


# ==========================================================
# ROUTER DE TRANSFERENCIAS DE MARCOS
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================

router = APIRouter(
    prefix="/transferencias-marcos",
    tags=["Transferencias de Marcos"],
)


# ==========================================================
# FUNCIONES AUXILIARES PARA AUDITORÍA
# ==========================================================

def valor_json(valor):
    """
    Convierte valores especiales a formatos compatibles
    con JSON para almacenarlos en auditoría.
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
    Obtiene todas las columnas de la transferencia
    para generar su registro de auditoría.
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
    response_model=list[TransferenciaMarcoResponse],
)
def listar_transferencias(
    db: Session = Depends(get_db),
):
    return transferencia_service.listar_transferencias(db)


# ==========================================================
# OBTENER TRANSFERENCIA POR ID
# ==========================================================

@router.get(
    "/{transferencia_id}",
    response_model=TransferenciaMarcoResponse,
)
def obtener_transferencia(
    transferencia_id: int,
    db: Session = Depends(get_db),
):
    transferencia = transferencia_service.obtener_transferencia(
        db,
        transferencia_id,
    )

    if transferencia is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transferencia no encontrada",
        )

    return transferencia


# ==========================================================
# CREAR TRANSFERENCIA MANUAL
# ==========================================================
#
# Este endpoint permite transferencias independientes.
#
# Las transferencias realizadas durante una inspección
# deben registrarse exclusivamente desde el servicio
# de inspecciones, dentro de su misma transacción.
# ==========================================================

@router.post(
    "/",
    response_model=TransferenciaMarcoResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_transferencia(
    datos: TransferenciaMarcoCreate,
    response: Response,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(
        obtener_usuario_actual
    ),
):

    # ======================================================
    # 1. PROTEGER TRANSFERENCIAS DE INSPECCIONES
    # ======================================================
    #
    # Las transferencias de una inspección ya se registran
    # al guardarla (marcos[].transferido_a_colmena_id).
    #
    # Si el cliente vuelve a enviar una de ellas, se responde
    # 200 con la transferencia existente: no se duplica el
    # movimiento ni se descuentan otra vez los marcos.
    # Cualquier otra transferencia con inspeccion_id se
    # rechaza para no crear movimientos fuera de la inspección.
    # ======================================================

    if datos.inspeccion_id is not None:

        existente = transferencia_service.obtener_transferencia_de_inspeccion(
            db,
            datos.inspeccion_id,
            datos.ubicacion,
            datos.numero_marco,
        )

        if (
            existente is not None
            and existente.colmena_origen_id == datos.colmena_origen_id
            and existente.colmena_destino_id == datos.colmena_destino_id
        ):
            response.status_code = status.HTTP_200_OK
            return existente

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Las transferencias asociadas a inspecciones "
                "se registran automáticamente al guardar "
                "la inspección, indicando el destino en "
                "marcos[].transferido_a_colmena_id."
            ),
        )

    # ======================================================
    # 2. VALIDAR ORIGEN Y DESTINO DIFERENTES
    # ======================================================

    if datos.colmena_origen_id == datos.colmena_destino_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La colmena de origen y destino "
                "deben ser diferentes"
            ),
        )

    # ======================================================
    # 3. VALIDAR CANTIDAD
    # ======================================================

    if datos.cantidad_marcos <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La cantidad de marcos debe ser "
                "mayor que cero"
            ),
        )

    # ======================================================
    # 4. VALIDAR COLMENA DE ORIGEN
    # ======================================================

    colmena_origen = transferencia_service.obtener_colmena_activa(
        db,
        datos.colmena_origen_id,
    )

    if colmena_origen is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La colmena de origen no existe "
                "o está inactiva"
            ),
        )

    # ======================================================
    # 5. VALIDAR COLMENA DE DESTINO
    # ======================================================

    colmena_destino = transferencia_service.obtener_colmena_activa(
        db,
        datos.colmena_destino_id,
    )

    if colmena_destino is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La colmena de destino no existe "
                "o está inactiva"
            ),
        )

    # ======================================================
    # 6. VALIDAR MARCOS DISPONIBLES
    # ======================================================
    #
    # Esta validación entrega un mensaje claro.
    # El servicio repetirá la comprobación con las
    # colmenas bloqueadas para evitar inconsistencias.
    # ======================================================

    marcos_disponibles = (
        colmena_origen.cantidad_marcos
        if colmena_origen.cantidad_marcos is not None
        else 0
    )

    if marcos_disponibles < datos.cantidad_marcos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La colmena de origen no tiene suficientes "
                "marcos disponibles. "
                f"Tiene {marcos_disponibles} y se intentan "
                f"transferir {datos.cantidad_marcos}."
            ),
        )

    # ======================================================
    # 7. UTILIZAR USUARIO AUTENTICADO
    # ======================================================
    #
    # El usuario responsable se obtiene del JWT.
    # No confiamos en usuario_id enviado por el cliente.
    # ======================================================

    datos_seguros = datos.model_copy(
        update={
            "usuario_id": usuario_actual.id,
        }
    )

    # ======================================================
    # 8. TRANSACCIÓN: TRANSFERENCIA + AUDITORÍA
    # ======================================================

    try:
        # Crear sin confirmar todavía.
        transferencia = transferencia_service.crear_transferencia(
            db,
            datos_seguros,
            commit=False,
        )

        # Registrar auditoría dentro de la misma transacción.
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
                ),
            ),
            commit=False,
        )

        # Confirmar ambos registros juntos.
        db.commit()

        # Recuperar los valores guardados.
        db.refresh(transferencia)

        return transferencia

    except ValueError as error:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    except Exception:
        db.rollback()
        raise
