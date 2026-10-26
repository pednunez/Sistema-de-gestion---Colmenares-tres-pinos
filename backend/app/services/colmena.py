from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.schemas.colmena import ColmenaCreate, ColmenaUpdate


# ==========================================================
# LISTAR COLMENAS ACTIVAS
# ==========================================================

def escapar_like(texto: str) -> str:
    """Busca el texto literal: % y _ no actuan como comodines."""
    return (
        texto.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


def listar_colmenas(
    db: Session,
    apiario_id: int | None = None,
    offset: int = 0,
    limit: int | None = None,
    estado: str | None = None,
    codigo: str | None = None,
    orden: str = "id"
) -> tuple[list[Colmena], int]:
    """Devuelve la pagina pedida y el total de colmenas que cumplen el filtro."""

    condiciones = [Colmena.activo == True]

    if apiario_id is not None:
        condiciones.append(Colmena.apiario_id == apiario_id)

    if estado is not None:
        condiciones.append(Colmena.estado == estado)

    if codigo:
        condiciones.append(
            Colmena.codigo.ilike(
                f"%{escapar_like(codigo)}%",
                escape="\\"
            )
        )

    total = db.scalar(
        select(func.count()).select_from(Colmena).where(*condiciones)
    )

    # El id desempata para que la paginacion sea estable.
    orden_sql = (
        (Colmena.codigo, Colmena.id)
        if orden == "codigo"
        else (Colmena.id,)
    )

    consulta = (
        select(Colmena)
        .where(*condiciones)
        .order_by(*orden_sql)
        .offset(offset)
    )

    if limit is not None:
        consulta = consulta.limit(limit)

    return db.scalars(consulta).all(), total


# ==========================================================
# OBTENER COLMENA POR ID
# ==========================================================

def obtener_colmena(
    db: Session,
    colmena_id: int
):
    consulta = select(Colmena).where(
        Colmena.id == colmena_id,
        Colmena.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER COLMENA POR CÓDIGO
# ==========================================================

def obtener_colmena_por_codigo(
    db: Session,
    codigo: str
):
    consulta = select(Colmena).where(
        Colmena.codigo == codigo
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


# ==========================================================
# OBTENER APIARIO ACTIVO
# ==========================================================

def obtener_apiario_activo(
    db: Session,
    apiario_id: int
):
    # Coordina altas y traslados con la baja del apiario.
    consulta = (
        select(Apiario)
        .where(Apiario.id == apiario_id, Apiario.activo == True)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    return db.scalar(consulta)


# ==========================================================
# CREAR COLMENA
# ==========================================================

def crear_colmena(
    db: Session,
    datos: ColmenaCreate
):
    colmena = Colmena(
        apiario_id=datos.apiario_id,
        codigo=datos.codigo,
        estado=datos.estado,
        fecha_instalacion=datos.fecha_instalacion,

        # RF-25 / RF-40 / RF-41
        cantidad_marcos=datos.cantidad_marcos,

        observaciones=datos.observaciones
    )

    db.add(colmena)
    db.commit()
    db.refresh(colmena)

    return colmena


# ==========================================================
# ACTUALIZAR COLMENA
# ==========================================================

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

    colmena.fecha_actualizacion = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(colmena)

    return colmena


# ==========================================================
# ELIMINAR / DAR DE BAJA COLMENA
# ==========================================================

def eliminar_colmena(
    db: Session,
    colmena: Colmena
):
    colmena.activo = False
    colmena.estado = "BAJA"

    colmena.fecha_eliminacion = datetime.now(
        timezone.utc
    )

    colmena.fecha_actualizacion = datetime.now(
        timezone.utc
    )

    db.commit()
    db.refresh(colmena)

    return colmena