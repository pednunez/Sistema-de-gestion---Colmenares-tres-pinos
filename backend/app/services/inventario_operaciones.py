
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.inventario_stock import InventarioStock
from app.models.inventario_movimiento import InventarioMovimiento
from app.schemas.inventario import InventarioMovimientoCreate
from app.schemas.auditoria import AuditoriaCreate
from app.services import auditoria as auditoria_service


# ==========================================================
# OPERACIONES DE INVENTARIO - COLMENARES TRES PINOS
# ==========================================================
#
# PRIMERA ETAPA:
# - INGRESO de materiales BUENOS a BODEGA.
# - RETIRO de materiales BUENOS desde BODEGA.
#
# El registro de movimiento, el stock y la auditoria
# se guardan en una misma transaccion.
#
# commit=False permite realizar pruebas reversibles
# sin guardar cambios permanentemente.
# ==========================================================


def registrar_movimiento_bodega(
    db: Session,
    datos: InventarioMovimientoCreate,
    usuario_id: int,
    *,
    commit: bool = True,
) -> InventarioMovimiento:

    # ======================================================
    # 1. VALIDACIONES DE LA OPERACION
    # ======================================================

    if datos.tipo_movimiento not in ("INGRESO", "RETIRO"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Esta operacion solo permite INGRESO o RETIRO",
        )

    if datos.estado != "BUENO":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Por ahora solo se admite estado BUENO",
        )

    es_ingreso = datos.tipo_movimiento == "INGRESO"

    if es_ingreso:
        if (
            datos.origen_ubicacion is not None
            or datos.destino_ubicacion != "BODEGA"
            or datos.colmena_origen_id is not None
            or datos.colmena_destino_id is not None
        ):
            raise HTTPException(
                status_code=422,
                detail="El ingreso debe ir directamente a BODEGA",
            )

    else:
        if (
            datos.origen_ubicacion != "BODEGA"
            or datos.destino_ubicacion is not None
            or datos.colmena_origen_id is not None
            or datos.colmena_destino_id is not None
        ):
            raise HTTPException(
                status_code=422,
                detail="El retiro debe salir directamente de BODEGA",
            )

    # ======================================================
    # 2. TRANSACCION DE INVENTARIO
    # ======================================================

    try:

        # Bloqueo compartido por las operaciones de
        # inventario que utilicen este mismo convenio.
        #
        # Evita que dos operaciones concurrentes de este
        # servicio generen saldos inconsistentes.

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
        # 3. CONSULTAR Y BLOQUEAR STOCK
        # ==================================================

        consulta = (
            select(InventarioStock)
            .where(
                InventarioStock.material == datos.material,
                InventarioStock.ubicacion == "BODEGA",
                InventarioStock.colmena_id.is_(None),
                InventarioStock.estado == "BUENO",
            )
            .with_for_update()
        )

        stock = db.scalar(consulta)

        cantidad_anterior = (
            stock.cantidad if stock is not None else 0
        )

        # ==================================================
        # 4. CALCULAR NUEVA CANTIDAD
        # ==================================================

        if es_ingreso:
            cantidad_nueva = cantidad_anterior + datos.cantidad

        else:
            if cantidad_anterior < datos.cantidad:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Stock insuficiente en bodega. "
                        f"Disponible: {cantidad_anterior}. "
                        f"Solicitado: {datos.cantidad}."
                    ),
                )

            cantidad_nueva = cantidad_anterior - datos.cantidad

        # ==================================================
        # 5. ACTUALIZAR STOCK
        # ==================================================

        if stock is None:
            stock = InventarioStock(
                material=datos.material,
                ubicacion="BODEGA",
                colmena_id=None,
                estado="BUENO",
                cantidad=cantidad_nueva,
            )
            db.add(stock)

        else:
            stock.cantidad = cantidad_nueva
            stock.fecha_actualizacion = datetime.now(
                timezone.utc
            )

        db.flush()

        # ==================================================
        # 6. REGISTRAR MOVIMIENTO
        # ==================================================

        movimiento = InventarioMovimiento(
            material=datos.material,
            tipo_movimiento=datos.tipo_movimiento,
            cantidad=datos.cantidad,

            origen_ubicacion=(
                None if es_ingreso else "BODEGA"
            ),
            colmena_origen_id=None,
            origen_estado=(
                None if es_ingreso else "BUENO"
            ),

            destino_ubicacion=(
                "BODEGA" if es_ingreso else None
            ),
            colmena_destino_id=None,
            destino_estado=(
                "BUENO" if es_ingreso else None
            ),

            usuario_id=usuario_id,
            observaciones=datos.observaciones,
        )

        db.add(movimiento)
        db.flush()

        # ==================================================
        # 7. REGISTRAR AUDITORIA
        # ==================================================

        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_id,
                entidad="INVENTARIO_MOVIMIENTO",
                entidad_id=movimiento.id,
                accion=(
                    "CREAR" if es_ingreso else "MODIFICAR"
                ),
                datos_anteriores={
                    "material": datos.material,
                    "ubicacion": "BODEGA",
                    "estado": "BUENO",
                    "cantidad": cantidad_anterior,
                },
                datos_nuevos={
                    "material": datos.material,
                    "ubicacion": "BODEGA",
                    "estado": "BUENO",
                    "cantidad": cantidad_nueva,
                    "tipo_movimiento": datos.tipo_movimiento,
                    "cantidad_movida": datos.cantidad,
                    "movimiento_id": movimiento.id,
                },
            ),
            commit=False,
        )

        # ==================================================
        # 8. CONFIRMAR O DEJAR PENDIENTE
        # ==================================================

        if commit:
            db.commit()
            db.refresh(movimiento)

        return movimiento

    except Exception:
        db.rollback()
        raise
