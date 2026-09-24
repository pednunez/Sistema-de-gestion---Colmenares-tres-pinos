from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.transferencia_marco import TransferenciaMarco
from app.models.usuario import Usuario
from app.schemas.transferencia_marco import TransferenciaMarcoCreate


# ==========================================================
# LISTAR TRANSFERENCIAS
# ==========================================================

def listar_transferencias(db: Session):
    consulta = (
        select(TransferenciaMarco)
        .order_by(TransferenciaMarco.fecha_transferencia.desc())
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER TRANSFERENCIA POR ID
# ==========================================================

def obtener_transferencia(
    db: Session,
    transferencia_id: int
):
    consulta = select(TransferenciaMarco).where(
        TransferenciaMarco.id == transferencia_id
    )

    return db.scalar(consulta)


# ==========================================================
# VALIDAR COLMENA ACTIVA
# ==========================================================

def obtener_colmena_activa(
    db: Session,
    colmena_id: int
):
    consulta = select(Colmena).where(
        Colmena.id == colmena_id,
        Colmena.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# VALIDAR USUARIO ACTIVO
# ==========================================================

def obtener_usuario_activo(
    db: Session,
    usuario_id: int
):
    consulta = select(Usuario).where(
        Usuario.id == usuario_id,
        Usuario.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# CREAR TRANSFERENCIA
# ==========================================================

def crear_transferencia(
    db: Session,
    datos: TransferenciaMarcoCreate
):
    transferencia = TransferenciaMarco(
        colmena_origen_id=datos.colmena_origen_id,
        colmena_destino_id=datos.colmena_destino_id,
        usuario_id=datos.usuario_id,
        cantidad_marcos=datos.cantidad_marcos,
        tipo_marco=datos.tipo_marco,
        motivo=datos.motivo,
        observaciones=datos.observaciones
    )

    db.add(transferencia)

    db.commit()

    db.refresh(transferencia)

    return transferencia