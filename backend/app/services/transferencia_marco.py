
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.transferencia_marco import TransferenciaMarco
from app.models.usuario import Usuario
from app.schemas.transferencia_marco import TransferenciaMarcoCreate


# ==========================================================
# LISTAR TRANSFERENCIAS
# ==========================================================

def listar_transferencias(db: Session):
    consulta = (
        select(TransferenciaMarco)
        .order_by(
            TransferenciaMarco.fecha_transferencia.desc(),
            TransferenciaMarco.id.desc(),
        )
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER TRANSFERENCIA POR ID
# ==========================================================

def obtener_transferencia(
    db: Session,
    transferencia_id: int,
):
    consulta = (
        select(TransferenciaMarco)
        .where(TransferenciaMarco.id == transferencia_id)
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER COLMENA ACTIVA
# ==========================================================

def obtener_colmena_activa(
    db: Session,
    colmena_id: int,
):
    consulta = (
        select(Colmena)
        .where(
            Colmena.id == colmena_id,
            Colmena.activo.is_(True),
        )
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER USUARIO ACTIVO
# ==========================================================

def obtener_usuario_activo(
    db: Session,
    usuario_id: int,
):
    consulta = (
        select(Usuario)
        .where(
            Usuario.id == usuario_id,
            Usuario.activo.is_(True),
        )
    )

    return db.scalar(consulta)


# ==========================================================
# OBTENER Y BLOQUEAR COLMENAS
# ==========================================================
#
# Bloquear en orden de ID disminuye el riesgo de
# interbloqueos entre transferencias simultáneas.
#
# El bloqueo permanece hasta COMMIT o ROLLBACK.
# ==========================================================

def obtener_colmenas_para_transferencia(
    db: Session,
    colmena_origen_id: int,
    colmena_destino_id: int,
):
    consulta = (
        select(Colmena)
        .where(
            Colmena.id.in_(
                [colmena_origen_id, colmena_destino_id]
            ),
            Colmena.activo.is_(True),
        )
        .order_by(Colmena.id.asc())
        .with_for_update()
    )

    colmenas = db.scalars(consulta).all()

    mapa_colmenas = {
        colmena.id: colmena
        for colmena in colmenas
    }

    return (
        mapa_colmenas.get(colmena_origen_id),
        mapa_colmenas.get(colmena_destino_id),
    )


# ==========================================================
# VALIDAR VÍNCULO CON INSPECCIÓN
# ==========================================================

def validar_inspeccion_transferencia(
    db: Session,
    datos: TransferenciaMarcoCreate,
):
    if datos.inspeccion_id is None:
        return

    inspeccion = db.scalar(
        select(Inspeccion).where(
            Inspeccion.id == datos.inspeccion_id,
            Inspeccion.activo.is_(True),
        )
    )

    if inspeccion is None:
        raise ValueError(
            "La inspección indicada no existe o está inactiva"
        )

    if inspeccion.colmena_id != datos.colmena_origen_id:
        raise ValueError(
            "La colmena de origen no coincide con "
            "la colmena inspeccionada"
        )

    if inspeccion.usuario_id != datos.usuario_id:
        raise ValueError(
            "El usuario responsable no coincide con "
            "el autor de la inspección"
        )

    # El vínculo detallado exige los datos del marco.
    if (
        datos.ubicacion is None
        or datos.numero_marco is None
        or datos.contenido is None
    ):
        raise ValueError(
            "Una transferencia asociada a una inspección "
            "debe identificar la ubicación, número y "
            "contenido del marco"
        )


# ==========================================================
# CREAR TRANSFERENCIA
# ==========================================================
#
# commit=True:
#   Mantiene el comportamiento del router actual.
#
# commit=False:
#   Agrega la transferencia a la transacción actual,
#   pero NO realiza commit. El llamador debe hacerlo.
#
# En ambos casos se utiliza flush() para obtener el ID.
# ==========================================================

def crear_transferencia(
    db: Session,
    datos: TransferenciaMarcoCreate,
    *,
    commit: bool = True,
):
    # ------------------------------------------------------
    # VALIDACIONES GENERALES
    # ------------------------------------------------------

    if datos.colmena_origen_id == datos.colmena_destino_id:
        raise ValueError(
            "La colmena de origen y destino deben ser diferentes"
        )

    if datos.cantidad_marcos <= 0:
        raise ValueError(
            "La cantidad de marcos debe ser mayor que cero"
        )

    # ------------------------------------------------------
    # VALIDACIÓN DE INSPECCIÓN
    # ------------------------------------------------------

    validar_inspeccion_transferencia(db, datos)

    # ------------------------------------------------------
    # BLOQUEAR COLMENAS
    # ------------------------------------------------------

    colmena_origen, colmena_destino = (
        obtener_colmenas_para_transferencia(
            db,
            datos.colmena_origen_id,
            datos.colmena_destino_id,
        )
    )

    if colmena_origen is None:
        raise ValueError(
            "La colmena de origen no existe o está inactiva"
        )

    if colmena_destino is None:
        raise ValueError(
            "La colmena de destino no existe o está inactiva"
        )

    # ------------------------------------------------------
    # CANTIDADES ACTUALES
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
    # VALIDAR DISPONIBILIDAD
    # ------------------------------------------------------

    if marcos_origen < datos.cantidad_marcos:
        raise ValueError(
            "La colmena de origen no tiene suficientes "
            "marcos disponibles. "
            f"Tiene {marcos_origen} y se intentan "
            f"transferir {datos.cantidad_marcos}."
        )

    # ------------------------------------------------------
    # ACTUALIZAR CANTIDADES
    # ------------------------------------------------------

    ahora = datetime.now(timezone.utc)

    colmena_origen.cantidad_marcos = (
        marcos_origen - datos.cantidad_marcos
    )

    colmena_destino.cantidad_marcos = (
        marcos_destino + datos.cantidad_marcos
    )

    colmena_origen.fecha_actualizacion = ahora
    colmena_destino.fecha_actualizacion = ahora

    # ------------------------------------------------------
    # CREAR REGISTRO
    # ------------------------------------------------------

    transferencia = TransferenciaMarco(
        colmena_origen_id=datos.colmena_origen_id,
        colmena_destino_id=datos.colmena_destino_id,
        usuario_id=datos.usuario_id,
        inspeccion_id=datos.inspeccion_id,
        cantidad_marcos=datos.cantidad_marcos,
        tipo_marco=datos.tipo_marco,
        ubicacion=datos.ubicacion,
        numero_marco=datos.numero_marco,
        contenido=datos.contenido,
        motivo=datos.motivo,
        observaciones=datos.observaciones,
    )

    db.add(transferencia)

    # ------------------------------------------------------
    # PERSISTENCIA
    # ------------------------------------------------------

    if commit:
        try:
            db.flush()
            db.commit()
        except Exception:
            db.rollback()
            raise

        db.refresh(transferencia)
        db.refresh(colmena_origen)
        db.refresh(colmena_destino)

    else:
        # No confirmar: la transacción mayor se encargará
        # del commit o rollback de todas las operaciones.
        #
        # Si falla, el llamador debe hacer rollback.
        db.flush()

    return transferencia
