from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.tratamiento import Tratamiento
from app.models.usuario import Usuario
from app.schemas.tratamiento import (
    TratamientoCreate,
    TratamientoUpdate
)


# ==========================================================
# LISTAR TRATAMIENTOS
# ==========================================================

def listar_tratamientos(db: Session):
    consulta = (
        select(Tratamiento)
        .order_by(Tratamiento.fecha_inicio.desc())
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER TRATAMIENTO POR ID
# ==========================================================

def obtener_tratamiento(
    db: Session,
    tratamiento_id: int
):
    consulta = select(Tratamiento).where(
        Tratamiento.id == tratamiento_id
    )

    return db.scalar(consulta)


# ==========================================================
# VALIDAR COLMENA
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
# VALIDAR USUARIO
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
# VALIDAR INSPECCIÓN
# ==========================================================

def obtener_inspeccion(
    db: Session,
    inspeccion_id: int
):
    consulta = select(Inspeccion).where(
        Inspeccion.id == inspeccion_id,
        Inspeccion.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# CREAR TRATAMIENTO
# ==========================================================

def crear_tratamiento(
    db: Session,
    datos: TratamientoCreate
):
    tratamiento = Tratamiento(
        colmena_id=datos.colmena_id,
        inspeccion_id=datos.inspeccion_id,
        usuario_id=datos.usuario_id,
        tipo_tratamiento=datos.tipo_tratamiento,
        producto=datos.producto,
        dosis=datos.dosis,
        motivo=datos.motivo,
        fecha_inicio=datos.fecha_inicio,
        fecha_fin=datos.fecha_fin,
        estado=datos.estado,
        observaciones=datos.observaciones
    )

    db.add(tratamiento)
    db.commit()
    db.refresh(tratamiento)

    return tratamiento


# ==========================================================
# ACTUALIZAR TRATAMIENTO
# ==========================================================

def actualizar_tratamiento(
    db: Session,
    tratamiento: Tratamiento,
    datos: TratamientoUpdate
):
    datos_actualizados = datos.model_dump(
        exclude_unset=True
    )

    for campo, valor in datos_actualizados.items():
        setattr(tratamiento, campo, valor)

    db.commit()
    db.refresh(tratamiento)

    return tratamiento


# ==========================================================
# CANCELAR TRATAMIENTO
# ==========================================================

def cancelar_tratamiento(
    db: Session,
    tratamiento: Tratamiento
):
    tratamiento.estado = "CANCELADO"

    db.commit()
    db.refresh(tratamiento)

    return tratamiento