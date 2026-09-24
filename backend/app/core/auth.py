from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError

from app.database import settings


def crear_access_token(
    usuario_id: int,
    email: str,
    rol: str
) -> str:

    expiracion = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(usuario_id),
        "email": email,
        "rol": rol,
        "exp": expiracion
    }

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )

    return token


def decodificar_access_token(token: str) -> dict | None:

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )

        return payload

    except InvalidTokenError:
        return None