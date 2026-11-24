from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError

from app.database import settings


REFRESH_TOKEN_EXPIRE_DAYS = 30


def crear_access_token(
    usuario_id: int,
    email: str,
    rol: str,
    version_sesion: int = 0,
    csrf_token: str = ""
) -> str:

    expiracion = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(usuario_id),
        "email": email,
        "rol": rol,
        "exp": expiracion,
        "ver": version_sesion,
        "csrf": csrf_token,
        "token_use": "access",
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )


def crear_refresh_token(
    usuario_id: int,
    version_sesion: int = 0
) -> str:
    expiracion = datetime.now(timezone.utc) + timedelta(
        days=REFRESH_TOKEN_EXPIRE_DAYS
    )

    payload = {
        "sub": str(usuario_id),
        "exp": expiracion,
        "ver": version_sesion,
        "token_use": "refresh",
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )


def _decodificar_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "exp", "ver"]}
        )
    except InvalidTokenError:
        return None


def decodificar_access_token(token: str) -> dict | None:
    payload = _decodificar_token(token)
    if payload is None:
        return None

    # Los tokens antiguos no tenían token_use y se consideran access
    # para mantener compatibilidad con sesiones web/móviles existentes.
    if payload.get("token_use", "access") != "access":
        return None

    return payload


def decodificar_refresh_token(token: str) -> dict | None:
    payload = _decodificar_token(token)
    if payload is None or payload.get("token_use") != "refresh":
        return None

    return payload
