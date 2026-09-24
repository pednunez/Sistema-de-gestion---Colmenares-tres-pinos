from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import generar_hash_password
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate


def listar_usuarios(db: Session):
    consulta = (
        select(Usuario)
        .where(Usuario.activo == True)
        .order_by(Usuario.id)
    )

    return db.scalars(consulta).all()


def obtener_usuario(db: Session, usuario_id: int):
    consulta = select(Usuario).where(
        Usuario.id == usuario_id,
        Usuario.activo == True
    )

    return db.scalar(consulta)


def obtener_usuario_por_email(db: Session, email: str):
    consulta = select(Usuario).where(
        Usuario.email == email
    )

    return db.scalar(consulta)


def crear_usuario(
    db: Session,
    datos: UsuarioCreate
):
    hash_password = generar_hash_password(
        datos.password
    )

    usuario = Usuario(
        nombre=datos.nombre,
        apellido=datos.apellido,
        email=datos.email,
        password_hash=hash_password,
        rol=datos.rol
    )

    db.add(usuario)
    db.commit()
    db.refresh(usuario)

    return usuario


def actualizar_usuario(
    db: Session,
    usuario: Usuario,
    datos: UsuarioUpdate
):
    datos_actualizados = datos.model_dump(
        exclude_unset=True
    )

    for campo, valor in datos_actualizados.items():
        setattr(usuario, campo, valor)

    db.commit()
    db.refresh(usuario)

    return usuario


def eliminar_usuario(
    db: Session,
    usuario: Usuario
):
    usuario.activo = False
    usuario.fecha_eliminacion = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(usuario)

    return usuario