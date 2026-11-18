from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.auditoria import Auditoria
from app.schemas.auditoria import AuditoriaCreate


# ==========================================================
# LISTAR REGISTROS DE AUDITORÍA
# ==========================================================

def listar_auditoria(
    db: Session, *, entidad: str | None = None, accion: str | None = None,
    usuario_id: int | None = None, desde: date | None = None,
    hasta: date | None = None, offset: int = 0, limit: int | None = None,
):
    filtros = []
    if entidad is not None:
        filtros.append(func.lower(Auditoria.entidad) == entidad.lower())
    if accion is not None:
        filtros.append(Auditoria.accion == accion)
    if usuario_id is not None:
        filtros.append(Auditoria.usuario_id == usuario_id)
    zona = ZoneInfo("America/Santiago")
    if desde is not None:
        filtros.append(Auditoria.fecha >= datetime.combine(
            desde, time.min, tzinfo=zona).astimezone(timezone.utc))
    if hasta is not None:
        filtros.append(Auditoria.fecha <= datetime.combine(
            hasta, time.max, tzinfo=zona).astimezone(timezone.utc))
    total = db.scalar(select(func.count()).select_from(Auditoria).where(*filtros))
    consulta = (
        select(Auditoria)
        .where(*filtros)
        .order_by(Auditoria.fecha.desc(), Auditoria.id.desc())
        .offset(offset)
    )
    if limit is not None:
        consulta = consulta.limit(limit)
    return db.scalars(consulta).all(), total


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
    datos: AuditoriaCreate,
    *,
    commit: bool = True
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
    if commit:
        db.commit()
        db.refresh(registro)
    else:
        db.flush()

    return registro
