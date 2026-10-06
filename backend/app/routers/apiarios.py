from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import requerir_admin
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.apiario import (
    ApiarioCreate,
    ApiarioUpdate,
    ApiarioResponse
)
from app.schemas.auditoria import AuditoriaCreate
from app.services import apiario as apiario_service
from app.services import auditoria as auditoria_service


router = APIRouter(
    prefix="/apiarios",
    tags=["Apiarios"]
)


# ==========================================================
# FUNCIÓN AUXILIAR PARA AUDITORÍA
# ==========================================================

def apiario_a_dict(apiario):
    return {
        "id": apiario.id,
        "nombre": apiario.nombre,
        "ubicacion": apiario.ubicacion,
        "descripcion": apiario.descripcion,
        "activo": apiario.activo
    }


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
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin)
):
    apiario = apiario_service.crear_apiario(
        db,
        datos
    )

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario.id,
            entidad="APIARIO",
            entidad_id=apiario.id,
            accion="CREAR",
            datos_anteriores=None,
            datos_nuevos=apiario_a_dict(apiario)
        )
    )

    return apiario


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
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin)
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

    datos_anteriores = apiario_a_dict(apiario)

    apiario_actualizado = apiario_service.actualizar_apiario(
        db,
        apiario,
        datos
    )

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario.id,
            entidad="APIARIO",
            entidad_id=apiario_actualizado.id,
            accion="MODIFICAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=apiario_a_dict(apiario_actualizado)
        )
    )

    return apiario_actualizado


# ==========================================================
# BAJA LÓGICA
# ==========================================================

@router.delete(
    "/{apiario_id}",
    response_model=ApiarioResponse
)
def eliminar_apiario(
    apiario_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin)
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

    datos_anteriores = apiario_a_dict(apiario)

    try:
        apiario_eliminado = apiario_service.eliminar_apiario(db, apiario)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error)
        ) from error

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario.id,
            entidad="APIARIO",
            entidad_id=apiario_eliminado.id,
            accion="ELIMINAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=apiario_a_dict(apiario_eliminado)
        )
    )

    return apiario_eliminado