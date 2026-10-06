from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual, verificar_autor_o_admin
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.tratamiento import (
    TratamientoCreate,
    TratamientoUpdate,
    TratamientoResponse
)
from app.schemas.auditoria import AuditoriaCreate

from app.services import tratamiento as tratamiento_service
from app.services import auditoria as auditoria_service


router = APIRouter(
    prefix="/tratamientos",
    tags=["Tratamientos"]
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


def tratamiento_a_dict(tratamiento):
    """
    Convierte automáticamente todas las columnas
    del tratamiento a un diccionario.
    """

    return {
        columna.key: valor_json(
            getattr(tratamiento, columna.key)
        )
        for columna in sa_inspect(tratamiento).mapper.column_attrs
    }


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
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
):

    # ------------------------------------------------------
    # VALIDAR COLMENA
    # ------------------------------------------------------

    colmena = tratamiento_service.obtener_colmena_activa(
        db,
        datos.colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena indicada no existe o está inactiva"
        )

    # ------------------------------------------------------
    # VALIDAR INSPECCIÓN SI FUE INDICADA
    # ------------------------------------------------------

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

        if inspeccion.colmena_id != datos.colmena_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La inspección no pertenece a la colmena indicada"
            )

    # ------------------------------------------------------
    # EL USUARIO REAL VIENE DEL JWT
    # ------------------------------------------------------

    datos_seguros = datos.model_copy(
        update={
            "usuario_id": usuario_actual.id
        }
    )

    tratamiento = tratamiento_service.crear_tratamiento(
        db,
        datos_seguros
    )

    # ------------------------------------------------------
    # AUDITORÍA
    # ------------------------------------------------------

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_actual.id,
            entidad="TRATAMIENTO",
            entidad_id=tratamiento.id,
            accion="CREAR",
            datos_anteriores=None,
            datos_nuevos=tratamiento_a_dict(
                tratamiento
            )
        )
    )

    return tratamiento


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
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
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

    # Estado antes del cambio
    verificar_autor_o_admin(usuario_actual, tratamiento.usuario_id)

    datos_anteriores = tratamiento_a_dict(
        tratamiento
    )

    cambios = datos.model_dump(
        exclude_unset=True
    )

    # No permitimos cambiar quién creó el tratamiento
    cambios.pop(
        "usuario_id",
        None
    )

    # ------------------------------------------------------
    # DETERMINAR COLMENA FINAL
    # ------------------------------------------------------

    colmena_id_final = cambios.get(
        "colmena_id",
        tratamiento.colmena_id
    )

    if "colmena_id" in cambios:

        colmena = tratamiento_service.obtener_colmena_activa(
            db,
            colmena_id_final
        )

        if colmena is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La colmena indicada no existe o está inactiva"
            )

    # ------------------------------------------------------
    # VALIDAR INSPECCIÓN SI SE CAMBIA
    # ------------------------------------------------------

    if (
        "inspeccion_id" in cambios
        and cambios["inspeccion_id"] is not None
    ):

        inspeccion = tratamiento_service.obtener_inspeccion(
            db,
            cambios["inspeccion_id"]
        )

        if inspeccion is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La inspección indicada no existe o está inactiva"
            )

        if inspeccion.colmena_id != colmena_id_final:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La inspección no pertenece a la colmena indicada"
            )

    # Si cambia solamente la colmena y ya existía una inspección,
    # verificamos que siga siendo compatible.
    elif (
        "colmena_id" in cambios
        and tratamiento.inspeccion_id is not None
    ):

        inspeccion_actual = tratamiento_service.obtener_inspeccion(
            db,
            tratamiento.inspeccion_id
        )

        if (
            inspeccion_actual is not None
            and inspeccion_actual.colmena_id != colmena_id_final
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "La inspección asociada actualmente no pertenece "
                    "a la nueva colmena"
                )
            )

    datos_seguros = TratamientoUpdate(
        **cambios
    )

    tratamiento_actualizado = (
        tratamiento_service.actualizar_tratamiento(
            db,
            tratamiento,
            datos_seguros
        )
    )

    # ------------------------------------------------------
    # AUDITORÍA
    # ------------------------------------------------------

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_actual.id,
            entidad="TRATAMIENTO",
            entidad_id=tratamiento_actualizado.id,
            accion="MODIFICAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=tratamiento_a_dict(
                tratamiento_actualizado
            )
        )
    )

    return tratamiento_actualizado


# ==========================================================
# CANCELAR TRATAMIENTO
# ==========================================================

@router.delete(
    "/{tratamiento_id}",
    response_model=TratamientoResponse
)
def cancelar_tratamiento(
    tratamiento_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
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

    # Datos antes de cancelar
    verificar_autor_o_admin(usuario_actual, tratamiento.usuario_id)

    datos_anteriores = tratamiento_a_dict(
        tratamiento
    )

    tratamiento_cancelado = (
        tratamiento_service.cancelar_tratamiento(
            db,
            tratamiento
        )
    )

    # ------------------------------------------------------
    # AUDITORÍA
    #
    # Se registra como MODIFICAR porque el tratamiento
    # permanece en la base de datos y cambia a CANCELADO.
    # ------------------------------------------------------

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_actual.id,
            entidad="TRATAMIENTO",
            entidad_id=tratamiento_cancelado.id,
            accion="MODIFICAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=tratamiento_a_dict(
                tratamiento_cancelado
            )
        )
    )

    return tratamiento_cancelado