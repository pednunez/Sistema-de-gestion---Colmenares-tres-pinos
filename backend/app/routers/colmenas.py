from io import BytesIO
from uuid import UUID

import qrcode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.colmena import (
    ColmenaCreate,
    ColmenaUpdate,
    ColmenaResponse
)

from app.schemas.auditoria import AuditoriaCreate

from app.services import colmena as colmena_service
from app.services import auditoria as auditoria_service


router = APIRouter(
    prefix="/colmenas",
    tags=["Colmenas"]
)


# ==========================================================
# FUNCIÓN AUXILIAR PARA AUDITORÍA
# ==========================================================

def colmena_a_dict(colmena):

    return {
        "id": colmena.id,
        "apiario_id": colmena.apiario_id,
        "codigo": colmena.codigo,
        "codigo_qr": (
            str(colmena.codigo_qr)
            if colmena.codigo_qr
            else None
        ),
        "estado": colmena.estado,
        "fecha_instalacion": (
            str(colmena.fecha_instalacion)
            if colmena.fecha_instalacion
            else None
        ),
        "observaciones": colmena.observaciones,
        "activo": colmena.activo
    }


# ==========================================================
# LISTAR COLMENAS
# ==========================================================

@router.get(
    "/",
    response_model=list[ColmenaResponse]
)
def listar_colmenas(
    db: Session = Depends(get_db)
):
    return colmena_service.listar_colmenas(db)


# ==========================================================
# CONSULTAR COLMENA MEDIANTE CÓDIGO QR
# ==========================================================

@router.get(
    "/qr/{codigo_qr}",
    response_model=ColmenaResponse,
    name="consultar_colmena_por_qr"
)
def consultar_colmena_por_qr(
    codigo_qr: UUID,
    db: Session = Depends(get_db)
):
    colmena = colmena_service.obtener_colmena_por_qr(
        db,
        codigo_qr
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No existe una colmena activa asociada a este código QR"
        )

    return colmena


# ==========================================================
# GENERAR IMAGEN QR DE UNA COLMENA
# ==========================================================

@router.get(
    "/{colmena_id}/qr",
    response_class=StreamingResponse
)
def generar_qr_colmena(
    colmena_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    colmena = colmena_service.obtener_colmena(
        db,
        colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colmena no encontrada"
        )

    if colmena.codigo_qr is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La colmena no posee un código QR"
        )

    # URL que abrirá el QR al ser escaneado
    url_colmena = str(
        request.url_for(
            "consultar_colmena_por_qr",
            codigo_qr=str(colmena.codigo_qr)
        )
    )

    # Generar QR
    qr = qrcode.QRCode(
        version=1,
        box_size=10,
        border=4
    )

    qr.add_data(url_colmena)
    qr.make(fit=True)

    imagen = qr.make_image(
        fill_color="black",
        back_color="white"
    )

    buffer = BytesIO()
    imagen.save(
        buffer,
        format="PNG"
    )
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="image/png",
        headers={
            "Content-Disposition": (
                f'inline; filename="QR_{colmena.codigo}.png"'
            )
        }
    )


# ==========================================================
# OBTENER COLMENA POR ID
# ==========================================================

@router.get(
    "/{colmena_id}",
    response_model=ColmenaResponse
)
def obtener_colmena(
    colmena_id: int,
    db: Session = Depends(get_db)
):
    colmena = colmena_service.obtener_colmena(
        db,
        colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colmena no encontrada"
        )

    return colmena


# ==========================================================
# CREAR COLMENA
# ==========================================================

@router.post(
    "/",
    response_model=ColmenaResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_colmena(
    datos: ColmenaCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual)
):

    apiario = colmena_service.obtener_apiario_activo(
        db,
        datos.apiario_id
    )

    if apiario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El apiario indicado no existe o está inactivo"
        )

    colmena_existente = colmena_service.obtener_colmena_por_codigo(
        db,
        datos.codigo
    )

    if colmena_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una colmena con ese código"
        )

    colmena = colmena_service.crear_colmena(
        db,
        datos
    )

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario.id,
            entidad="COLMENA",
            entidad_id=colmena.id,
            accion="CREAR",
            datos_anteriores=None,
            datos_nuevos=colmena_a_dict(colmena)
        )
    )

    return colmena


# ==========================================================
# ACTUALIZAR COLMENA
# ==========================================================

@router.patch(
    "/{colmena_id}",
    response_model=ColmenaResponse
)
def actualizar_colmena(
    colmena_id: int,
    datos: ColmenaUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual)
):

    colmena = colmena_service.obtener_colmena(
        db,
        colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colmena no encontrada"
        )

    datos_anteriores = colmena_a_dict(colmena)

    if datos.apiario_id is not None:

        apiario = colmena_service.obtener_apiario_activo(
            db,
            datos.apiario_id
        )

        if apiario is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El apiario indicado no existe o está inactivo"
            )

    if datos.codigo is not None:

        existente = colmena_service.obtener_colmena_por_codigo(
            db,
            datos.codigo
        )

        if (
            existente is not None
            and existente.id != colmena_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe una colmena con ese código"
            )

    colmena_actualizada = colmena_service.actualizar_colmena(
        db,
        colmena,
        datos
    )

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario.id,
            entidad="COLMENA",
            entidad_id=colmena_actualizada.id,
            accion="MODIFICAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=colmena_a_dict(
                colmena_actualizada
            )
        )
    )

    return colmena_actualizada


# ==========================================================
# BAJA LÓGICA
# ==========================================================

@router.delete(
    "/{colmena_id}",
    response_model=ColmenaResponse
)
def eliminar_colmena(
    colmena_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual)
):

    colmena = colmena_service.obtener_colmena(
        db,
        colmena_id
    )

    if colmena is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Colmena no encontrada"
        )

    datos_anteriores = colmena_a_dict(colmena)

    colmena_eliminada = colmena_service.eliminar_colmena(
        db,
        colmena
    )

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario.id,
            entidad="COLMENA",
            entidad_id=colmena_eliminada.id,
            accion="ELIMINAR",
            datos_anteriores=datos_anteriores,
            datos_nuevos=colmena_a_dict(
                colmena_eliminada
            )
        )
    )

    return colmena_eliminada