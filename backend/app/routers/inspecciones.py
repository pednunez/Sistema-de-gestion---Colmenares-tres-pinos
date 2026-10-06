from datetime import date, datetime
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual, verificar_autor_o_admin
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.inspeccion import (
    InspeccionCreate,
    InspeccionUpdate,
    InspeccionResponse
)
from app.schemas.auditoria import AuditoriaCreate

from app.services import inspeccion as inspeccion_service
from app.services import auditoria as auditoria_service


router = APIRouter(
    prefix="/inspecciones",
    tags=["Inspecciones"]
)


# ==========================================================
# FUNCIONES AUXILIARES PARA AUDITORÍA
# ==========================================================

def valor_json(valor):
    """
    Convierte tipos especiales de Python a valores compatibles con JSON.
    """
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()

    if isinstance(valor, UUID):
        return str(valor)

    if isinstance(valor, Enum):
        return valor.value

    return valor


def inspeccion_a_dict(inspeccion):
    """
    Convierte automáticamente las columnas de una inspección
    en un diccionario para almacenarlas en auditoría.
    """
    return {
        columna.key: valor_json(
            getattr(inspeccion, columna.key)
        )
        for columna in sa_inspect(inspeccion).mapper.column_attrs
    }


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
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
):
    # ------------------------------------------------------
    # Validar que la colmena exista y esté activa
    # ------------------------------------------------------

    colmena = inspeccion_service.obtener_colmena_activa(
        db,
        datos.colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena indicada no existe o está inactiva"
        )

    # ------------------------------------------------------
    # El usuario de la inspección será el usuario autenticado
    # mediante JWT.
    # ------------------------------------------------------

    datos_seguros = datos.model_copy(
        update={
            "usuario_id": usuario_actual.id
        }
    )

    inspeccion = inspeccion_service.crear_inspeccion(
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
            entidad="INSPECCION",
            entidad_id=inspeccion.id,
            accion="CREAR",
            datos_anteriores=None,
            datos_nuevos=inspeccion_a_dict(
                inspeccion
            )
        )
    )

    return inspeccion


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
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
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

    # Guardamos los datos ANTES de modificar
    verificar_autor_o_admin(usuario_actual, inspeccion.usuario_id)

    datos_anteriores = inspeccion_a_dict(
        inspeccion
    )

    # ------------------------------------------------------
    # Evitar que mediante PATCH cambien el usuario que
    # originalmente realizó la inspección
    # ------------------------------------------------------

    cambios = datos.model_dump(
        exclude_unset=True
    )

    cambios.pop(
        "usuario_id",
        None
    )

    # ------------------------------------------------------
    # Si intentan cambiar la colmena, validar que exista
    # ------------------------------------------------------

    if (
        "colmena_id" in cambios
        and cambios["colmena_id"] is not None
    ):
        colmena = inspeccion_service.obtener_colmena_activa(
            db,
            cambios["colmena_id"]
        )

        if colmena is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La colmena indicada no existe o está inactiva"
            )

    datos_seguros = InspeccionUpdate(
        **cambios
    )

    inspeccion_actualizada = (
        inspeccion_service.actualizar_inspeccion(
            db,
            inspeccion,
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
            entidad="INSPECCION",
            entidad_id=inspeccion_actualizada.id,
            accion="MODIFICAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=inspeccion_a_dict(
                inspeccion_actualizada
            )
        )
    )

    return inspeccion_actualizada


# ==========================================================
# BAJA LÓGICA
# ==========================================================

@router.delete(
    "/{inspeccion_id}",
    response_model=InspeccionResponse
)
def eliminar_inspeccion(
    inspeccion_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
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

    # Guardamos estado anterior
    verificar_autor_o_admin(usuario_actual, inspeccion.usuario_id)

    datos_anteriores = inspeccion_a_dict(
        inspeccion
    )

    inspeccion_eliminada = (
        inspeccion_service.eliminar_inspeccion(
            db,
            inspeccion
        )
    )

    # ------------------------------------------------------
    # AUDITORÍA
    # ------------------------------------------------------

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_actual.id,
            entidad="INSPECCION",
            entidad_id=inspeccion_eliminada.id,
            accion="ELIMINAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=inspeccion_a_dict(
                inspeccion_eliminada
            )
        )
    )

    return inspeccion_eliminada