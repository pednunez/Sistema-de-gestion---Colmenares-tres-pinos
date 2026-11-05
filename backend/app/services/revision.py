from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.grupo import GrupoColmena
from app.models.inspeccion import Inspeccion
from app.models.revision import SesionRevision, SesionRevisionColmena
from app.schemas.revision import (
    ColmenaEnSesion,
    ProgresoSesion,
    SesionRevisionResponse,
)
from app.services import grupo as grupo_service


# ==========================================================
# SERVICIO DE SESIONES DE REVISION POR GRUPO (S2-T16)
# ==========================================================
#
# Las funciones de escritura no hacen commit: el router
# confirma junto con la auditoria (o con la inspeccion).
# ==========================================================


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def obtener_sesion(db: Session, sesion_id: int) -> SesionRevision | None:
    return db.get(SesionRevision, sesion_id)


def obtener_por_id_cliente(db: Session, id_cliente) -> SesionRevision | None:
    return db.scalar(
        select(SesionRevision).where(SesionRevision.id_cliente == id_cliente)
    )


def sesion_en_curso_del_grupo(db: Session, grupo_id: int) -> SesionRevision | None:
    return db.scalar(
        select(SesionRevision).where(
            SesionRevision.grupo_id == grupo_id,
            SesionRevision.estado == "EN_CURSO",
        )
    )


def listar_sesiones(
    db: Session,
    grupo_id: int | None = None,
    estado: str | None = None,
) -> list[SesionRevision]:

    consulta = select(SesionRevision).order_by(
        SesionRevision.fecha_inicio.desc(),
        SesionRevision.id.desc(),
    )

    if grupo_id is not None:
        consulta = consulta.where(SesionRevision.grupo_id == grupo_id)

    if estado is not None:
        consulta = consulta.where(SesionRevision.estado == estado)

    return db.scalars(consulta).all()


def crear_sesion(
    db: Session,
    grupo: GrupoColmena,
    usuario_id: int,
    id_cliente=None,
) -> SesionRevision:
    """Crea la sesion con las colmenas operativas del grupo, en
    orden de codigo. ValueError si el grupo no tiene ninguna."""

    colmenas = [
        colmena
        for colmena, _ in grupo_service.colmenas_del_grupo(db, grupo.id)
        if colmena.activo
        and colmena.estado not in grupo_service.ESTADOS_NO_OPERATIVOS
    ]

    if not colmenas:
        raise ValueError("El grupo no tiene colmenas operativas para revisar")

    sesion = SesionRevision(
        apiario_id=grupo.apiario_id,
        grupo_id=grupo.id,
        usuario_id=usuario_id,
        estado="EN_CURSO",
        id_cliente=id_cliente,
        fecha_inicio=ahora(),
    )

    db.add(sesion)
    db.flush()

    for orden, colmena in enumerate(colmenas, start=1):
        db.add(
            SesionRevisionColmena(
                sesion_id=sesion.id,
                colmena_id=colmena.id,
                orden=orden,
                estado="PENDIENTE",
            )
        )

    db.flush()

    return sesion


def fila_de_colmena(
    db: Session,
    sesion_id: int,
    colmena_id: int,
) -> SesionRevisionColmena | None:

    return db.scalar(
        select(SesionRevisionColmena).where(
            SesionRevisionColmena.sesion_id == sesion_id,
            SesionRevisionColmena.colmena_id == colmena_id,
        )
    )


def marcar_revisada(
    db: Session,
    fila: SesionRevisionColmena,
    inspeccion_id: int,
) -> None:

    fila.estado = "REVISADA"
    fila.inspeccion_id = inspeccion_id
    fila.motivo_omision = None
    fila.fecha_actualizacion = ahora()
    db.flush()


def omitir(
    db: Session,
    fila: SesionRevisionColmena,
    motivo: str | None,
) -> None:

    fila.estado = "OMITIDA"
    fila.motivo_omision = (motivo or "").strip() or None
    fila.fecha_actualizacion = ahora()
    db.flush()


def finalizar(db: Session, sesion: SesionRevision) -> None:
    """Cierre parcial permitido: las pendientes quedan pendientes."""

    sesion.estado = "FINALIZADA"
    sesion.fecha_fin = ahora()
    db.flush()


def detalle(db: Session, sesion: SesionRevision) -> SesionRevisionResponse:

    filas = db.execute(
        select(SesionRevisionColmena, Colmena.codigo, Inspeccion.estado_general)
        .join(Colmena, Colmena.id == SesionRevisionColmena.colmena_id)
        .outerjoin(Inspeccion, Inspeccion.id == SesionRevisionColmena.inspeccion_id)
        .where(SesionRevisionColmena.sesion_id == sesion.id)
        .order_by(SesionRevisionColmena.orden)
    ).all()

    colmenas = [
        ColmenaEnSesion(
            orden=fila.orden,
            colmena_id=fila.colmena_id,
            codigo=codigo,
            estado=fila.estado,
            inspeccion_id=fila.inspeccion_id,
            estado_general=estado_general,
            motivo_omision=fila.motivo_omision,
        )
        for fila, codigo, estado_general in filas
    ]

    resumen: dict[str, int] = {}

    for colmena in colmenas:
        if colmena.estado == "REVISADA" and colmena.estado_general:
            resumen[colmena.estado_general] = resumen.get(colmena.estado_general, 0) + 1

    contar = lambda estado: sum(1 for c in colmenas if c.estado == estado)

    grupo = db.get(GrupoColmena, sesion.grupo_id)

    return SesionRevisionResponse(
        id=sesion.id,
        apiario_id=sesion.apiario_id,
        grupo_id=sesion.grupo_id,
        grupo_nombre=grupo.nombre if grupo else "",
        usuario_id=sesion.usuario_id,
        estado=sesion.estado,
        id_cliente=sesion.id_cliente,
        fecha_inicio=sesion.fecha_inicio,
        fecha_fin=sesion.fecha_fin,
        progreso=ProgresoSesion(
            total=len(colmenas),
            revisadas=contar("REVISADA"),
            omitidas=contar("OMITIDA"),
            pendientes=contar("PENDIENTE"),
        ),
        siguiente_colmena_id=next(
            (c.colmena_id for c in colmenas if c.estado == "PENDIENTE"),
            None,
        ),
        resumen_estados=resumen,
        colmenas=colmenas,
    )
