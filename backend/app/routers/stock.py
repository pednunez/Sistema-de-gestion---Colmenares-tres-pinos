
from datetime import date, datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from sqlalchemy import (
    func,
    select,
    text,
)

from sqlalchemy.orm import Session

from app.core.dependencies import (
    obtener_usuario_actual,
    requerir_admin,
)

from app.database import get_db

from app.models.inventario_movimiento import InventarioMovimiento
from app.models.inventario_stock import InventarioStock
from app.models.stock_minimo import StockMinimo
from app.models.usuario import Usuario

from app.schemas.auditoria import AuditoriaCreate

from app.schemas.stock import (
    MaterialStock,
    TipoMovimientoStock,
    StockMovimientoCreate,
    StockMovimientoResponse,
)

from app.services import auditoria as auditoria_service

from app.services import (
    stock_movimientos as stock_movimientos_service,
)


# ==========================================================
# STOCK DE BODEGA - COLMENARES TRES PINOS
# ==========================================================
#
# ENDPOINTS:
#
# GET   /stock/
# PATCH /stock/{material}
# POST  /stock/movimientos/
# GET   /stock/movimientos/
#
# Permisos:
#
# GET: ADMIN y APICULTOR.
# PATCH y POST: solo ADMIN.
#
# El inventario de BODEGA permanece separado
# de los materiales INSTALADOS en colmenas.
#
# ==========================================================

router = APIRouter(
    prefix="/stock",
    tags=["Stock"],
    dependencies=[Depends(obtener_usuario_actual)],
)


# ==========================================================
# MATERIALES DEL FRONTEND DE PEDRO
# ==========================================================

MATERIALES_STOCK = stock_movimientos_service.MATERIALES_STOCK


# ==========================================================
# ESTADOS DEL INVENTARIO
# ==========================================================

ESTADOS_DISPONIBLES = (
    "BUENO",
    "REPARADO",
)

# ROTO se informa como danado: en pantalla hay un solo
# concepto de material danado.
ESTADOS_DANADOS = (
    "DANADO",
    "ROTO",
)


# ==========================================================
# RESPUESTA GET /stock/
# ==========================================================

class StockFilaResponse(BaseModel):

    material: str

    disponible: int = Field(ge=0)

    danado: int = Field(ge=0)

    en_reparacion: int = Field(ge=0)

    # Total acumulado de unidades descartadas.
    merma: int = Field(ge=0)

    minimo: int | None = Field(
        default=None,
        ge=0,
    )

    actualizado_en: datetime | None = None


# ==========================================================
# SOLICITUD PATCH /stock/{material}
# ==========================================================
#
# minimo = 5    -> Crear o actualizar.
# minimo = 0    -> Configurar minimo cero.
# minimo = null -> Eliminar configuracion.
#
# ==========================================================

class StockMinimoUpdate(BaseModel):

    minimo: int | None = Field(
        ...,
        ge=0,
        strict=True,
    )

    model_config = ConfigDict(
        extra="forbid",
    )


# ==========================================================
# RESPUESTA PATCH /stock/{material}
# ==========================================================

class StockMinimoResponse(BaseModel):

    material: str

    minimo: int | None

    actualizado_en: datetime | None


# ==========================================================
# 1. GET /stock/
# ==========================================================
#
# Consulta disponible, danado, en reparacion y merma
# de los materiales de BODEGA.
#
# Tambien consulta los minimos configurados.
#
# No modifica PostgreSQL.
#
# ==========================================================

@router.get(
    "/",
    response_model=list[StockFilaResponse],
)
def consultar_stock(
    db: Session = Depends(get_db),
):

    # ======================================================
    # INICIALIZAR TODOS LOS MATERIALES
    # ======================================================

    resumen = {
        material: {
            "material": material,
            "disponible": 0,
            "danado": 0,
            "en_reparacion": 0,
            "merma": 0,
            "minimo": None,
            "actualizado_en": None,
        }
        for material in MATERIALES_STOCK
    }

    # ======================================================
    # CONSULTAR EXISTENCIAS DE BODEGA
    # ======================================================

    consulta_stock = (
        select(
            InventarioStock.material,
            InventarioStock.estado,
            func.sum(
                InventarioStock.cantidad
            ).label("cantidad"),
            func.max(
                InventarioStock.fecha_actualizacion
            ).label("actualizado_en"),
        )
        .where(
            InventarioStock.ubicacion == "BODEGA",
            InventarioStock.material.in_(
                MATERIALES_STOCK
            ),
        )
        .group_by(
            InventarioStock.material,
            InventarioStock.estado,
        )
    )

    resultados_stock = db.execute(
        consulta_stock
    ).all()

    # ======================================================
    # PROCESAR CANTIDADES POR ESTADO
    # ======================================================

    for fila in resultados_stock:

        item = resumen[fila.material]

        cantidad = int(fila.cantidad)

        if fila.estado in ESTADOS_DISPONIBLES:

            item["disponible"] += cantidad

        elif fila.estado in ESTADOS_DANADOS:

            item["danado"] += cantidad

        elif fila.estado == "EN_REPARACION":

            item["en_reparacion"] += cantidad

        # ==================================================
        # FECHA DE ACTUALIZACION DEL INVENTARIO
        # ==================================================

        if (
            fila.actualizado_en is not None
            and (
                item["actualizado_en"] is None
                or fila.actualizado_en
                > item["actualizado_en"]
            )
        ):

            item["actualizado_en"] = (
                fila.actualizado_en
            )

    # ======================================================
    # MERMA ACUMULADA
    # ======================================================
    #
    # Suma de las bajas registradas desde la bodega.
    # ======================================================

    consulta_merma = (
        select(
            InventarioMovimiento.material,
            func.sum(
                InventarioMovimiento.cantidad
            ).label("cantidad"),
        )
        .where(
            InventarioMovimiento.tipo_movimiento == "BAJA",
            InventarioMovimiento.origen_ubicacion == "BODEGA",
            InventarioMovimiento.material.in_(
                MATERIALES_STOCK
            ),
        )
        .group_by(
            InventarioMovimiento.material,
        )
    )

    for fila in db.execute(consulta_merma).all():

        resumen[fila.material]["merma"] = int(fila.cantidad)

    # ======================================================
    # CONSULTAR MINIMOS DE POSTGRESQL
    # ======================================================

    consulta_minimos = (
        select(
            StockMinimo.material,
            StockMinimo.minimo,
            StockMinimo.actualizado_en,
        )
        .where(
            StockMinimo.material.in_(
                MATERIALES_STOCK
            )
        )
    )

    resultados_minimos = db.execute(
        consulta_minimos
    ).all()

    # ======================================================
    # ASOCIAR MINIMOS A CADA MATERIAL
    # ======================================================

    for fila in resultados_minimos:

        item = resumen[fila.material]

        item["minimo"] = int(
            fila.minimo
        )

        if (
            fila.actualizado_en is not None
            and (
                item["actualizado_en"] is None
                or fila.actualizado_en
                > item["actualizado_en"]
            )
        ):

            item["actualizado_en"] = (
                fila.actualizado_en
            )

    return list(resumen.values())


# ==========================================================
# 2. POST /stock/movimientos/
# ==========================================================
#
# Registra movimientos de stock.
#
# Tipos: INGRESO, ENVIO, DANO, ENVIO_REPARACION,
# REPARACION y DESCARTE.
#
# Solo ADMIN puede registrar movimientos.
#
# La logica de stock y auditoria se encuentra
# en app/services/stock_movimientos.py.
#
# ==========================================================

@router.post(
    "/movimientos/",
    response_model=StockMovimientoResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_movimiento_stock(
    datos: StockMovimientoCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(requerir_admin),
):

    return stock_movimientos_service.registrar_movimiento_stock(
        db=db,
        datos=datos,
        usuario_id=usuario_actual.id,
    )


# ==========================================================
# 3. GET /stock/movimientos/
# ==========================================================
#
# NUEVO ENDPOINT: HISTORIAL DE MOVIMIENTOS
#
# Permite consultar movimientos utilizando:
#
# - material
# - tipo
# - desde
# - hasta
# - offset
# - limit
#
# Orden: mas recientes primero.
#
# Permisos: ADMIN y APICULTOR.
#
# No modifica PostgreSQL.
#
# ==========================================================

@router.get(
    "/movimientos/",
    response_model=list[StockMovimientoResponse],
)
def consultar_historial_stock(

    # ======================================================
    # FILTRO POR MATERIAL
    # ======================================================

    material: MaterialStock | None = Query(
        default=None,
    ),

    # ======================================================
    # FILTRO POR TIPO DE MOVIMIENTO
    # ======================================================

    tipo: TipoMovimientoStock | None = Query(
        default=None,
    ),

    # ======================================================
    # FECHA INICIAL
    # ======================================================
    #
    # Formato: YYYY-MM-DD.
    # ======================================================

    desde: date | None = Query(
        default=None,
    ),

    # ======================================================
    # FECHA FINAL
    # ======================================================

    hasta: date | None = Query(
        default=None,
    ),

    # ======================================================
    # REGISTROS QUE SE OMITEN
    # ======================================================

    offset: int = Query(
        default=0,
        ge=0,
    ),

    # ======================================================
    # CANTIDAD DE REGISTROS
    # ======================================================
    #
    # Pedro solicita 21 registros para mostrar
    # 20 y detectar si existe una pagina siguiente.
    # ======================================================

    limit: int = Query(
        default=20,
        ge=1,
        le=101,
    ),

    db: Session = Depends(get_db),
):

    # ======================================================
    # CONSULTAR HISTORIAL DESDE EL SERVICIO
    # ======================================================

    return stock_movimientos_service.listar_movimientos_stock(
        db=db,
        material=material,
        tipo=tipo,
        desde=desde,
        hasta=hasta,
        offset=offset,
        limit=limit,
    )


# ==========================================================
# 4. PATCH /stock/{material}
# ==========================================================
#
# Permite configurar el minimo de un material.
#
# Solo ADMIN.
#
# Genera auditoria cuando existe un cambio.
#
# La configuracion y su auditoria se guardan
# en la misma transaccion.
#
# ==========================================================

@router.patch(
    "/{material}",
    response_model=StockMinimoResponse,
)
def actualizar_minimo_stock(
    material: str,
    datos: StockMinimoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(requerir_admin),
):

    # ======================================================
    # VALIDAR MATERIAL
    # ======================================================

    material = material.strip().upper()

    if material not in MATERIALES_STOCK:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Material no permitido en el modulo Stock",
        )

    try:

        # ==================================================
        # BLOQUEO PARA CONFIGURACION DE MINIMOS
        # ======================================================

        db.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                ":espacio, :recurso)"
            ),
            {
                "espacio": 74112,
                "recurso": 2,
            },
        )

        # ==================================================
        # CONSULTAR MINIMO EXISTENTE
        # ======================================================

        consulta = (
            select(StockMinimo)
            .where(
                StockMinimo.material == material
            )
            .with_for_update()
        )

        registro = db.scalar(consulta)

        minimo_anterior = (
            registro.minimo
            if registro is not None
            else None
        )

        # ==================================================
        # EVITAR CAMBIOS INNECESARIOS
        # ======================================================

        if minimo_anterior == datos.minimo:

            fecha_actualizacion = (
                registro.actualizado_en
                if registro is not None
                else None
            )

            db.rollback()

            return {
                "material": material,
                "minimo": datos.minimo,
                "actualizado_en": fecha_actualizacion,
            }

        # ==================================================
        # ELIMINAR CONFIGURACION
        # ======================================================

        if datos.minimo is None:

            if registro is not None:
                db.delete(registro)

            fecha_actualizacion = None

        # ==================================================
        # CREAR O ACTUALIZAR CONFIGURACION
        # ======================================================

        else:

            if registro is None:

                registro = StockMinimo(
                    material=material,
                    minimo=datos.minimo,
                )

                db.add(registro)

            else:

                registro.minimo = datos.minimo

                registro.actualizado_en = (
                    datetime.now(timezone.utc)
                )

        db.flush()

        # ==================================================
        # OBTENER FECHA ACTUALIZADA
        # ======================================================

        if datos.minimo is not None:

            db.refresh(registro)

            fecha_actualizacion = (
                registro.actualizado_en
            )

        # ==================================================
        # REGISTRAR AUDITORIA
        # ======================================================

        if minimo_anterior is None:

            accion = "CREAR"

        elif datos.minimo is None:

            accion = "ELIMINAR"

        else:

            accion = "MODIFICAR"

        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_actual.id,
                entidad="STOCK_MINIMO",
                entidad_id=None,
                accion=accion,
                datos_anteriores={
                    "material": material,
                    "minimo": minimo_anterior,
                },
                datos_nuevos={
                    "material": material,
                    "minimo": datos.minimo,
                },
            ),
            commit=False,
        )

        # ==================================================
        # CONFIRMAR MINIMO Y AUDITORIA
        # ======================================================

        db.commit()

        return {
            "material": material,
            "minimo": datos.minimo,
            "actualizado_en": fecha_actualizacion,
        }

    except Exception:

        db.rollback()

        raise
