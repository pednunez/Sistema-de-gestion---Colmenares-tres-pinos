from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import crear_access_token
from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.auth import (
    LoginRequest,
    TokenResponse,
    UsuarioAutenticado
)
from app.services import auth as auth_service


router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"]
)


# ==========================================================
# LOGIN
# ==========================================================

@router.post(
    "/login",
    response_model=TokenResponse
)
def login(
    datos: LoginRequest,
    db: Session = Depends(get_db)
):
    usuario = auth_service.autenticar_usuario(
        db,
        datos.email,
        datos.password
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos"
        )

    token = crear_access_token(
        usuario_id=usuario.id,
        email=usuario.email,
        rol=usuario.rol
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer"
    )


# ==========================================================
# USUARIO ACTUAL
# ==========================================================

@router.get(
    "/me",
    response_model=UsuarioAutenticado
)
def obtener_mi_usuario(
    usuario: Usuario = Depends(obtener_usuario_actual)
):
    return UsuarioAutenticado(
        id=usuario.id,
        nombre=usuario.nombre,
        email=usuario.email,
        rol=usuario.rol
    )