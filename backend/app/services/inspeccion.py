from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.usuario import Usuario
from app.schemas.inspeccion import (
    InspeccionCreate,
    InspeccionUpdate
)


def listar_inspecciones(db: Session):
    consulta = (
        select(Inspeccion)
        .where(Inspeccion.activo == True)
        .order_by(Inspeccion.fecha_inspeccion.desc())
    )

    return db.scalars(consulta).all()


def obtener_inspeccion(
    db: Session,
    inspeccion_id: int
):
    consulta = select(Inspeccion).where(
        Inspeccion.id == inspeccion_id,
        Inspeccion.activo == True
    )

    return db.scalar(consulta)


def obtener_colmena_activa(
    db: Session,
    colmena_id: int
):
    consulta = select(Colmena).where(
        Colmena.id == colmena_id,
        Colmena.activo == True
    )

    return db.scalar(consulta)


def obtener_usuario_activo(
    db: Session,
    usuario_id: int
):
    consulta = select(Usuario).where(
        Usuario.id == usuario_id,
        Usuario.activo == True
    )

    return db.scalar(consulta)


def crear_inspeccion(
    db: Session,
    datos: InspeccionCreate
):
    inspeccion = Inspeccion(
        colmena_id=datos.colmena_id,
        usuario_id=datos.usuario_id,
        estado_general=datos.estado_general,
        reina_observada=datos.reina_observada,
        presencia_cria=datos.presencia_cria,
        nivel_poblacion=datos.nivel_poblacion,
        reservas_alimento=datos.reservas_alimento,
        signos_enfermedad=datos.signos_enfermedad,
        enfermedad_observada=datos.enfermedad_observada,
        observaciones=datos.observaciones
    )

    db.add(inspeccion)
    db.commit()
    db.refresh(inspeccion)

    return inspeccion


def actualizar_inspeccion(
    db: Session,
    inspeccion: Inspeccion,
    datos: InspeccionUpdate
):
    datos_actualizados = datos.model_dump(
        exclude_unset=True
    )

    for campo, valor in datos_actualizados.items():
        setattr(inspeccion, campo, valor)

    db.commit()
    db.refresh(inspeccion)

    return inspeccion


def eliminar_inspeccion(
    db: Session,
    inspeccion: Inspeccion
):
    inspeccion.activo = False
    inspeccion.fecha_eliminacion = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(inspeccion)

    return inspeccion