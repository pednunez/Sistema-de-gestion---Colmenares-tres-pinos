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
        # ESTADO SANITARIO
        # --------------------------------------------------

        signos_enfermedad=datos.signos_enfermedad,

        enfermedad_observada=datos.enfermedad_observada,

        # --------------------------------------------------
        # OBSERVACIONES
        # --------------------------------------------------

        observaciones=datos.observaciones
    )

    db.add(
        inspeccion
    )

    db.commit()

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
    # Esto también permite actualizar cantidad_marcos
    # automáticamente porque ya existe en InspeccionUpdate.
    # ------------------------------------------------------

    for campo, valor in datos_actualizados.items():

        setattr(
            inspeccion,
            campo,
            valor
        )

    # ------------------------------------------------------
    # ACTUALIZAR FECHA DE MODIFICACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_actualizacion = (
        datetime.now(
            timezone.utc
        )
    )

    db.commit()

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
    # BAJA LÓGICA
    # ------------------------------------------------------

    inspeccion.activo = False

    # ------------------------------------------------------
    # FECHA DE ELIMINACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_eliminacion = (
        datetime.now(
            timezone.utc
        )
    )

    # ------------------------------------------------------
    # FECHA DE ÚLTIMA ACTUALIZACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_actualizacion = (
        datetime.now(
            timezone.utc
        )
    )

    db.commit()

    db.refresh(
        inspeccion
    )

    return inspeccion