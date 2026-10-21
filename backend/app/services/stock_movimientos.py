
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
#
# SERVICIO DE MOVIMIENTOS DE STOCK
# ==========================================================
#
# OPERACIONES IMPLEMENTADAS:
#
# 1. INGRESO
# 2. DANO
# 3. REPARACION
# 4. DESCARTE
#
# OPERACION PENDIENTE:
#
# 5. ENVIO
#
# Todas las operaciones actuales trabajan sobre BODEGA.
#
# Se mantiene la trazabilidad mediante:
#
# - InventarioStock
# - InventarioMovimiento
# - InventarioIncidencia
# - Auditoria
# ==========================================================


MATERIALES_STOCK = (
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
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


# ==========================================================
# 1. ADAPTAR RESPUESTA PARA EL FRONTEND
# ==========================================================

def respuesta_movimiento(
    movimiento: InventarioMovimiento,
    tipo: TipoMovimientoStock,
) -> StockMovimientoResponse:

    return StockMovimientoResponse(
        id=movimiento.id,
        material=movimiento.material,
        tipo=tipo,
        cantidad=movimiento.cantidad,
        apiario_id=None,
        colmena_id=None,
        observaciones=movimiento.observaciones,
        usuario_id=movimiento.usuario_id,
        fecha=movimiento.fecha_creacion,
    )


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
# 3. REGISTRAR REPARACION
# ==========================================================
#
# DANADO -> REPARADO.
#
# - Valida stock danado.
# - Actualiza incidencias pendientes.
# - Conserva el total fisico.
# - Genera movimiento y auditoria.
# ==========================================================

def registrar_reparacion_bodega(
    db: Session,
    datos: StockMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> StockMovimientoResponse:

    try:

        # ==================================================
        # BLOQUEO DE INVENTARIO
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

        ahora = datetime.now(timezone.utc)

        # ==================================================
        # CONSULTAR MATERIAL DANADO
        # ==================================================

        consulta_danado = (
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado == "DANADO",
            )
            .with_for_update()
        )

        stock_danado = db.scalar(consulta_danado)

        cantidad_danada = (
            stock_danado.cantidad
            if stock_danado is not None
            else 0
        )

        # ==================================================
        # VALIDAR STOCK DANADO
        # ==================================================

        if cantidad_danada < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Stock danado insuficiente. "
                    f"Disponible para reparar: {cantidad_danada}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # CONSULTAR INCIDENCIAS PENDIENTES
        # ==================================================

        consulta_incidencias = (
            select(InventarioIncidencia)
            .where(
                InventarioIncidencia.material == datos.material,
                InventarioIncidencia.tipo_dano == "DANADO",
                InventarioIncidencia.ubicacion_detectada
                == "BODEGA",
                InventarioIncidencia.colmena_detectada_id.is_(
                    None
                ),
                InventarioIncidencia.cantidad_pendiente > 0,
            )
            .order_by(
                InventarioIncidencia.fecha_deteccion.asc(),
                InventarioIncidencia.id.asc(),
            )
            .with_for_update()
        )

        incidencias = db.scalars(
            consulta_incidencias
        ).all()

        total_pendiente = sum(
            incidencia.cantidad_pendiente
            for incidencia in incidencias
        )

        # ==================================================
        # VALIDAR INCIDENCIAS
        # ==================================================

        if total_pendiente < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No existen suficientes incidencias "
                    "pendientes para respaldar la reparacion. "
                    f"Pendiente: {total_pendiente}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # ACTUALIZAR INCIDENCIAS
        # ==================================================

        restante = datos.cantidad
        incidencias_actualizadas = []

        for incidencia in incidencias:

            if restante == 0:
                break

            reparar = min(
                incidencia.cantidad_pendiente,
                restante,
            )

            if reparar == 0:
                continue

            incidencia.cantidad_pendiente -= reparar
            incidencia.cantidad_reparada += reparar
            incidencia.fecha_actualizacion = ahora

            observacion = (
                (datos.observaciones or "").strip()
            )

            if observacion:

                detalle_anterior = (
                    incidencia.detalle_reparacion or ""
                ).strip()

                nuevo_detalle = (
                    f"Reparadas {reparar} unidad(es): "
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
                "cantidad_reparada": reparar,
            })

            restante -= reparar

        assert restante == 0

        # ==================================================
        # DESCONTAR MATERIAL DANADO
        # ==================================================

        stock_danado.cantidad -= datos.cantidad
        stock_danado.fecha_actualizacion = ahora

        # ==================================================
        # AUMENTAR MATERIAL REPARADO
        # ==================================================

        consulta_reparado = (
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado == "REPARADO",
            )
            .with_for_update()
        )

        stock_reparado = db.scalar(
            consulta_reparado
        )

        reparado_anterior = (
            stock_reparado.cantidad
            if stock_reparado is not None
            else 0
        )

        if stock_reparado is None:

            stock_reparado = InventarioStock(
                material=datos.material,
                ubicacion="BODEGA",
                colmena_id=None,
                estado="REPARADO",
                cantidad=datos.cantidad,
            )

            db.add(stock_reparado)

        else:

            stock_reparado.cantidad += datos.cantidad
            stock_reparado.fecha_actualizacion = ahora

        db.flush()

        # ==================================================
        # REGISTRAR MOVIMIENTO
        # ==================================================

        movimiento = InventarioMovimiento(
            material=datos.material,
            tipo_movimiento="REPARAR",
            cantidad=datos.cantidad,
            origen_ubicacion="BODEGA",
            colmena_origen_id=None,
            origen_estado="DANADO",
            destino_ubicacion="BODEGA",
            colmena_destino_id=None,
            destino_estado="REPARADO",
            usuario_id=usuario_id,
            observaciones=datos.observaciones,
        )

        db.add(movimiento)
        db.flush()

        # ==================================================
        # AUDITORIA
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
                    "estado": "DANADO",
                    "cantidad_danada": cantidad_danada,
                    "cantidad_reparada": reparado_anterior,
                },
                datos_nuevos={
                    "tipo": "REPARACION",
                    "material": datos.material,
                    "cantidad": datos.cantidad,
                    "movimiento_id": movimiento.id,
                    "incidencias": incidencias_actualizadas,
                    "cantidad_danada": (
                        cantidad_danada - datos.cantidad
                    ),
                    "cantidad_reparada": (
                        reparado_anterior + datos.cantidad
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
            "REPARACION",
        )

    except Exception:

        db.rollback()
        raise


# ==========================================================
# 4. REGISTRAR DESCARTE
# ==========================================================
#
# NUEVA FUNCIONALIDAD
#
# DANADO -> BAJA DEFINITIVA.
#
# - Descuenta material danado.
# - Actualiza incidencias pendientes.
# - Aumenta cantidad_baja de la incidencia.
# - Registra movimiento BAJA.
# - Genera auditoria.
#
# La baja NO vuelve a sumar al stock fisico.
# ==========================================================

def registrar_descarte_bodega(
    db: Session,
    datos: StockMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> StockMovimientoResponse:

    # ======================================================
    # VALIDAR MARCOS CON CERA
    # ======================================================
    #
    # Los marcos con cera danados se clasifican
    # como MARCO_VACIO.
    # ======================================================

    if datos.material in MATERIALES_CERA:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Los marcos con cera danados se registran "
                "como MARCO_VACIO. Seleccione MARCO_VACIO "
                "para descartarlos."
            ),
        )

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

        ahora = datetime.now(timezone.utc)

        # ==================================================
        # BUSCAR MATERIAL DANADO
        # ==================================================

        consulta_stock = (
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado == "DANADO",
            )
            .with_for_update()
        )

        stock_danado = db.scalar(
            consulta_stock
        )

        cantidad_anterior = (
            stock_danado.cantidad
            if stock_danado is not None
            else 0
        )

        # ==================================================
        # VALIDAR STOCK SUFICIENTE
        # ==================================================

        if cantidad_anterior < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Stock danado insuficiente para descartar. "
                    f"Disponible: {cantidad_anterior}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # BUSCAR INCIDENCIAS PENDIENTES
        # ==================================================

        consulta_incidencias = (
            select(InventarioIncidencia)
            .where(
                InventarioIncidencia.material == datos.material,
                InventarioIncidencia.tipo_dano == "DANADO",
                InventarioIncidencia.ubicacion_detectada
                == "BODEGA",
                InventarioIncidencia.colmena_detectada_id.is_(
                    None
                ),
                InventarioIncidencia.cantidad_pendiente > 0,
            )
            .order_by(
                InventarioIncidencia.fecha_deteccion.asc(),
                InventarioIncidencia.id.asc(),
            )
            .with_for_update()
        )

        incidencias = db.scalars(
            consulta_incidencias
        ).all()

        total_pendiente = sum(
            incidencia.cantidad_pendiente
            for incidencia in incidencias
        )

        # ==================================================
        # VALIDAR RESPALDO DE INCIDENCIAS
        # ==================================================

        if total_pendiente < datos.cantidad:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No existen suficientes incidencias "
                    "pendientes para respaldar el descarte. "
                    f"Pendiente: {total_pendiente}. "
                    f"Solicitado: {datos.cantidad}."
                ),
            )

        # ==================================================
        # ACTUALIZAR INCIDENCIAS
        # ==================================================

        restante = datos.cantidad
        incidencias_actualizadas = []

        for incidencia in incidencias:

            if restante == 0:
                break

            descartar = min(
                incidencia.cantidad_pendiente,
                restante,
            )

            if descartar == 0:
                continue

            incidencia.cantidad_pendiente -= descartar
            incidencia.cantidad_baja += descartar
            incidencia.fecha_actualizacion = ahora

            # Cerrar si ya no hay cantidades pendientes.
            if (
                incidencia.cantidad_pendiente == 0
                and incidencia.cantidad_en_reparacion == 0
            ):

                incidencia.fecha_cierre = ahora

            incidencias_actualizadas.append({
                "incidencia_id": incidencia.id,
                "cantidad_descartada": descartar,
            })

            restante -= descartar

        assert restante == 0

        # ==================================================
        # DESCONTAR STOCK FISICO
        # ==================================================
        #
        # El registro permanece en PostgreSQL.
        # La cantidad puede quedar en cero.
        # ==================================================

        stock_danado.cantidad -= datos.cantidad
        stock_danado.fecha_actualizacion = ahora

        db.flush()

        # ==================================================
        # REGISTRAR MOVIMIENTO BAJA
        # ==================================================
        #
        # Tipo interno: BAJA.
        # Tipo frontend: DESCARTE.
        #
        # No existe destino porque el material
        # sale definitivamente del inventario.
        # ==================================================

        movimiento = InventarioMovimiento(
            material=datos.material,
            tipo_movimiento="BAJA",
            cantidad=datos.cantidad,
            origen_ubicacion="BODEGA",
            colmena_origen_id=None,
            origen_estado="DANADO",
            destino_ubicacion=None,
            colmena_destino_id=None,
            destino_estado=None,
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
                    "estado": "DANADO",
                    "cantidad_danada": cantidad_anterior,
                    "cantidad_pendiente_incidencias": (
                        total_pendiente
                    ),
                },
                datos_nuevos={
                    "tipo": "DESCARTE",
                    "material": datos.material,
                    "cantidad": datos.cantidad,
                    "movimiento_id": movimiento.id,
                    "incidencias": incidencias_actualizadas,
                    "cantidad_danada": (
                        cantidad_anterior - datos.cantidad
                    ),
                    "cantidad_pendiente_incidencias": (
                        total_pendiente - datos.cantidad
                    ),
                    "observaciones": datos.observaciones,
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
            "DESCARTE",
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
    # REPARACION
    # ======================================================

    if datos.tipo == "REPARACION":

        return registrar_reparacion_bodega(
            db=db,
            datos=datos,
            usuario_id=usuario_id,
            commit=commit,
        )

    # ======================================================
    # DESCARTE
    # ======================================================

    if datos.tipo == "DESCARTE":

        return registrar_descarte_bodega(
            db=db,
            datos=datos,
            usuario_id=usuario_id,
            commit=commit,
        )

    # ======================================================
    # ENVIO PENDIENTE
    # ======================================================

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            f"El movimiento {datos.tipo} "
            "todavia no esta implementado"
        ),
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
# INGRESO -> INGRESO
# DANAR   -> DANO
# REPARAR -> REPARACION
# BAJA    -> DESCARTE
#
# ENVIO sigue pendiente.
# ==========================================================

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
    # ENVIO TODAVIA NO IMPLEMENTADO
    # ======================================================

    if tipo == "ENVIO":

        return []

    # ======================================================
    # DEFINIR MOVIMIENTOS PERMITIDOS
    # ======================================================

    condiciones = {
        "INGRESO": and_(
            InventarioMovimiento.tipo_movimiento == "INGRESO",
            InventarioMovimiento.origen_ubicacion.is_(None),
            InventarioMovimiento.destino_ubicacion == "BODEGA",
        ),
        "DANO": and_(
            InventarioMovimiento.tipo_movimiento == "DANAR",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.destino_ubicacion == "BODEGA",
            InventarioMovimiento.destino_estado == "DANADO",
        ),
        "REPARACION": and_(
            InventarioMovimiento.tipo_movimiento == "REPARAR",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.destino_ubicacion == "BODEGA",
            InventarioMovimiento.origen_estado == "DANADO",
            InventarioMovimiento.destino_estado == "REPARADO",
        ),
        "DESCARTE": and_(
            InventarioMovimiento.tipo_movimiento == "BAJA",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.origen_estado == "DANADO",
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

    # ======================================================
    # TRADUCIR TIPOS PARA EL FRONTEND
    # ======================================================

    traduccion = {
        "INGRESO": "INGRESO",
        "DANAR": "DANO",
        "REPARAR": "REPARACION",
        "BAJA": "DESCARTE",
    }

    return [
        respuesta_movimiento(
            movimiento,
            traduccion[movimiento.tipo_movimiento],
        )
        for movimiento in movimientos
    ]
