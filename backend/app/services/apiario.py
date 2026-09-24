from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.apiario import Apiario
from app.schemas.apiario import ApiarioCreate, ApiarioUpdate


# ==========================================================
# LISTAR APIARIOS ACTIVOS
# ==========================================================

def listar_apiarios(db: Session):
    consulta = (
        select(Apiario)
        .where(Apiario.activo == True)
        .order_by(Apiario.id)
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER APIARIO POR ID
# ==========================================================

def obtener_apiario(db: Session, apiario_id: int):
    consulta = select(Apiario).where(
        Apiario.id == apiario_id,
        Apiario.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# CREAR APIARIO
# ==========================================================

def crear_apiario(
    db: Session,
    datos: ApiarioCreate
):
    apiario = Apiario(
        nombre=datos.nombre,
        ubicacion=datos.ubicacion,
        descripcion=datos.descripcion
    )

    db.add(apiario)

    db.commit()

    db.refresh(apiario)

    return apiario


# ==========================================================
# ACTUALIZAR APIARIO
# ==========================================================

def actualizar_apiario(
    db: Session,
    apiario: Apiario,
    datos: ApiarioUpdate
):
    datos_actualizados = datos.model_dump(
        exclude_unset=True
    )

    for campo, valor in datos_actualizados.items():
        setattr(apiario, campo, valor)

    db.commit()

    db.refresh(apiario)

    return apiario


# ==========================================================
# BAJA LÓGICA
# ==========================================================

def eliminar_apiario(
    db: Session,
    apiario: Apiario
):
    from datetime import datetime, timezone

    apiario.activo = False
    apiario.fecha_eliminacion = datetime.now(timezone.utc)

    db.commit()

    db.refresh(apiario)

    return apiario
