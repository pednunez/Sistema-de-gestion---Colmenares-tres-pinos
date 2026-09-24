from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import verificar_password
from app.models.usuario import Usuario


# ==========================================================
# BUSCAR USUARIO POR EMAIL
# ==========================================================

def obtener_usuario_por_email(
    db: Session,
    email: str
):
    consulta = select(Usuario).where(
        Usuario.email == email,
        Usuario.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# AUTENTICAR USUARIO
# ==========================================================

def autenticar_usuario(
    db: Session,
    email: str,
    password: str
):
    usuario = obtener_usuario_por_email(
        db,
        email
    )

    # Usuario inexistente o inactivo
    if usuario is None:
        return None

    # Verificar contraseña contra el hash Argon2
    password_correcta = verificar_password(
        password,
        usuario.password_hash
    )

    if not password_correcta:
        return None

    return usuario