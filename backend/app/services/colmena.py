from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.schemas.colmena import ColmenaCreate, ColmenaUpdate


def listar_colmenas(db: Session):
    consulta = (
        select(Colmena)
        .where(Colmena.activo == True)
        .order_by(Colmena.id)
    )

    return db.scalars(consulta).all()


def obtener_colmena(db: Session, colmena_id: int):
    consulta = select(Colmena).where(
        Colmena.id == colmena_id,
        Colmena.activo == True
    )

    return db.scalar(consulta)


def obtener_colmena_por_codigo(db: Session, codigo: str):
    consulta = select(Colmena).where(
        Colmena.codigo == codigo,
        Colmena.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER COLMENA POR CÓDIGO QR
# ==========================================================

def obtener_colmena_por_qr(
    db: Session,
    codigo_qr: UUID
):
    consulta = select(Colmena).where(
        Colmena.codigo_qr == codigo_qr,
        Colmena.activo == True
    )

    return db.scalar(consulta)


def obtener_apiario_activo(db: Session, apiario_id: int):
    consulta = select(Apiario).where(
        Apiario.id == apiario_id,
        Apiario.activo == True
    )

    return db.scalar(consulta)


def crear_colmena(
    db: Session,
    datos: ColmenaCreate
):
    colmena = Colmena(
        apiario_id=datos.apiario_id,
        codigo=datos.codigo,
        estado=datos.estado,
        fecha_instalacion=datos.fecha_instalacion,
        observaciones=datos.observaciones
    )

    db.add(colmena)
    db.commit()
    db.refresh(colmena)

    return colmena


def actualizar_colmena(
    db: Session,
    colmena: Colmena,
    datos: ColmenaUpdate
):
    datos_actualizados = datos.model_dump(
        exclude_unset=True
    )

    for campo, valor in datos_actualizados.items():
        setattr(colmena, campo, valor)

    db.commit()
    db.refresh(colmena)

    return colmena


def eliminar_colmena(
    db: Session,
    colmena: Colmena
):
    colmena.activo = False
    colmena.estado = "BAJA"
    colmena.fecha_eliminacion = datetime.now(timezone.utc)

    db.commit()
    db.refresh(colmena)

    return colmena