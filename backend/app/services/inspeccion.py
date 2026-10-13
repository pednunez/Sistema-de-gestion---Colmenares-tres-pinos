
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.inspeccion import Inspeccion
from app.models.inspeccion_marco import InspeccionMarco
from app.models.usuario import Usuario

from app.schemas.inspeccion import (
    InspeccionCreate,
    InspeccionUpdate,
    validar_posiciones_marcos,
)


# ==========================================================
# FUNCIONES DE CONSULTA
# ==========================================================

def listar_inspecciones(db: Session):
    consulta = (
        select(Inspeccion)
        .where(Inspeccion.activo.is_(True))
        .order_by(
            Inspeccion.fecha_inspeccion.desc(),
            Inspeccion.id.desc(),
        )
    )
    return db.scalars(consulta).all()


def obtener_inspeccion(
    db: Session,
    inspeccion_id: int,
):
    consulta = (
        select(Inspeccion)
        .where(
            Inspeccion.id == inspeccion_id,
            Inspeccion.activo.is_(True),
        )
    )
    return db.scalar(consulta)


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
# UTILIDADES
# ==========================================================

def ahora_utc():
    return datetime.now(timezone.utc)


def guardar_cambios(
    db: Session,
    *,
    commit: bool,
):
    """
    commit=True:
        Confirma los cambios, para compatibilidad
        con los llamadores actuales.

    commit=False:
        Ejecuta flush pero deja la transacción
        abierta para que el router registre también
        la auditoría antes del commit definitivo.

    Si commit=False y falla una operación, el
    llamador debe ejecutar db.rollback().
    """
    if not commit:
        db.flush()
        return

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def comprobar_transferencias_pendientes(marcos):
    """
    Protección temporal.

    Hasta integrar las transferencias automáticas
    con el router y el frontend, no permitimos que
    se guarde una inspección con movimientos
    pendientes que todavía no serían procesados
    de forma atómica.
    """
    pendientes = [
        marco
        for marco in marcos
        if marco.transferido_a_colmena_id is not None
    ]

    if pendientes:
        raise ValueError(
            "Esta inspección incluye marcos para transferir. "
            "El guardado automático de transferencias todavía "
            "no está habilitado en el backend."
        )


def crear_objetos_marcos(marcos):
    """
    Convierte los esquemas Pydantic en objetos
    SQLAlchemy para la tabla inspeccion_marcos.
    """
    return [
        InspeccionMarco(
            ubicacion=marco.ubicacion,
            numero=marco.numero,
            contenido=marco.contenido,
            transferido_a_colmena_id=(
                marco.transferido_a_colmena_id
            ),
        )
        for marco in marcos
    ]


def validar_detalle_marcos(
    marcos,
    tiene_alza,
    cantidad_marcos,
):
    """
    Verifica la coherencia entre:
    - las posiciones registradas;
    - la presencia de alza;
    - la cantidad de marcos observados.
    """
    if not marcos:
        return

    if tiene_alza is None:
        raise ValueError(
            "Debes indicar si la colmena tiene alza "
            "cuando registras el detalle de marcos."
        )

    validar_posiciones_marcos(
        marcos,
        tiene_alza,
        cantidad_marcos,
    )


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================

def crear_inspeccion(
    db: Session,
    datos: InspeccionCreate,
    *,
    commit: bool = True,
):
    # ------------------------------------------------------
    # VALIDAR MARCOS ANTES DE ESCRIBIR EN POSTGRESQL
    # ------------------------------------------------------

    validar_detalle_marcos(
        datos.marcos,
        datos.tiene_alza,
        datos.cantidad_marcos,
    )

    comprobar_transferencias_pendientes(datos.marcos)

    # ------------------------------------------------------
    # OBTENER Y BLOQUEAR LA COLMENA
    # ------------------------------------------------------

    colmena = db.scalar(
        select(Colmena)
        .where(
            Colmena.id == datos.colmena_id,
            Colmena.activo.is_(True),
        )
        .with_for_update()
    )

    if colmena is None:
        raise ValueError(
            "La colmena indicada no existe o está inactiva"
        )

    # ------------------------------------------------------
    # CREAR INSPECCIÓN
    # ------------------------------------------------------

    inspeccion = Inspeccion(
        colmena_id=datos.colmena_id,
        usuario_id=datos.usuario_id,

        estado_general=datos.estado_general,
        reina_observada=datos.reina_observada,
        presencia_cria=datos.presencia_cria,
        nivel_poblacion=datos.nivel_poblacion,
        reservas_alimento=datos.reservas_alimento,

        cantidad_marcos=datos.cantidad_marcos,
        tiene_alza=datos.tiene_alza,

        miel=datos.miel,
        alimentacion_suministrada=(
            datos.alimentacion_suministrada
        ),
        postura=datos.postura,

        signos_enfermedad=datos.signos_enfermedad,
        enfermedad_observada=datos.enfermedad_observada,
        tiras_medicamento=datos.tiras_medicamento,

        observaciones=datos.observaciones,
    )

    # ------------------------------------------------------
    # ASOCIAR MARCOS A LA INSPECCIÓN
    # ------------------------------------------------------

    inspeccion.marcos = crear_objetos_marcos(
        datos.marcos
    )

    # ------------------------------------------------------
    # ACTUALIZAR CANTIDAD OBSERVADA EN LA COLMENA
    # ------------------------------------------------------
    #
    # En esta fase no se procesan transferencias
    # automáticas.
    #
    # Si no hay cantidad registrada, conservamos
    # el valor anterior de la colmena.
    # ------------------------------------------------------

    if datos.cantidad_marcos is not None:
        colmena.cantidad_marcos = datos.cantidad_marcos
        colmena.fecha_actualizacion = ahora_utc()

    # ------------------------------------------------------
    # AGREGAR INSPECCIÓN Y MARCOS
    # ------------------------------------------------------

    db.add(inspeccion)

    # ------------------------------------------------------
    # GUARDAR O PREPARAR TRANSACCIÓN
    # ------------------------------------------------------

    guardar_cambios(db, commit=commit)

    if commit:
        db.refresh(inspeccion)

    return inspeccion


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================

def actualizar_inspeccion(
    db: Session,
    inspeccion: Inspeccion,
    datos: InspeccionUpdate,
    *,
    commit: bool = True,
):
    cambios = datos.model_dump(exclude_unset=True)

    # ------------------------------------------------------
    # NO PERMITIR CAMBIAR LA COLMENA NI EL AUTOR
    # ------------------------------------------------------

    cambios.pop("colmena_id", None)
    cambios.pop("usuario_id", None)

    # ------------------------------------------------------
    # PROCESAR DETALLE DE MARCOS POR SEPARADO
    # ------------------------------------------------------

    marcos_enviados = "marcos" in cambios
    cambios.pop("marcos", None)

    nuevos_marcos = None

    if marcos_enviados:
        if datos.marcos is None:
            raise ValueError(
                "Para modificar los marcos envía una lista; "
                "utiliza [] para dejarla vacía."
            )

        nuevos_marcos = datos.marcos

        comprobar_transferencias_pendientes(
            nuevos_marcos
        )

        # No permitir reemplazar marcos históricos que
        # tengan transferencias asociadas: hacerlo sin
        # reconciliar los movimientos rompería la
        # trazabilidad del sistema.
        if any(
            marco.transferido_a_colmena_id is not None
            for marco in inspeccion.marcos
        ):
            raise ValueError(
                "No se puede reemplazar el detalle de "
                "una inspección que tiene transferencias "
                "registradas."
            )

        tiene_alza_final = cambios.get(
            "tiene_alza",
            inspeccion.tiene_alza,
        )

        if nuevos_marcos:
            cantidad_calculada = sum(
                marco.contenido != "SIN_MARCO"
                for marco in nuevos_marcos
            )

            cantidad_final = cambios.get(
                "cantidad_marcos",
                cantidad_calculada,
            )

            validar_detalle_marcos(
                nuevos_marcos,
                tiene_alza_final,
                cantidad_final,
            )

            # Evitar que queden datos contradictorios.
            cambios["cantidad_marcos"] = cantidad_final

    # ------------------------------------------------------
    # ACTUALIZAR CAMPOS SIMPLES
    # ------------------------------------------------------

    for campo, valor in cambios.items():
        setattr(inspeccion, campo, valor)

    # ------------------------------------------------------
    # ACTUALIZAR DETALLE SI FUE ENVIADO
    # ------------------------------------------------------

    if nuevos_marcos is not None:
        # Para respetar las restricciones UNIQUE de
        # (inspeccion_id, ubicacion, numero), borramos
        # primero las filas anteriores y después
        # insertamos el nuevo detalle.
        for marco in list(inspeccion.marcos):
            db.delete(marco)

        db.flush()

        inspeccion.marcos = crear_objetos_marcos(
            nuevos_marcos
        )

    # ------------------------------------------------------
    # FECHA DE ACTUALIZACIÓN
    # ------------------------------------------------------

    inspeccion.fecha_actualizacion = ahora_utc()

    # IMPORTANTE:
    # No modificamos aquí colmena.cantidad_marcos.
    # Esta inspección podría ser histórica.

    guardar_cambios(db, commit=commit)

    if commit:
        db.refresh(inspeccion)

    return inspeccion


# ==========================================================
# ANULAR INSPECCIÓN (BAJA LÓGICA)
# ==========================================================

def eliminar_inspeccion(
    db: Session,
    inspeccion: Inspeccion,
    *,
    commit: bool = True,
):
    ahora = ahora_utc()

    inspeccion.activo = False
    inspeccion.fecha_eliminacion = ahora
    inspeccion.fecha_actualizacion = ahora

    # Los marcos y las transferencias históricas
    # permanecen en la base de datos.

    guardar_cambios(db, commit=commit)

    if commit:
        db.refresh(inspeccion)

    return inspeccion
