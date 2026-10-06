import secrets
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.auth import decodificar_access_token
from app.database import get_db, settings
from app.models.usuario import Usuario

security = HTTPBearer(auto_error=False)

def validar_origen(request: Request):
    origin = request.headers.get("origin")
    if origin is not None and origin not in settings.CORS_ORIGINS:
        raise HTTPException(403, "Origen no permitido")

def obtener_usuario_actual(
    request: Request,
    credenciales: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db)
):
    cookie = request.cookies.get(settings.SESSION_COOKIE_NAME)
    token = cookie or (credenciales.credentials if credenciales else None)
    payload = decodificar_access_token(token) if token else None
    if payload is None:
        raise HTTPException(401, "Sesion invalida o expirada")
    try:
        usuario_id = int(payload["sub"])
    except (ValueError, TypeError, KeyError):
        raise HTTPException(401, "Sesion invalida")
    usuario = db.scalar(select(Usuario).where(Usuario.id == usuario_id, Usuario.activo == True))
    if usuario is None or type(payload.get("ver")) is not int or payload["ver"] != usuario.version_sesion:
        raise HTTPException(401, "Sesion revocada o usuario inactivo")
    if cookie and request.method not in {"GET", "HEAD", "OPTIONS"}:
        validar_origen(request)
        csrf = request.headers.get("x-csrf-token", "")
        expected = payload.get("csrf")
        if not isinstance(expected, str) or not expected or not secrets.compare_digest(csrf.encode(), expected.encode()):
            raise HTTPException(403, "Token CSRF invalido")
    request.state.csrf_token = payload.get("csrf", "")
    return usuario

def requerir_admin(
    usuario: Usuario = Depends(obtener_usuario_actual)
):
    if usuario.rol != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción"
        )

    return usuario

def verificar_autor_o_admin(usuario: Usuario, autor_id: int) -> None:
    """Autoriza cambios solo al autor del registro o a un administrador."""
    if usuario.rol != "ADMIN" and usuario.id != autor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el autor o un administrador puede modificar este registro"
        )
