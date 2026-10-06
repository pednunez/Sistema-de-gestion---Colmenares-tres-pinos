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


# ==========================================================
# LISTAR INSPECCIONES ACTIVAS
# ==========================================================

def listar_inspecciones(
    db: Session
):
    consulta = (
        select(Inspeccion)
        .where(
            Inspeccion.activo == True
        )
        .order_by(
            Inspeccion.fecha_inspeccion.desc()
        )
    )

    return db.scalars(
        consulta
    ).all()


# ==========================================================
# OBTENER INSPECCIÓN POR ID
# ==========================================================

def obtener_inspeccion(
    db: Session,
    inspeccion_id: int
):
    consulta = select(
        Inspeccion
    ).where(
        Inspeccion.id == inspeccion_id,
        Inspeccion.activo == True
    )

    return db.scalar(
        consulta
    )


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

    return db.scalar(
        consulta
    )


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

    return db.scalar(
        consulta
    )


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================

def crear_inspeccion(
    db: Session,
    datos: InspeccionCreate
):

    # ------------------------------------------------------
    # VALIDAR QUE LA COLMENA EXISTA Y ESTÉ ACTIVA
    # ------------------------------------------------------

    colmena = obtener_colmena_activa(
        db,
        datos.colmena_id
    )

    if colmena is None:
        raise ValueError(
            "La colmena indicada no existe o está inactiva"
        )

    # ------------------------------------------------------
    # CREAR INSPECCIÓN
    # ------------------------------------------------------

    inspeccion = Inspeccion(

        # --------------------------------------------------
        # RELACIONES
        # --------------------------------------------------

        colmena_id=datos.colmena_id,

        usuario_id=datos.usuario_id,

        # --------------------------------------------------
        # INFORMACIÓN GENERAL
        # --------------------------------------------------

        estado_general=datos.estado_general,

        reina_observada=datos.reina_observada,

        presencia_cria=datos.presencia_cria,

        nivel_poblacion=datos.nivel_poblacion,

        reservas_alimento=datos.reservas_alimento,

        # --------------------------------------------------
        # CANTIDAD DE MARCOS
        # --------------------------------------------------
        #
        # Guarda la cantidad observada durante esta
        # inspección para mantener trazabilidad histórica.
        # --------------------------------------------------

        cantidad_marcos=datos.cantidad_marcos,

        # --------------------------------------------------
        # RF-27 - MIEL
        # --------------------------------------------------

        miel=datos.miel,

        # --------------------------------------------------
        # RF-28 - ALIMENTACIÓN SUMINISTRADA
        # --------------------------------------------------

        alimentacion_suministrada=(
            datos.alimentacion_suministrada
        ),

        # --------------------------------------------------
        # RF-31 - POSTURA
        # --------------------------------------------------

        postura=datos.postura,

        # --------------------------------------------------
        # ESTADO SANITARIO
        # --------------------------------------------------

        signos_enfermedad=datos.signos_enfermedad,

        enfermedad_observada=(
            datos.enfermedad_observada
        ),

        # --------------------------------------------------
        # OBSERVACIONES
        # --------------------------------------------------

        observaciones=datos.observaciones
    )

    # ------------------------------------------------------
    # ACTUALIZAR CANTIDAD ACTUAL DE MARCOS DE LA COLMENA
    # ------------------------------------------------------
    #
    # Si el apicultor registró la cantidad de marcos durante
    # una NUEVA inspección, ese número representa el estado
    # actual observado de la colmena.
    #
    # Ejemplo:
    #
    # Antes:
    # Colmena C-001 -> 10 marcos
    #
    # Nueva inspección:
    # cantidad_marcos = 8
    #
    # Después:
    # Colmena C-001 -> 8 marcos actuales
    #
    # La inspección conserva igualmente el valor 8 como
    # registro histórico.
    # ------------------------------------------------------

    if datos.cantidad_marcos is not None:

        colmena.cantidad_marcos = (
            datos.cantidad_marcos
        )

        colmena.fecha_actualizacion = (
            datetime.now(
                timezone.utc
            )
        )

    # ------------------------------------------------------
    # AGREGAR INSPECCIÓN
    # ------------------------------------------------------

    db.add(
        inspeccion
    )

    # ------------------------------------------------------
    # GUARDAR TODO EN LA MISMA TRANSACCIÓN
    # ------------------------------------------------------
    #
    # Se guarda:
    #
    # 1. La nueva inspección.
    # 2. La cantidad actual de marcos de la colmena.
    #
    # Si ocurre un error, rollback revierte ambos cambios.
    # ------------------------------------------------------

    try:

        db.commit()

    except Exception:

        db.rollback()

        raise

    db.refresh(
        inspeccion
    )

    return inspeccion


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================

def actualizar_inspeccion(
    db: Session,
    inspeccion: Inspeccion,
    datos: InspeccionUpdate
):

    # ------------------------------------------------------
    # SOLO TOMAR LOS CAMPOS ENVIADOS
    # ------------------------------------------------------

    datos_actualizados = datos.model_dump(
        exclude_unset=True
    )

    # ------------------------------------------------------
    # ACTUALIZAR CAMPOS DINÁMICAMENTE
    # ------------------------------------------------------
    #
    # Como los campos:
    #
    # cantidad_marcos
    # miel
    # alimentacion_suministrada
    # postura
    #
    # ya existen en InspeccionUpdate, también serán
    # actualizados automáticamente cuando sean enviados.
    # ------------------------------------------------------

    for campo, valor in datos_actualizados.items():

        setattr(
            inspeccion,
            campo,
            valor
        )

    # ------------------------------------------------------
    # IMPORTANTE:
    #
    # NO actualizamos aquí colmena.cantidad_marcos.
    #
    # Una inspección que se modifica puede ser una
    # inspección histórica y no necesariamente representa
    # el estado actual de la colmena.
    # ------------------------------------------------------

    # ------------------------------------------------------
    # ACTUALIZAR FECHA DE MODIFICACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_actualizacion = (
        datetime.now(
            timezone.utc
        )
    )

    # ------------------------------------------------------
    # GUARDAR CAMBIOS
    # ------------------------------------------------------

    try:

        db.commit()

    except Exception:

        db.rollback()

        raise

    db.refresh(
        inspeccion
    )

    return inspeccion


# ==========================================================
# ELIMINAR / ANULAR INSPECCIÓN
# ==========================================================
#
# Se utiliza baja lógica.
#
# El registro NO se elimina físicamente de PostgreSQL.
# ==========================================================

def eliminar_inspeccion(
    db: Session,
    inspeccion: Inspeccion
):

    # ------------------------------------------------------
    # FECHA ACTUAL
    # ------------------------------------------------------

    ahora = datetime.now(
        timezone.utc
    )

    # ------------------------------------------------------
    # BAJA LÓGICA
    # ------------------------------------------------------

    inspeccion.activo = False

    # ------------------------------------------------------
    # FECHA DE ELIMINACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_eliminacion = ahora

    # ------------------------------------------------------
    # FECHA DE ÚLTIMA ACTUALIZACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_actualizacion = ahora

    # ------------------------------------------------------
    # GUARDAR CAMBIOS
    # ------------------------------------------------------

    try:

        db.commit()

    except Exception:

        db.rollback()

        raise

    db.refresh(
        inspeccion
    )

    return inspeccion