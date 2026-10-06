from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.security import generar_hash_password
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate
from app.schemas.auditoria import AuditoriaCreate
from app.services import auditoria


def listar_usuarios(db: Session):
    return db.scalars(select(Usuario).where(Usuario.activo == True).order_by(Usuario.id)).all()


def obtener_usuario(db: Session, usuario_id: int):
    return db.scalar(select(Usuario).where(Usuario.id == usuario_id, Usuario.activo == True))


def obtener_usuario_por_email(db: Session, email: str):
    return db.scalar(select(Usuario).where(Usuario.email == email))


def datos_auditables(usuario: Usuario):
    # Lista explicita: nunca serializar hashes, contrasenas ni tokens.
    return {campo: getattr(usuario, campo) for campo in
            ("id", "nombre", "apellido", "email", "rol", "activo")}


def guardar_con_auditoria(db, usuario, actor_id, accion, anteriores):
    try:
        db.flush()
        auditoria.registrar_auditoria(db, AuditoriaCreate(
            usuario_id=actor_id, entidad="usuarios", entidad_id=usuario.id,
            accion=accion, datos_anteriores=anteriores,
            datos_nuevos=datos_auditables(usuario)), commit=False)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(usuario)
    return usuario


def crear_usuario(db: Session, datos: UsuarioCreate, actor_id: int):
    usuario = Usuario(nombre=datos.nombre, apellido=datos.apellido, email=datos.email,
                      password_hash=generar_hash_password(datos.password), rol=datos.rol)
    db.add(usuario)
    return guardar_con_auditoria(db, usuario, actor_id, "CREAR", None)


def actualizar_usuario(db: Session, usuario: Usuario, datos: UsuarioUpdate, actor_id: int):
    anteriores = datos_auditables(usuario)
    cambios = datos.model_dump(exclude_unset=True)
    if any(campo in cambios and cambios[campo] != getattr(usuario, campo) for campo in ("email", "rol")):
        usuario.version_sesion += 1
        usuario.password_reset_token_hash = None
        usuario.password_reset_expira_en = None
    for campo, valor in cambios.items():
        setattr(usuario, campo, valor)
    usuario.fecha_actualizacion = datetime.now(timezone.utc)
    return guardar_con_auditoria(db, usuario, actor_id, "MODIFICAR", anteriores)


def eliminar_usuario(db: Session, usuario: Usuario, actor_id: int):
    anteriores = datos_auditables(usuario)
    usuario.activo = False
    usuario.version_sesion += 1
    usuario.password_reset_token_hash = None
    usuario.password_reset_expira_en = None
    usuario.fecha_eliminacion = datetime.now(timezone.utc)
    usuario.fecha_actualizacion = usuario.fecha_eliminacion
    return guardar_con_auditoria(db, usuario, actor_id, "ELIMINAR", anteriores)
