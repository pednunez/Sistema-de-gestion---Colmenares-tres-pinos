
from datetime import datetime, timezone

from sqlalchemy import select, inspect as sa_inspect
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
from app.schemas.transferencia_marco import TransferenciaMarcoCreate
from app.schemas.auditoria import AuditoriaCreate

from app.services import transferencia_marco as transferencia_service
from app.services import auditoria as auditoria_service


TIPO_POR_CONTENIDO = {
    "MIEL_Y_CRIA": "CRIA",
    "SOLO_CRIA": "CRIA",
    "SOLO_MIEL": "MIEL",
    "CERA_ESTIRADA": "VACIO",
    "CERA_ESTAMPADA": "VACIO",
    "CERA_UNTADA": "VACIO",
}


# ==========================================================
# CONSULTAS
# ==========================================================

def listar_inspecciones(db: Session):
    return db.scalars(
        select(Inspeccion)
        .where(Inspeccion.activo.is_(True))
        .order_by(
            Inspeccion.fecha_inspeccion.desc(),
            Inspeccion.id.desc(),
        )
    ).all()


def obtener_inspeccion(db: Session, inspeccion_id: int):
    return db.scalar(
        select(Inspeccion).where(
            Inspeccion.id == inspeccion_id,
            Inspeccion.activo.is_(True),
        )
    )


def obtener_colmena_activa(db: Session, colmena_id: int):
    return db.scalar(
        select(Colmena).where(
            Colmena.id == colmena_id,
            Colmena.activo.is_(True),
        )
    )


def obtener_usuario_activo(db: Session, usuario_id: int):
    return db.scalar(
        select(Usuario).where(
            Usuario.id == usuario_id,
            Usuario.activo.is_(True),
        )
    )


# ==========================================================
# UTILIDADES
# ==========================================================

def ahora_utc():
    return datetime.now(timezone.utc)


def guardar_cambios(db: Session, *, commit: bool):
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
    Se conserva esta protección para PATCH.
    No permitimos crear nuevos movimientos mediante
    la edición de inspecciones históricas.
    """
    if any(
        marco.transferido_a_colmena_id is not None
        for marco in marcos
    ):
        raise ValueError(
            "No se pueden agregar transferencias "
            "editando una inspección histórica."
        )


def crear_objetos_marcos(marcos):
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
    if not marcos:
        return

    if tiene_alza is None:
        raise ValueError(
            "Debes indicar si la colmena tiene alza."
        )

    validar_posiciones_marcos(
        marcos,
        tiene_alza,
        cantidad_marcos,
    )


def transferencia_a_dict(transferencia):
    """
    Prepara los campos de una transferencia
    para guardar una fotografía en auditoría.
    """
    resultado = {}

    for columna in sa_inspect(
        transferencia
    ).mapper.column_attrs:
        valor = getattr(transferencia, columna.key)

        if isinstance(valor, datetime):
            valor = valor.isoformat()

        resultado[columna.key] = valor

    return resultado


# ==========================================================
# CREAR INSPECCIÓN Y TRANSFERENCIAS
# ==========================================================

def crear_inspeccion(
    db: Session,
    datos: InspeccionCreate,
    *,
    commit: bool = True,
):
    # 1. Validar detalle.
    validar_detalle_marcos(
        datos.marcos,
        datos.tiene_alza,
        datos.cantidad_marcos,
    )

    transferibles = [
        marco
        for marco in datos.marcos
        if marco.transferido_a_colmena_id is not None
    ]

    # 2. Para transferir necesitamos una cantidad
    #    observada y consistente con el detalle.
    if transferibles:
        if datos.cantidad_marcos is None:
            raise ValueError(
                "Debes registrar cantidad_marcos "
                "para transferir marcos."
            )

        cantidad_real = sum(
            marco.contenido != "SIN_MARCO"
            for marco in datos.marcos
        )

        if cantidad_real != datos.cantidad_marcos:
            raise ValueError(
                "La cantidad de marcos no coincide "
                "con el detalle registrado."
            )

        if len(transferibles) > cantidad_real:
            raise ValueError(
                "No hay suficientes marcos para transferir."
            )

    # 3. Validar que origen y destino sean diferentes.
    destinos = {
        marco.transferido_a_colmena_id
        for marco in transferibles
    }

    if datos.colmena_id in destinos:
        raise ValueError(
            "No se puede transferir a la misma colmena."
        )

    # 4. Bloquear todas las colmenas involucradas
    #    en orden estable para reducir interbloqueos.
    ids_colmenas = sorted({
        datos.colmena_id,
        *destinos,
    })

    colmenas = db.scalars(
        select(Colmena)
        .where(
            Colmena.id.in_(ids_colmenas),
            Colmena.activo.is_(True),
        )
        .order_by(Colmena.id.asc())
        .with_for_update()
    ).all()

    mapa = {
        colmena.id: colmena
        for colmena in colmenas
    }

    origen = mapa.get(datos.colmena_id)

    if origen is None:
        raise ValueError(
            "La colmena inspeccionada no existe "
            "o está inactiva."
        )

    for destino_id in destinos:
        if destino_id not in mapa:
            raise ValueError(
                f"La colmena destino {destino_id} "
                "no existe o está inactiva."
            )

    # 5. Construir la inspección.
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

    # 6. Registrar todas las posiciones observadas.
    inspeccion.marcos = crear_objetos_marcos(
        datos.marcos
    )

    db.add(inspeccion)

    # Obtener el ID de inspección sin hacer COMMIT.
    db.flush()

    # 7. Actualizar inventario observado.
    #    La inspección conserva la cantidad histórica;
    #    el origen será descontado posteriormente.
    if datos.cantidad_marcos is not None:
        origen.cantidad_marcos = datos.cantidad_marcos
        origen.fecha_actualizacion = ahora_utc()

    # 8. Registrar cada transferencia.
    for marco in transferibles:
        transferencia_datos = TransferenciaMarcoCreate(
            colmena_origen_id=datos.colmena_id,
            colmena_destino_id=(
                marco.transferido_a_colmena_id
            ),
            usuario_id=datos.usuario_id,
            inspeccion_id=inspeccion.id,
            cantidad_marcos=1,
            tipo_marco=TIPO_POR_CONTENIDO[
                marco.contenido
            ],
            ubicacion=marco.ubicacion,
            numero_marco=marco.numero,
            contenido=marco.contenido,
            motivo=(
                "Transferencia registrada "
                "durante la inspección"
            ),
            observaciones=(
                f"Marco {marco.numero} "
                f"en {marco.ubicacion}"
            ),
        )

        transferencia = (
            transferencia_service.crear_transferencia(
                db,
                transferencia_datos,
                commit=False,
            )
        )

        # 9. Registrar auditoría sin COMMIT.
        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=datos.usuario_id,
                entidad="TRANSFERENCIA_MARCO",
                entidad_id=transferencia.id,
                accion="CREAR",
                datos_anteriores=None,
                datos_nuevos=transferencia_a_dict(
                    transferencia
                ),
            ),
            commit=False,
        )

    # 10. El router hará el COMMIT definitivo
    #     cuando utilice commit=False.
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

    # No permitir cambiar relaciones históricas.
    cambios.pop("colmena_id", None)
    cambios.pop("usuario_id", None)

    marcos_enviados = "marcos" in cambios
    cambios.pop("marcos", None)

    nuevos_marcos = None

    if marcos_enviados:
        if datos.marcos is None:
            raise ValueError(
                "Para modificar marcos envía una lista. "
                "Utiliza [] para eliminar el detalle."
            )

        nuevos_marcos = datos.marcos

        # Prohibir nuevos movimientos desde PATCH.
        comprobar_transferencias_pendientes(
            nuevos_marcos
        )

        # Proteger movimientos históricos existentes.
        if any(
            marco.transferido_a_colmena_id is not None
            for marco in inspeccion.marcos
        ):
            raise ValueError(
                "No puedes reemplazar marcos de una "
                "inspección que tiene transferencias."
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

            cambios["cantidad_marcos"] = cantidad_final

    # Actualizar únicamente los campos enviados.
    for campo, valor in cambios.items():
        setattr(inspeccion, campo, valor)

    # Sustituir detalle cuando se haya solicitado.
    if nuevos_marcos is not None:
        anteriores = list(inspeccion.marcos)

        for marco in anteriores:
            db.delete(marco)

        db.flush()

        inspeccion.marcos = crear_objetos_marcos(
            nuevos_marcos
        )

    inspeccion.fecha_actualizacion = ahora_utc()

    # No cambiar la cantidad actual de la colmena
    # al editar una inspección histórica.
    guardar_cambios(db, commit=commit)

    if commit:
        db.refresh(inspeccion)

    return inspeccion


# ==========================================================
# ANULAR INSPECCIÓN
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

    # La baja lógica conserva marcos y transferencias.
    # No revierte automáticamente inventarios antiguos.
    guardar_cambios(db, commit=commit)

    if commit:
        db.refresh(inspeccion)

    return inspeccion
