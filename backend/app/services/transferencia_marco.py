"""Transferencias de marcos, incluida capacidad por piso (S3-T06).

- Transferencias detalladas: validan y persisten posicion de origen/destino.
- Cria desplazada: intercambio de vuelta a la posicion de origen.
- Cera/miel desplazada: ingreso a bodega en la MISMA transaccion.
- Transferencias antiguas sin detalle se admiten solamente cuando no hay
  riesgo de rebasar diez marcos en un piso ni de invalidar posiciones conocidas.

NO modificar una base sin aplicar previamente la migracion e9a3c2d5f704.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.colmena_marco_estado import ColmenaMarcoEstado
from app.models.inspeccion import Inspeccion
from app.models.transferencia_marco import TransferenciaMarco
from app.models.usuario import Usuario
from app.schemas.inventario import InventarioMovimientoCreate
from app.schemas.transferencia_marco import TransferenciaMarcoCreate
from app.services import colmena_marcos as colmena_marcos_service
from app.services import inventario_operaciones as inventario_service
from app.services.capacidad_marcos import (
    EstadoColmena,
    planificar_transferencia,
)


def listar_transferencias(db: Session):
    return db.scalars(
        select(TransferenciaMarco).order_by(
            TransferenciaMarco.fecha_transferencia.desc(),
            TransferenciaMarco.id.desc(),
        )
    ).all()


def obtener_transferencia(db: Session, transferencia_id: int):
    return db.scalar(
        select(TransferenciaMarco).where(
            TransferenciaMarco.id == transferencia_id
        )
    )


def obtener_transferencia_de_inspeccion(
    db: Session,
    inspeccion_id: int,
    ubicacion: str | None,
    numero_marco: int | None,
) -> TransferenciaMarco | None:
    if ubicacion is None or numero_marco is None:
        return None
    return db.scalar(
        select(TransferenciaMarco).where(
            TransferenciaMarco.inspeccion_id == inspeccion_id,
            TransferenciaMarco.ubicacion == ubicacion,
            TransferenciaMarco.numero_marco == numero_marco,
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


def obtener_colmenas_para_transferencia(
    db: Session,
    colmena_origen_id: int,
    colmena_destino_id: int,
):
    """Bloquea ambas colmenas en orden fijo para evitar carreras."""
    colmenas = db.scalars(
        select(Colmena)
        .where(
            Colmena.id.in_([colmena_origen_id, colmena_destino_id]),
            Colmena.activo.is_(True),
        )
        .order_by(Colmena.id.asc())
        .with_for_update()
    ).all()
    mapa = {colmena.id: colmena for colmena in colmenas}
    return mapa.get(colmena_origen_id), mapa.get(colmena_destino_id)


def validar_inspeccion_transferencia(db: Session, datos: TransferenciaMarcoCreate):
    if datos.inspeccion_id is None:
        return
    inspeccion = db.scalar(
        select(Inspeccion).where(
            Inspeccion.id == datos.inspeccion_id,
            Inspeccion.activo.is_(True),
        )
    )
    if inspeccion is None:
        raise ValueError("La inspeccion indicada no existe o esta inactiva")
    if inspeccion.colmena_id != datos.colmena_origen_id:
        raise ValueError(
            "La colmena de origen no coincide con la colmena inspeccionada"
        )
    if inspeccion.usuario_id != datos.usuario_id:
        raise ValueError(
            "El usuario responsable no coincide con el autor de la inspeccion"
        )
    if (
        datos.ubicacion is None
        or datos.numero_marco is None
        or datos.contenido is None
    ):
        raise ValueError(
            "Una transferencia de inspeccion debe identificar ubicacion, "
            "numero y contenido del marco"
        )


def _estado_verificado(db: Session, colmena: Colmena) -> EstadoColmena:
    respuesta = colmena_marcos_service.obtener_marcos_colmena(db, colmena.id)
    if respuesta is None or respuesta["camara_cria"] is None:
        raise ValueError(
            f"Colmena {colmena.id}: falta un estado de marcos confiable; "
            "registra una inspeccion con las diez posiciones de cada piso "
            "antes de transferir"
        )
    return EstadoColmena(
        camara_cria=respuesta["camara_cria"],
        alza=respuesta["alza"],
    )


def _transferencia_legacy_segura(
    db: Session,
    colmena_origen: Colmena,
    colmena_destino: Colmena,
    datos: TransferenciaMarcoCreate,
    marcos_destino: int,
):
    """Protege consistencia sin inventar ubicaciones para rutas antiguas."""
    if datos.marco_desplazado_numero is not None:
        raise ValueError("El marco desplazado necesita ubicacion_destino")

    # Cuando hay posiciones persistidas en cualquier colmena, un movimiento
    # sin ubicacion haria el estado inconsistente. No se acepta.
    ids = (colmena_origen.id, colmena_destino.id)
    estado_conocido = db.scalar(
        select(ColmenaMarcoEstado.colmena_id)
        .where(ColmenaMarcoEstado.colmena_id.in_(ids))
        .limit(1)
    )
    if estado_conocido is not None:
        raise ValueError(
            "Una colmena ya tiene posiciones registradas: especifica "
            "ubicacion, numero_marco, contenido y ubicacion_destino"
        )

    # Con menos de 10 marcos totales, agregar solo hasta 10 no puede
    # rebasar la capacidad de ninguno de los pisos. El destino exacto
    # sigue siendo desconocido y se requiere inspeccion para establecerlo.
    if marcos_destino + datos.cantidad_marcos > 10:
        raise ValueError(
            "No se puede validar el limite de diez marcos por piso "
            "sin posiciones. Registra una inspeccion y envia ubicacion_destino"
        )


def _crear_transferencia(
    db: Session,
    datos: TransferenciaMarcoCreate,
    *,
    commit: bool = True,
):
    if datos.colmena_origen_id == datos.colmena_destino_id:
        raise ValueError("Origen y destino deben ser diferentes")
    if datos.cantidad_marcos <= 0:
        raise ValueError("La cantidad de marcos debe ser mayor que cero")

    validar_inspeccion_transferencia(db, datos)
    origen, destino = obtener_colmenas_para_transferencia(
        db, datos.colmena_origen_id, datos.colmena_destino_id
    )
    if origen is None:
        raise ValueError("La colmena de origen no existe o esta inactiva")
    if destino is None:
        raise ValueError("La colmena de destino no existe o esta inactiva")

    antes_origen = origen.cantidad_marcos or 0
    antes_destino = destino.cantidad_marcos or 0
    if antes_origen < datos.cantidad_marcos:
        raise ValueError(
            "La colmena de origen no tiene suficientes marcos disponibles. "
            f"Tiene {antes_origen} y se intentan transferir {datos.cantidad_marcos}."
        )

    numero_destino = None
    accion = None
    contenido_desplazado = None
    material_bodega = None
    ahora = datetime.now(timezone.utc)

    if datos.ubicacion_destino is not None:
        if (
            datos.cantidad_marcos != 1
            or datos.ubicacion is None
            or datos.numero_marco is None
            or datos.contenido is None
        ):
            raise ValueError(
                "Para validar capacidad debes transferir un solo marco "
                "con ubicacion, numero_marco y contenido"
            )

        estado_origen = _estado_verificado(db, origen)
        estado_destino = _estado_verificado(db, destino)
        plan = planificar_transferencia(
            estado_origen=estado_origen,
            estado_destino=estado_destino,
            ubicacion_origen=datos.ubicacion,
            numero_origen=datos.numero_marco,
            ubicacion_destino=datos.ubicacion_destino,
            marco_desplazado_numero=datos.marco_desplazado_numero,
            contenido_marco=datos.contenido,
        )
        numero_destino = plan.numero_colocado
        accion = plan.accion_desplazado
        contenido_desplazado = plan.contenido_desplazado
        material_bodega = plan.material_bodega

        nuevo_origen = colmena_marcos_service.contar_marcos(plan.origen)
        nuevo_destino = colmena_marcos_service.contar_marcos(plan.destino)
        if not (0 <= nuevo_origen <= 20 and 0 <= nuevo_destino <= 20):
            raise ValueError("Cantidad total de marcos fuera de rango")

        # La transferencia y el ingreso a bodega quedan en la MISMA
        # transaccion; ningun servicio debe confirmar antes que el router.
        origen.cantidad_marcos = nuevo_origen
        destino.cantidad_marcos = nuevo_destino
        colmena_marcos_service.guardar_estado_actual(db, origen.id, plan.origen)
        colmena_marcos_service.guardar_estado_actual(db, destino.id, plan.destino)

        if accion == "BODEGA":
            inventario_service.registrar_movimiento_bodega(
                db=db,
                datos=InventarioMovimientoCreate(
                    material=material_bodega,
                    tipo_movimiento="INGRESO",
                    cantidad=1,
                    estado="BUENO",
                    origen_ubicacion=None,
                    colmena_origen_id=None,
                    destino_ubicacion="BODEGA",
                    colmena_destino_id=None,
                    observaciones=(
                        f"S3-T06: marco {datos.marco_desplazado_numero} "
                        f"desplazado desde colmena {destino.id}, "
                        f"piso {datos.ubicacion_destino}, "
                        f"transferencia de colmena {origen.id}"
                    ),
                ),
                usuario_id=datos.usuario_id,
                commit=False,
            )

    else:
        # Contratos historicos sin detalle solo se aceptan cuando no
        # pueden vulnerar capacidad ni invalidar un estado persistido.
        _transferencia_legacy_segura(db, origen, destino, datos, antes_destino)
        origen.cantidad_marcos = antes_origen - datos.cantidad_marcos
        destino.cantidad_marcos = antes_destino + datos.cantidad_marcos

    origen.fecha_actualizacion = ahora
    destino.fecha_actualizacion = ahora

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
        ubicacion_destino=datos.ubicacion_destino,
        numero_destino=numero_destino,
        marco_desplazado_numero=datos.marco_desplazado_numero,
        contenido_desplazado=contenido_desplazado,
        accion_desplazado=accion,
        motivo=datos.motivo,
        observaciones=datos.observaciones,
    )
    db.add(transferencia)

    if commit:
        try:
            db.flush()
            db.commit()
        except Exception:
            db.rollback()
            raise
        db.refresh(transferencia)
        db.refresh(origen)
        db.refresh(destino)
    else:
        db.flush()
    return transferencia



def crear_transferencia(
    db: Session,
    datos: TransferenciaMarcoCreate,
    *,
    commit: bool = True,
):
    """Servicio publico con rollback ante fallos de transaccion propia.

    Con commit=False, el llamador maneja el rollback junto con su
    inspeccion/auditoria; evita confirmar o abortar operaciones ajenas.
    """
    try:
        return _crear_transferencia(db, datos, commit=commit)
    except Exception:
        if commit:
            db.rollback()
        raise
