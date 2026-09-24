from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auditoria import Auditoria
from app.schemas.auditoria import AuditoriaCreate


# ==========================================================
# LISTAR REGISTROS DE AUDITORÍA
# ==========================================================

def listar_auditoria(db: Session):
    consulta = (
        select(Auditoria)
        .order_by(Auditoria.fecha.desc())
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER REGISTRO DE AUDITORÍA POR ID
# ==========================================================

def obtener_auditoria(
    db: Session,
    auditoria_id: int
):
    consulta = select(Auditoria).where(
        Auditoria.id == auditoria_id
    )

    return db.scalar(consulta)


# ==========================================================
# REGISTRAR EVENTO DE AUDITORÍA
# ==========================================================

def registrar_auditoria(
    db: Session,
    datos: AuditoriaCreate
):
    registro = Auditoria(
        usuario_id=datos.usuario_id,
        entidad=datos.entidad,
        entidad_id=datos.entidad_id,
        accion=datos.accion,
        datos_anteriores=datos.datos_anteriores,
        datos_nuevos=datos.datos_nuevos
    )

    db.add(registro)
    db.commit()
    db.refresh(registro)

    return registro