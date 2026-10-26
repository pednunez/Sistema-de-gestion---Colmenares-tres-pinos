
from datetime import date, datetime, timezone

from fastapi import HTTPException, status

from sqlalchemy import (
    Date,
    and_,
    cast,
    func,
    or_,
    select,
    text,
)

from sqlalchemy.orm import Session

from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.inventario_stock import InventarioStock
from app.models.inventario_movimiento import InventarioMovimiento
from app.models.inventario_incidencia import InventarioIncidencia

from app.schemas.auditoria import AuditoriaCreate
from app.schemas.inventario import InventarioMovimientoCreate

from app.schemas.stock import (
    MaterialStock,
    TipoMovimientoStock,
    StockMovimientoCreate,
    StockMovimientoResponse,
)

from app.services import auditoria as auditoria_service
from app.services import (
    inventario_operaciones as inventario_service,
)


# ==========================================================
# SISTEMA DE CONTROL DE COLMENAS
# COLMENARES TRES PINOS
# ==========================================================
#
# SERVICIO DE MOVIMIENTOS DE STOCK
# ==========================================================
#
# El stock es solo de la BODEGA central.
# Cada unidad esta en un solo estado:
#
# DISPONIBLE --DANO--> DANADO --ENVIO_REPARACION-->
# EN_REPARACION --REPARACION--> DISPONIBLE
#
# DANADO o EN_REPARACION --DESCARTE--> MERMA
#
# OPERACIONES:
#
# 1. INGRESO           + disponible
# 2. ENVIO             - disponible (salida de bodega)
# 3. DANO              disponible -> danado
# 4. ENVIO_REPARACION  danado -> en reparacion
# 5. REPARACION        en reparacion -> disponible
# 6. DESCARTE          danado o en reparacion -> merma
#
# Se mantiene la trazabilidad mediante:
#
# - InventarioStock
# - InventarioMovimiento
# - InventarioIncidencia
# - Auditoria
# ==========================================================


MATERIALES_STOCK = (
    "CAJON",
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
)

MATERIALES_CERA = (
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
)

ESTADOS_DISPONIBLES = (
    "BUENO",
    "REPARADO",
)

# ROTO se trata como DANADO: en pantalla hay un solo
# concepto de material danado.
ESTADOS_DANADOS = (
    "DANADO",
    "ROTO",
)

ESTADOS_COLMENA_SIN_ENVIO = (
    "INACTIVA",
    "BAJA",
)


# ==========================================================
# 1. ADAPTAR RESPUESTA PARA EL FRONTEND
# ==========================================================

def respuesta_movimiento(
    movimiento: InventarioMovimiento,
    tipo: TipoMovimientoStock,
) -> StockMovimientoResponse:

    estado_origen = None

    if tipo == "DESCARTE":
        estado_origen = (
            "EN_REPARACION"
            if movimiento.origen_estado == "EN_REPARACION"
            else "DANADO"
        )

    return StockMovimientoResponse(
        id=movimiento.id,
        material=movimiento.material,
        tipo=tipo,
        cantidad=movimiento.cantidad,
        apiario_id=movimiento.salida_apiario_id,
        colmena_id=movimiento.salida_colmena_id,
        estado_origen=estado_origen,
        observaciones=movimiento.observaciones,
        usuario_id=movimiento.usuario_id,
        fecha=movimiento.fecha_creacion,
    )


# ==========================================================
# BLOQUEAR OPERACIONES DE INVENTARIO
# ==========================================================

def bloquear_inventario(db: Session) -> None:

    db.execute(
        text(
            "SELECT pg_advisory_xact_lock("
            ":espacio, :recurso)"
        ),
        {
            "espacio": 74112,
            "recurso": 1,
        },
    )


# ==========================================================
# OBTENER O CREAR UNA FILA DE STOCK DE BODEGA
# ==========================================================

def stock_bodega(
    db: Session,
    material: str,
    estado: str,
) -> InventarioStock | None:

    return db.scalar(
        select(InventarioStock)
        .where(
            InventarioStock.material == material,
            InventarioStock.ubicacion == "BODEGA",
            InventarioStock.colmena_id.is_(None),
            InventarioStock.estado == estado,
        )
        .with_for_update()
    )


def descontar_existencias(
    existencias: list[InventarioStock],
    cantidad: int,
    ahora: datetime,
) -> dict[str, int]:
    """Descuenta en orden y devuelve cuanto salio de cada estado."""

    restante = cantidad
    fuentes = {}

    for registro in existencias:

        if restante == 0:
            break

        descontar = min(registro.cantidad, restante)

        if descontar == 0:
            continue

        registro.cantidad -= descontar
        registro.fecha_actualizacion = ahora

        fuentes[registro.estado] = (
            fuentes.get(registro.estado, 0) + descontar
        )

        restante -= descontar

    assert restante == 0

    return fuentes


# ==========================================================
# 2. REGISTRAR DANO
# ==========================================================
#
# Material disponible -> DANADO.
#
# Los marcos con cera danados se convierten a
# MARCO_VACIO en estado DANADO.
#
# Registra stock, incidencia, movimiento y auditoria.
# ==========================================================

def registrar_dano_bodega(
    db: Session,
    datos: StockMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> StockMovimientoResponse:

    try:

        # ==================================================
        # BLOQUEAR OPERACIONES DE INVENTARIO
        # ==================================================

        db.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                ":espacio, :recurso)"
            ),
            {
                "espacio": 74112,
                "recurso": 1,
            },
        )

        # ==================================================
        # BUSCAR MATERIALES DISPONIBLES
        # ==================================================

        consulta = (
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado.in_(
                    ESTADOS_DISPONIBLES
                ),
            )
            .order_by(InventarioStock.estado)
            .with_for_update()
        )

        existencias = db.scalars(consulta).all()

        total_disponible = sum(
            registro.cantidad
            for registro in existencias
        )

        # ==================================================
        # VALIDAR STOCK SUFICIENTE
        # ==================================================

        if total_disponible < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Stock insuficiente para registrar dano. "
                    f"Disponible: {total_disponible}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # DETERMINAR MATERIAL DANADO
        # ==================================================

        material_danado = (
            "MARCO_VACIO"
            if datos.material in MATERIALES_CERA
            else datos.material
        )

        restante = datos.cantidad
        fuentes_utilizadas = {}

        ahora = datetime.now(timezone.utc)

        # ==================================================
        # DESCONTAR STOCK DISPONIBLE
        # ==================================================

        for registro in existencias:

            if restante == 0:
                break

            descontar = min(
                registro.cantidad,
                restante,
            )

            if descontar == 0:
                continue

            registro.cantidad -= descontar
            registro.fecha_actualizacion = ahora

            fuentes_utilizadas[registro.estado] = (
                fuentes_utilizadas.get(
                    registro.estado,
                    0,
                )
                + descontar
            )

            restante -= descontar

        assert restante == 0

        # ==================================================
        # CONSULTAR STOCK DANADO
        # ==================================================

        consulta_danado = (
            select(InventarioStock)
            .where(
                InventarioStock.material == material_danado,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado == "DANADO",
            )
            .with_for_update()
        )

        stock_danado = db.scalar(consulta_danado)

        danado_anterior = (
            stock_danado.cantidad
            if stock_danado is not None
            else 0
        )

        # ==================================================
        # AUMENTAR STOCK DANADO
        # ==================================================

        if stock_danado is None:

            stock_danado = InventarioStock(
                material=material_danado,
                ubicacion="BODEGA",
                colmena_id=None,
                estado="DANADO",
                cantidad=datos.cantidad,
            )

            db.add(stock_danado)

        else:

            stock_danado.cantidad += datos.cantidad
            stock_danado.fecha_actualizacion = ahora

        # ==================================================
        # CREAR INCIDENCIA
        # ==================================================

        descripcion = (
            (datos.observaciones or "").strip()
            or "Dano registrado en el modulo Stock"
        )

        if material_danado != datos.material:

            descripcion = (
                f"Dano de {datos.material}. "
                "Material clasificado como "
                f"{material_danado}. "
                f"{descripcion}"
            )

        incidencia = InventarioIncidencia(
            material=material_danado,
            tipo_dano="DANADO",
            ubicacion_detectada="BODEGA",
            colmena_detectada_id=None,
            cantidad_afectada=datos.cantidad,
            cantidad_pendiente=datos.cantidad,
            cantidad_en_reparacion=0,
            cantidad_reparada=0,
            cantidad_baja=0,
            descripcion_dano=descripcion,
            observaciones=datos.observaciones,
            usuario_reporte_id=usuario_id,
        )

        db.add(incidencia)
        db.flush()

        # ==================================================
        # REGISTRAR MOVIMIENTO
        # ==================================================

        estado_origen = (
            next(iter(fuentes_utilizadas))
            if len(fuentes_utilizadas) == 1
            else None
        )

        movimiento = InventarioMovimiento(
            material=datos.material,
            tipo_movimiento="DANAR",
            cantidad=datos.cantidad,
            origen_ubicacion="BODEGA",
            colmena_origen_id=None,
            origen_estado=estado_origen,
            destino_ubicacion="BODEGA",
            colmena_destino_id=None,
            destino_estado="DANADO",
            usuario_id=usuario_id,
            observaciones=datos.observaciones,
        )

        db.add(movimiento)
        db.flush()

        # ==================================================
        # REGISTRAR AUDITORIA
        # ==================================================

        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_id,
                entidad="INVENTARIO_MOVIMIENTO",
                entidad_id=movimiento.id,
                accion="CREAR",
                datos_anteriores={
                    "material": datos.material,
                    "disponible": total_disponible,
                    "danado_destino": danado_anterior,
                },
                datos_nuevos={
                    "tipo": "DANO",
                    "material_origen": datos.material,
                    "material_danado": material_danado,
                    "cantidad": datos.cantidad,
                    "fuentes_descontadas": fuentes_utilizadas,
                    "incidencia_id": incidencia.id,
                    "movimiento_id": movimiento.id,
                    "disponible_origen": (
                        total_disponible - datos.cantidad
                    ),
                    "danado_destino": (
                        danado_anterior + datos.cantidad
                    ),
                },
            ),
            commit=False,
        )

        # ==================================================
        # CONFIRMAR TRANSACCION
        # ==================================================

        if commit:

            db.commit()
            db.refresh(movimiento)

        return respuesta_movimiento(
            movimiento,
            "DANO",
        )

    except Exception:

        db.rollback()
        raise


# ==========================================================
# 3. REGISTRAR ENVIO (SALIDA DE BODEGA)
# ==========================================================
#
# Disponible -> fuera de bodega.
#
# - apiario_id y colmena_id son opcionales y solo
#   registran a donde fue el material.
# - Si viene colmena_id, debe pertenecer al apiario.
# - No suma stock en el apiario ni en la colmena.
# - Se registra como movimiento RETIRO.
# ==========================================================

def validar_destino_envio(
    db: Session,
    datos: StockMovimientoCreate,
) -> tuple[int | None, int | None]:
    """Valida el destino informado y devuelve (apiario, colmena)."""

    apiario_id = datos.apiario_id
    colmena_id = datos.colmena_id

    if colmena_id is not None:

        colmena = db.get(Colmena, colmena_id)

        if colmena is None or not colmena.activo:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La colmena de destino no existe",
            )

        if colmena.estado in ESTADOS_COLMENA_SIN_ENVIO:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No se puede enviar material a una "
                    "colmena inactiva o dada de baja"
                ),
            )

        if (
            apiario_id is not None
            and colmena.apiario_id != apiario_id
        ):

            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    "La colmena no pertenece al apiario indicado"
                ),
            )

        apiario_id = colmena.apiario_id

    if apiario_id is not None:

        apiario = db.get(Apiario, apiario_id)

        if apiario is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El apiario de destino no existe",
            )

        if not apiario.activo:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No se puede enviar material a un "
                    "apiario inactivo"
                ),
            )

    return apiario_id, colmena_id


def registrar_envio_bodega(
    db: Session,
    datos: StockMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> StockMovimientoResponse:

    try:

        apiario_id, colmena_id = validar_destino_envio(
            db,
            datos,
        )

        bloquear_inventario(db)

        ahora = datetime.now(timezone.utc)

        # ==================================================
        # BUSCAR MATERIAL DISPONIBLE
        # ==================================================
        #
        # Primero sale lo BUENO y despues lo REPARADO.
        # ==================================================

        existencias = db.scalars(
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado.in_(
                    ESTADOS_DISPONIBLES
                ),
            )
            .order_by(InventarioStock.estado)
            .with_for_update()
        ).all()

        total_disponible = sum(
            registro.cantidad
            for registro in existencias
        )

        if total_disponible < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Stock insuficiente para registrar la salida. "
                    f"Disponible: {total_disponible}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        fuentes_utilizadas = descontar_existencias(
            existencias,
            datos.cantidad,
            ahora,
        )

        # ==================================================
        # REGISTRAR MOVIMIENTO
        # ==================================================

        movimiento = InventarioMovimiento(
            material=datos.material,
            tipo_movimiento="RETIRO",
            cantidad=datos.cantidad,
            origen_ubicacion="BODEGA",
            colmena_origen_id=None,
            origen_estado=(
                next(iter(fuentes_utilizadas))
                if len(fuentes_utilizadas) == 1
                else None
            ),
            destino_ubicacion=None,
            colmena_destino_id=None,
            destino_estado=None,
            salida_apiario_id=apiario_id,
            salida_colmena_id=colmena_id,
            usuario_id=usuario_id,
            observaciones=datos.observaciones,
        )

        db.add(movimiento)
        db.flush()

        # ==================================================
        # REGISTRAR AUDITORIA
        # ==================================================

        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_id,
                entidad="INVENTARIO_MOVIMIENTO",
                entidad_id=movimiento.id,
                accion="CREAR",
                datos_anteriores={
                    "material": datos.material,
                    "disponible": total_disponible,
                },
                datos_nuevos={
                    "tipo": "ENVIO",
                    "material": datos.material,
                    "cantidad": datos.cantidad,
                    "fuentes_descontadas": fuentes_utilizadas,
                    "apiario_id": apiario_id,
                    "colmena_id": colmena_id,
                    "movimiento_id": movimiento.id,
                    "disponible": (
                        total_disponible - datos.cantidad
                    ),
                },
            ),
            commit=False,
        )

        if commit:

            db.commit()
            db.refresh(movimiento)

        return respuesta_movimiento(
            movimiento,
            "ENVIO",
        )

    except Exception:

        db.rollback()
        raise


# ==========================================================
# 4. MOVER MATERIAL DANADO
# ==========================================================
#
# ENVIO_REPARACION  DANADO        -> EN_REPARACION
# REPARACION        EN_REPARACION -> REPARADO (disponible)
# DESCARTE          DANADO o EN_REPARACION -> MERMA
#
# - Valida stock e incidencias suficientes.
# - Actualiza las incidencias por antiguedad (FIFO).
# - Genera movimiento y auditoria.
#
# No aplica a los marcos con cera: sus danados se
# registran como MARCO_VACIO.
# ==========================================================

# tipo, estado_origen -> regla de la transicion.
#
# campo_*: columna de InventarioIncidencia que se descuenta
# y la que se aumenta.
TRANSICIONES = {
    ("ENVIO_REPARACION", None): {
        "estados_origen": ESTADOS_DANADOS,
        "estado_movimiento": "DANADO",
        "estado_destino": "EN_REPARACION",
        "tipo_movimiento": "INICIAR_REPARACION",
        "campo_origen": "cantidad_pendiente",
        "campo_destino": "cantidad_en_reparacion",
        "texto": "danado",
    },
    ("REPARACION", None): {
        "estados_origen": ("EN_REPARACION",),
        "estado_movimiento": "EN_REPARACION",
        "estado_destino": "REPARADO",
        "tipo_movimiento": "REPARAR",
        "campo_origen": "cantidad_en_reparacion",
        "campo_destino": "cantidad_reparada",
        "texto": "en reparacion",
    },
    ("DESCARTE", "DANADO"): {
        "estados_origen": ESTADOS_DANADOS,
        "estado_movimiento": "DANADO",
        "estado_destino": None,
        "tipo_movimiento": "BAJA",
        "campo_origen": "cantidad_pendiente",
        "campo_destino": "cantidad_baja",
        "texto": "danado",
    },
    ("DESCARTE", "EN_REPARACION"): {
        "estados_origen": ("EN_REPARACION",),
        "estado_movimiento": "EN_REPARACION",
        "estado_destino": None,
        "tipo_movimiento": "BAJA",
        "campo_origen": "cantidad_en_reparacion",
        "campo_destino": "cantidad_baja",
        "texto": "en reparacion",
    },
}


def mover_material_danado(
    db: Session,
    datos: StockMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> StockMovimientoResponse:

    regla = TRANSICIONES[(datos.tipo, datos.estado_origen)]

    # ======================================================
    # VALIDAR MARCOS CON CERA
    # ======================================================

    if datos.material in MATERIALES_CERA:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Los marcos con cera danados se registran "
                "como MARCO_VACIO. Seleccione MARCO_VACIO "
                "para este movimiento."
            ),
        )

    try:

        bloquear_inventario(db)

        ahora = datetime.now(timezone.utc)

        # ==================================================
        # CONSULTAR STOCK DE ORIGEN
        # ==================================================
        #
        # DANADO se descuenta antes que ROTO.
        # ==================================================

        existencias = db.scalars(
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado.in_(
                    regla["estados_origen"]
                ),
            )
            .order_by(InventarioStock.estado)
            .with_for_update()
        ).all()

        cantidad_origen = sum(
            registro.cantidad
            for registro in existencias
        )

        if cantidad_origen < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Stock {regla['texto']} insuficiente. "
                    f"Disponible: {cantidad_origen}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # CONSULTAR INCIDENCIAS QUE RESPALDAN EL MATERIAL
        # ==================================================

        campo_origen = regla["campo_origen"]
        campo_destino = regla["campo_destino"]

        incidencias = db.scalars(
            select(InventarioIncidencia)
            .where(
                InventarioIncidencia.material == datos.material,
                InventarioIncidencia.tipo_dano.in_(
                    ESTADOS_DANADOS
                ),
                InventarioIncidencia.ubicacion_detectada
                == "BODEGA",
                InventarioIncidencia.colmena_detectada_id.is_(
                    None
                ),
                getattr(InventarioIncidencia, campo_origen) > 0,
            )
            .order_by(
                InventarioIncidencia.fecha_deteccion.asc(),
                InventarioIncidencia.id.asc(),
            )
            .with_for_update()
        ).all()

        total_incidencias = sum(
            getattr(incidencia, campo_origen)
            for incidencia in incidencias
        )

        if total_incidencias < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No existen suficientes incidencias "
                    f"con material {regla['texto']} para "
                    "respaldar el movimiento. "
                    f"Pendiente: {total_incidencias}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # ACTUALIZAR INCIDENCIAS (FIFO)
        # ==================================================

        observacion = (datos.observaciones or "").strip()
        restante = datos.cantidad
        incidencias_actualizadas = []

        for incidencia in incidencias:

            if restante == 0:
                break

            mover = min(
                getattr(incidencia, campo_origen),
                restante,
            )

            if mover == 0:
                continue

            setattr(
                incidencia,
                campo_origen,
                getattr(incidencia, campo_origen) - mover,
            )
            setattr(
                incidencia,
                campo_destino,
                getattr(incidencia, campo_destino) + mover,
            )
            incidencia.fecha_actualizacion = ahora

            if datos.tipo == "REPARACION" and observacion:

                detalle_anterior = (
                    incidencia.detalle_reparacion or ""
                ).strip()

                nuevo_detalle = (
                    f"Reparadas {mover} unidad(es): "
                    f"{observacion}"
                )

                incidencia.detalle_reparacion = (
                    f"{detalle_anterior}\n{nuevo_detalle}"
                    if detalle_anterior
                    else nuevo_detalle
                )

            # Cerrar incidencia si se resolvio.
            if (
                incidencia.cantidad_pendiente == 0
                and incidencia.cantidad_en_reparacion == 0
            ):
                incidencia.fecha_cierre = ahora

            incidencias_actualizadas.append({
                "incidencia_id": incidencia.id,
                "cantidad": mover,
            })

            restante -= mover

        assert restante == 0

        # ==================================================
        # DESCONTAR ORIGEN Y AUMENTAR DESTINO
        # ==================================================

        fuentes_utilizadas = descontar_existencias(
            existencias,
            datos.cantidad,
            ahora,
        )

        estado_destino = regla["estado_destino"]
        destino_anterior = None

        if estado_destino is not None:

            stock_destino = stock_bodega(
                db,
                datos.material,
                estado_destino,
            )

            destino_anterior = (
                stock_destino.cantidad
                if stock_destino is not None
                else 0
            )

            if stock_destino is None:

                db.add(
                    InventarioStock(
                        material=datos.material,
                        ubicacion="BODEGA",
                        colmena_id=None,
                        estado=estado_destino,
                        cantidad=datos.cantidad,
                    )
                )

            else:

                stock_destino.cantidad += datos.cantidad
                stock_destino.fecha_actualizacion = ahora

        db.flush()

        # ==================================================
        # REGISTRAR MOVIMIENTO
        # ==================================================
        #
        # Si el destino es MERMA no hay ubicacion de destino:
        # el material sale definitivamente del inventario.
        # ==================================================

        movimiento = InventarioMovimiento(
            material=datos.material,
            tipo_movimiento=regla["tipo_movimiento"],
            cantidad=datos.cantidad,
            origen_ubicacion="BODEGA",
            colmena_origen_id=None,
            origen_estado=regla["estado_movimiento"],
            destino_ubicacion=(
                "BODEGA" if estado_destino is not None else None
            ),
            colmena_destino_id=None,
            destino_estado=estado_destino,
            usuario_id=usuario_id,
            observaciones=datos.observaciones,
        )

        db.add(movimiento)
        db.flush()

        # ==================================================
        # REGISTRAR AUDITORIA
        # ==================================================

        datos_nuevos = {
            "tipo": datos.tipo,
            "material": datos.material,
            "cantidad": datos.cantidad,
            "movimiento_id": movimiento.id,
            "fuentes_descontadas": fuentes_utilizadas,
            "incidencias": incidencias_actualizadas,
            "cantidad_origen": cantidad_origen - datos.cantidad,
        }

        if estado_destino is not None:
            datos_nuevos["cantidad_destino"] = (
                destino_anterior + datos.cantidad
            )

        if datos.observaciones:
            datos_nuevos["observaciones"] = datos.observaciones

        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_id,
                entidad="INVENTARIO_MOVIMIENTO",
                entidad_id=movimiento.id,
                accion="CREAR",
                datos_anteriores={
                    "material": datos.material,
                    "estado_origen": regla["estado_movimiento"],
                    "cantidad_origen": cantidad_origen,
                    "estado_destino": estado_destino or "MERMA",
                    "cantidad_destino": destino_anterior,
                },
                datos_nuevos=datos_nuevos,
            ),
            commit=False,
        )

        if commit:

            db.commit()
            db.refresh(movimiento)

        return respuesta_movimiento(
            movimiento,
            datos.tipo,
        )

    except Exception:

        db.rollback()
        raise


# ==========================================================
# 5. REGISTRAR MOVIMIENTO DE STOCK
# ==========================================================
#
# Esta funcion recibe las solicitudes del router
# POST /stock/movimientos/
#
# Distribuye hacia el servicio correspondiente.
# ==========================================================

def registrar_movimiento_stock(
    db: Session,
    datos: StockMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> StockMovimientoResponse:

    # ======================================================
    # INGRESO
    # ======================================================

    if datos.tipo == "INGRESO":

        datos_inventario = InventarioMovimientoCreate(
            material=datos.material,
            tipo_movimiento="INGRESO",
            cantidad=datos.cantidad,
            estado="BUENO",
            origen_ubicacion=None,
            colmena_origen_id=None,
            destino_ubicacion="BODEGA",
            colmena_destino_id=None,
            observaciones=datos.observaciones,
        )

        movimiento = (
            inventario_service.registrar_movimiento_bodega(
                db=db,
                datos=datos_inventario,
                usuario_id=usuario_id,
                commit=commit,
            )
        )

        return respuesta_movimiento(
            movimiento,
            "INGRESO",
        )

    # ======================================================
    # ENVIO
    # ======================================================

    if datos.tipo == "ENVIO":

        return registrar_envio_bodega(
            db=db,
            datos=datos,
            usuario_id=usuario_id,
            commit=commit,
        )

    # ======================================================
    # DANO
    # ======================================================

    if datos.tipo == "DANO":

        return registrar_dano_bodega(
            db=db,
            datos=datos,
            usuario_id=usuario_id,
            commit=commit,
        )

    # ======================================================
    # ENVIO_REPARACION, REPARACION Y DESCARTE
    # ======================================================

    return mover_material_danado(
        db=db,
        datos=datos,
        usuario_id=usuario_id,
        commit=commit,
    )


# ==========================================================
# 6. CONSULTAR HISTORIAL DE MOVIMIENTOS
# ==========================================================
#
# GET /stock/movimientos/
#
# FILTROS:
#
# - material
# - tipo
# - desde
# - hasta
# - offset
# - limit
#
# TRADUCCIONES:
#
# INGRESO            -> INGRESO
# RETIRO             -> ENVIO
# DANAR              -> DANO
# INICIAR_REPARACION -> ENVIO_REPARACION
# REPARAR            -> REPARACION
# BAJA               -> DESCARTE
# ==========================================================

TRADUCCION_TIPOS = {
    "INGRESO": "INGRESO",
    "RETIRO": "ENVIO",
    "DANAR": "DANO",
    "INICIAR_REPARACION": "ENVIO_REPARACION",
    "REPARAR": "REPARACION",
    "BAJA": "DESCARTE",
}


def listar_movimientos_stock(
    db: Session,
    material: MaterialStock | None = None,
    tipo: TipoMovimientoStock | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    offset: int = 0,
    limit: int = 20,
) -> list[StockMovimientoResponse]:

    # ======================================================
    # VALIDAR FECHAS
    # ======================================================

    if (
        desde is not None
        and hasta is not None
        and desde > hasta
    ):

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El rango de fechas es invalido",
        )

    # ======================================================
    # VALIDAR PAGINACION
    # ======================================================

    if offset < 0 or limit < 1 or limit > 101:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Paginacion invalida",
        )

    # ======================================================
    # DEFINIR MOVIMIENTOS PERMITIDOS
    # ======================================================
    #
    # Las reparaciones antiguas salian de DANADO; las
    # nuevas salen de EN_REPARACION. Ambas se muestran.
    # ======================================================

    condiciones = {
        "INGRESO": and_(
            InventarioMovimiento.tipo_movimiento == "INGRESO",
            InventarioMovimiento.origen_ubicacion.is_(None),
            InventarioMovimiento.destino_ubicacion == "BODEGA",
        ),
        "ENVIO": and_(
            InventarioMovimiento.tipo_movimiento == "RETIRO",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.destino_ubicacion.is_(None),
        ),
        "DANO": and_(
            InventarioMovimiento.tipo_movimiento == "DANAR",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.destino_ubicacion == "BODEGA",
            InventarioMovimiento.destino_estado == "DANADO",
        ),
        "ENVIO_REPARACION": and_(
            InventarioMovimiento.tipo_movimiento
            == "INICIAR_REPARACION",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.destino_ubicacion == "BODEGA",
            InventarioMovimiento.destino_estado
            == "EN_REPARACION",
        ),
        "REPARACION": and_(
            InventarioMovimiento.tipo_movimiento == "REPARAR",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.destino_ubicacion == "BODEGA",
            InventarioMovimiento.origen_estado.in_(
                ("DANADO", "EN_REPARACION")
            ),
            InventarioMovimiento.destino_estado == "REPARADO",
        ),
        "DESCARTE": and_(
            InventarioMovimiento.tipo_movimiento == "BAJA",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.origen_estado.in_(
                ("DANADO", "EN_REPARACION")
            ),
            InventarioMovimiento.destino_ubicacion.is_(None),
        ),
    }

    # ======================================================
    # CONSULTA BASE
    # ======================================================

    consulta = select(InventarioMovimiento).where(
        InventarioMovimiento.material.in_(
            MATERIALES_STOCK
        )
    )

    # ======================================================
    # FILTRO POR TIPO
    # ======================================================

    if tipo is not None:

        consulta = consulta.where(
            condiciones[tipo]
        )

    else:

        consulta = consulta.where(
            or_(*condiciones.values())
        )

    # ======================================================
    # FILTRO POR MATERIAL
    # ======================================================

    if material is not None:

        consulta = consulta.where(
            InventarioMovimiento.material == material
        )

    # ======================================================
    # FECHAS EN HORARIO DE CHILE
    # ======================================================

    fecha_chile = cast(
        func.timezone(
            "America/Santiago",
            InventarioMovimiento.fecha_creacion,
        ),
        Date,
    )

    if desde is not None:

        consulta = consulta.where(
            fecha_chile >= desde
        )

    if hasta is not None:

        consulta = consulta.where(
            fecha_chile <= hasta
        )

    # ======================================================
    # ORDEN Y PAGINACION
    # ======================================================

    consulta = (
        consulta
        .order_by(
            InventarioMovimiento.fecha_creacion.desc(),
            InventarioMovimiento.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )

    movimientos = db.scalars(consulta).all()

    return [
        respuesta_movimiento(
            movimiento,
            TRADUCCION_TIPOS[movimiento.tipo_movimiento],
        )
        for movimiento in movimientos
    ]
