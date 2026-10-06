from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import requerir_admin
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.usuario import (
    UsuarioCreate,
    UsuarioUpdate,
    UsuarioResponse
)
from app.services import usuario as usuario_service


router = APIRouter(
    prefix="/usuarios",
    tags=["Usuarios"]
)


# ==========================================================
# LISTAR USUARIOS
# ==========================================================

@router.get(
    "/",
    response_model=list[UsuarioResponse]
)
def listar_usuarios(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    return usuario_service.listar_usuarios(db)


# ==========================================================
# OBTENER USUARIO POR ID
# ==========================================================

@router.get(
    "/{usuario_id}",
    response_model=UsuarioResponse
)
def obtener_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    usuario = usuario_service.obtener_usuario(
        db,
        usuario_id
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    return usuario


# ==========================================================
# CREAR USUARIO
# ==========================================================

@router.post(
    "/",
    response_model=UsuarioResponse,
    status_code=status.HTTP_201_CREATED
)
def crear_usuario(
    datos: UsuarioCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    usuario_existente = usuario_service.obtener_usuario_por_email(
        db,
        datos.email
    )

    if usuario_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario con ese correo"
        )

    try:
        return usuario_service.crear_usuario(db, datos, actor_id=admin.id)
    except IntegrityError as error:
        db.rollback()
        if getattr(error.orig, "sqlstate", None) == "23505":
            raise HTTPException(409, "Ya existe un usuario con ese correo") from error
        raise


# ==========================================================
# ACTUALIZAR USUARIO
# ==========================================================

@router.patch(
    "/{usuario_id}",
    response_model=UsuarioResponse
)
def actualizar_usuario(
    usuario_id: int,
    datos: UsuarioUpdate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    usuario = usuario_service.obtener_usuario(
        db,
        usuario_id
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    # Si cambia el correo, verificar duplicados
    if datos.email is not None:

        existente = usuario_service.obtener_usuario_por_email(
            db,
            datos.email
        )

        if (
            existente is not None
            and existente.id != usuario_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un usuario con ese correo"
            )

    try:
        return usuario_service.actualizar_usuario(db, usuario, datos, actor_id=admin.id)
    except IntegrityError as error:
        db.rollback()
        if getattr(error.orig, "sqlstate", None) == "23505":
            raise HTTPException(409, "Ya existe un usuario con ese correo") from error
        raise


# ==========================================================
# BAJA LÓGICA
# ==========================================================

@router.delete(
    "/{usuario_id}",
    response_model=UsuarioResponse
)
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    usuario = usuario_service.obtener_usuario(
        db,
        usuario_id
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )

    return usuario_service.eliminar_usuario(
        db,
        usuario,
        actor_id=admin.id
    )