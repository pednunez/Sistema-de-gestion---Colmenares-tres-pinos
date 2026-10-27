
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import (
    obtener_usuario_actual,
    verificar_autor_o_admin,
)
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.inspeccion import (
    InspeccionCreate,
    InspeccionUpdate,
    InspeccionResponse,
)
from app.schemas.auditoria import AuditoriaCreate

from app.services import inspeccion as inspeccion_service
from app.services import auditoria as auditoria_service


# ==========================================================
# CONFIGURACIÓN DEL ROUTER
# ==========================================================

router = APIRouter(
    prefix="/inspecciones",
    tags=["Inspecciones"],
)


# ==========================================================
# FUNCIONES AUXILIARES PARA AUDITORÍA
# ==========================================================

def valor_json(valor):
    """Convierte valores especiales a formatos JSON."""

    if isinstance(valor, (datetime, date)):
        return valor.isoformat()

    if isinstance(valor, UUID):
        return str(valor)

    if isinstance(valor, Enum):
        return valor.value

    if isinstance(valor, Decimal):
        return float(valor)

    return valor


def objeto_a_dict(objeto):
    """
    Convierte las columnas SQLAlchemy de un objeto
    en un diccionario compatible con JSON.
    """

    return {
        columna.key: valor_json(
            getattr(objeto, columna.key)
        )
        for columna in sa_inspect(objeto).mapper.column_attrs
    }


def inspeccion_a_dict(inspeccion):
    """
    Guarda una fotografía de la inspección, incluyendo
    el detalle individual de sus marcos.

    Esto permite conservar en auditoría los cambios
    de posiciones, contenido y destinos.
    """

    resultado = objeto_a_dict(inspeccion)

    resultado["marcos"] = [
        objeto_a_dict(marco)
        for marco in inspeccion.marcos
    ]

    return resultado


# ==========================================================
# LISTAR INSPECCIONES ACTIVAS
# ==========================================================

@router.get(
    "/",
    response_model=list[InspeccionResponse],
)
def listar_inspecciones(
    db: Session = Depends(get_db),
):
    return inspeccion_service.listar_inspecciones(db)


# ==========================================================
# OBTENER INSPECCIÓN POR ID
# ==========================================================

@router.get(
    "/{inspeccion_id}",
    response_model=InspeccionResponse,
)
def obtener_inspeccion(
    inspeccion_id: int,
    db: Session = Depends(get_db),
):
    inspeccion = inspeccion_service.obtener_inspeccion(
        db,
        inspeccion_id,
    )

    if inspeccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inspección no encontrada",
        )

    return inspeccion


# ==========================================================
# SINCRONIZACIÓN DESDE LA APP MÓVIL
# ==========================================================
#
# Si el id_cliente ya llegó antes (la app reintentó porque
# se cortó la señal), se devuelve el registro existente con
# 200 en vez de crear otro. Un id_cliente de otro usuario
# se rechaza: no se entrega un registro ajeno.
# ==========================================================

def registro_ya_sincronizado(registro, usuario: Usuario, response: Response):

    if registro.usuario_id != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El id_cliente ya fue usado por otro usuario"
        )

    response.status_code = status.HTTP_200_OK

    return registro


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================

@router.post(
    "/",
    response_model=InspeccionResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_inspeccion(
    datos: InspeccionCreate,
    response: Response,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(
        obtener_usuario_actual
    ),
):
    # ------------------------------------------------------
    # REINTENTO DE SINCRONIZACIÓN
    # ------------------------------------------------------

    if datos.id_cliente is not None:

        existente = inspeccion_service.obtener_por_id_cliente(
            db,
            datos.id_cliente,
        )

        if existente is not None:
            return registro_ya_sincronizado(existente, usuario_actual, response)

    # ------------------------------------------------------
    # VALIDAR COLMENA
    # ------------------------------------------------------

    colmena = inspeccion_service.obtener_colmena_activa(
        db,
        datos.colmena_id,
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La colmena indicada no existe o está inactiva"
            ),
        )

    # ------------------------------------------------------
    # UTILIZAR EL USUARIO DEL JWT
    # ------------------------------------------------------

    datos_seguros = datos.model_copy(
        update={
            "usuario_id": usuario_actual.id,
        }
    )

    # ------------------------------------------------------
    # TRANSACCIÓN: INSPECCIÓN + MARCOS + AUDITORÍA
    # ------------------------------------------------------

    try:
        # Crear la inspección sin hacer commit.
        inspeccion = inspeccion_service.crear_inspeccion(
            db,
            datos_seguros,
            commit=False,
        )

        # Crear la auditoría sin hacer commit.
        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_actual.id,
                entidad="INSPECCION",
                entidad_id=inspeccion.id,
                accion="CREAR",
                datos_anteriores=None,
                datos_nuevos=inspeccion_a_dict(inspeccion),
            ),
            commit=False,
        )

        # Confirmar todas las operaciones juntas.
        db.commit()

        db.refresh(inspeccion)

        return inspeccion

    except ValueError as error:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    except IntegrityError:
        db.rollback()

        # Dos envíos simultáneos del mismo id_cliente: gana el primero.
        existente = (
            inspeccion_service.obtener_por_id_cliente(db, datos.id_cliente)
            if datos.id_cliente is not None
            else None
        )

        if existente is None:
            raise

        return registro_ya_sincronizado(existente, usuario_actual, response)

    except Exception:
        db.rollback()
        raise


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================

@router.patch(
    "/{inspeccion_id}",
    response_model=InspeccionResponse,
)
def actualizar_inspeccion(
    inspeccion_id: int,
    datos: InspeccionUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(
        obtener_usuario_actual
    ),
):
    # ------------------------------------------------------
    # BUSCAR INSPECCIÓN
    # ------------------------------------------------------

    inspeccion = inspeccion_service.obtener_inspeccion(
        db,
        inspeccion_id,
    )

    if inspeccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inspección no encontrada",
        )

    # ------------------------------------------------------
    # VALIDAR AUTOR O ADMINISTRADOR
    # ------------------------------------------------------

    verificar_autor_o_admin(
        usuario_actual,
        inspeccion.usuario_id,
    )

    # ------------------------------------------------------
    # IMPEDIR CAMBIOS DE COLMENA Y AUTOR
    # ------------------------------------------------------

    cambios = datos.model_dump(
        exclude_unset=True
    )

    if (
        "colmena_id" in cambios
        and cambios["colmena_id"] != inspeccion.colmena_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede cambiar la colmena "
                "de una inspección existente"
            ),
        )

    # No aceptar cambios de autor desde el cliente.
    cambios.pop("colmena_id", None)
    cambios.pop("usuario_id", None)

    datos_seguros = InspeccionUpdate(
        **cambios
    )

    # ------------------------------------------------------
    # GUARDAR ESTADO ANTERIOR
    # ------------------------------------------------------

    datos_anteriores = inspeccion_a_dict(
        inspeccion
    )

    # ------------------------------------------------------
    # TRANSACCIÓN: ACTUALIZACIÓN + AUDITORÍA
    # ------------------------------------------------------

    try:
        inspeccion_actualizada = (
            inspeccion_service.actualizar_inspeccion(
                db,
                inspeccion,
                datos_seguros,
                commit=False,
            )
        )

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
                ),
            ),
            commit=False,
        )

        db.commit()

        db.refresh(inspeccion_actualizada)

        return inspeccion_actualizada

    except ValueError as error:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    except Exception:
        db.rollback()
        raise


# ==========================================================
# ANULAR INSPECCIÓN (BAJA LÓGICA)
# ==========================================================

@router.delete(
    "/{inspeccion_id}",
    response_model=InspeccionResponse,
)
def eliminar_inspeccion(
    inspeccion_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(
        obtener_usuario_actual
    ),
):
    # ------------------------------------------------------
    # BUSCAR INSPECCIÓN
    # ------------------------------------------------------

    inspeccion = inspeccion_service.obtener_inspeccion(
        db,
        inspeccion_id,
    )

    if inspeccion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inspección no encontrada",
        )

    # ------------------------------------------------------
    # VALIDAR AUTOR O ADMINISTRADOR
    # ------------------------------------------------------

    verificar_autor_o_admin(
        usuario_actual,
        inspeccion.usuario_id,
    )

    # ------------------------------------------------------
    # GUARDAR ESTADO ANTERIOR
    # ------------------------------------------------------

    datos_anteriores = inspeccion_a_dict(
        inspeccion
    )

    # ------------------------------------------------------
    # TRANSACCIÓN: BAJA LÓGICA + AUDITORÍA
    # ------------------------------------------------------

    try:
        inspeccion_eliminada = (
            inspeccion_service.eliminar_inspeccion(
                db,
                inspeccion,
                commit=False,
            )
        )

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
                ),
            ),
            commit=False,
        )

        db.commit()

        db.refresh(inspeccion_eliminada)

        return inspeccion_eliminada

    except ValueError as error:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        ) from error

    except Exception:
        db.rollback()
        raise
