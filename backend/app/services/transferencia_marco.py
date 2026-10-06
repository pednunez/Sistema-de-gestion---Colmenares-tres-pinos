from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.transferencia_marco import TransferenciaMarco
from app.models.usuario import Usuario
from app.schemas.transferencia_marco import TransferenciaMarcoCreate


# ==========================================================
# LISTAR TRANSFERENCIAS
# ==========================================================

def listar_transferencias(
    db: Session
):
    consulta = (
        select(TransferenciaMarco)
        .order_by(
            TransferenciaMarco.fecha_transferencia.desc()
        )
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER TRANSFERENCIA POR ID
# ==========================================================

def obtener_transferencia(
    db: Session,
    transferencia_id: int
):
    consulta = select(
        TransferenciaMarco
    ).where(
        TransferenciaMarco.id == transferencia_id
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER / VALIDAR COLMENA ACTIVA
# ==========================================================

def obtener_colmena_activa(
    db: Session,
    colmena_id: int
):
    consulta = select(
        Colmena
    ).where(
        Colmena.id == colmena_id,
        Colmena.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER / VALIDAR USUARIO ACTIVO
# ==========================================================

def obtener_usuario_activo(
    db: Session,
    usuario_id: int
):
    consulta = select(
        Usuario
    ).where(
        Usuario.id == usuario_id,
        Usuario.activo == True
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER COLMENAS PARA TRANSFERENCIA
# ==========================================================
#
# Se bloquean temporalmente las filas mientras se realiza
# la transferencia.
#
# Esto ayuda a evitar que dos transferencias simultáneas
# utilicen la misma cantidad de marcos disponibles.
# ==========================================================

def obtener_colmenas_para_transferencia(
    db: Session,
    colmena_origen_id: int,
    colmena_destino_id: int
):
    consulta = (
        select(Colmena)
        .where(
            Colmena.id.in_([
                colmena_origen_id,
                colmena_destino_id
            ]),
            Colmena.activo == True
        )
        .with_for_update()
    )

    colmenas = db.scalars(
        consulta
    ).all()

    mapa_colmenas = {
        colmena.id: colmena
        for colmena in colmenas
    }

    colmena_origen = mapa_colmenas.get(
        colmena_origen_id
    )

    colmena_destino = mapa_colmenas.get(
        colmena_destino_id
    )

    return colmena_origen, colmena_destino


# ==========================================================
# CREAR TRANSFERENCIA DE MARCOS
# ==========================================================
#
# RF-40:
# Registrar transferencia de marcos.
#
# RF-41:
# Validar disponibilidad y actualizar las cantidades de
# marcos de las colmenas involucradas.
# ==========================================================

def crear_transferencia(
    db: Session,
    datos: TransferenciaMarcoCreate
):

    # ------------------------------------------------------
    # VALIDAR ORIGEN Y DESTINO DIFERENTES
    # ------------------------------------------------------

    if (
        datos.colmena_origen_id
        == datos.colmena_destino_id
    ):
        raise ValueError(
            "La colmena de origen y destino deben ser diferentes"
        )

    # ------------------------------------------------------
    # VALIDAR CANTIDAD
    # ------------------------------------------------------

    if datos.cantidad_marcos <= 0:
        raise ValueError(
            "La cantidad de marcos debe ser mayor que cero"
        )

    # ------------------------------------------------------
    # OBTENER Y BLOQUEAR LAS COLMENAS
    # ------------------------------------------------------

    (
        colmena_origen,
        colmena_destino
    ) = obtener_colmenas_para_transferencia(
        db,
        datos.colmena_origen_id,
        datos.colmena_destino_id
    )

    # ------------------------------------------------------
    # VALIDAR COLMENA DE ORIGEN
    # ------------------------------------------------------

    if colmena_origen is None:
        raise ValueError(
            "La colmena de origen no existe o está inactiva"
        )

    # ------------------------------------------------------
    # VALIDAR COLMENA DE DESTINO
    # ------------------------------------------------------

    if colmena_destino is None:
        raise ValueError(
            "La colmena de destino no existe o está inactiva"
        )

    # ------------------------------------------------------
    # OBTENER CANTIDAD ACTUAL DE MARCOS
    # ------------------------------------------------------

    marcos_origen = (
        colmena_origen.cantidad_marcos
        if colmena_origen.cantidad_marcos is not None
        else 0
    )

    marcos_destino = (
        colmena_destino.cantidad_marcos
        if colmena_destino.cantidad_marcos is not None
        else 0
    )

    # ------------------------------------------------------
    # VALIDAR MARCOS DISPONIBLES
    # ------------------------------------------------------

    if marcos_origen < datos.cantidad_marcos:
        raise ValueError(
            (
                "La colmena de origen no tiene suficientes "
                f"marcos disponibles. Tiene {marcos_origen} "
                f"y se intentan transferir "
                f"{datos.cantidad_marcos}."
            )
        )

    # ------------------------------------------------------
    # CALCULAR NUEVAS CANTIDADES
    # ------------------------------------------------------

    nueva_cantidad_origen = (
        marcos_origen
        - datos.cantidad_marcos
    )

    nueva_cantidad_destino = (
        marcos_destino
        + datos.cantidad_marcos
    )

    # ------------------------------------------------------
    # ACTUALIZAR COLMENA ORIGEN
    # ------------------------------------------------------

    colmena_origen.cantidad_marcos = (
        nueva_cantidad_origen
    )

    colmena_origen.fecha_actualizacion = (
        datetime.now(timezone.utc)
    )

    # ------------------------------------------------------
    # ACTUALIZAR COLMENA DESTINO
    # ------------------------------------------------------

    colmena_destino.cantidad_marcos = (
        nueva_cantidad_destino
    )

    colmena_destino.fecha_actualizacion = (
        datetime.now(timezone.utc)
    )

    # ------------------------------------------------------
    # CREAR REGISTRO HISTÓRICO DE LA TRANSFERENCIA
    # ------------------------------------------------------

    transferencia = TransferenciaMarco(
        colmena_origen_id=datos.colmena_origen_id,
        colmena_destino_id=datos.colmena_destino_id,
        usuario_id=datos.usuario_id,
        cantidad_marcos=datos.cantidad_marcos,
        tipo_marco=datos.tipo_marco,
        motivo=datos.motivo,
        observaciones=datos.observaciones
    )

    db.add(
        transferencia
    )

    # ------------------------------------------------------
    # GUARDAR TODO EN UNA MISMA TRANSACCIÓN
    # ------------------------------------------------------
    #
    # Se guardan juntos:
    #
    # 1. Descuento en colmena origen.
    # 2. Aumento en colmena destino.
    # 3. Registro de transferencia.
    #
    # Si ocurre un error antes del commit, se revierte.
    # ------------------------------------------------------

    try:
        db.commit()

    except Exception:
        db.rollback()
        raise

    db.refresh(
        transferencia
    )

    db.refresh(
        colmena_origen
    )

    db.refresh(
        colmena_destino
    )

    return transferencia