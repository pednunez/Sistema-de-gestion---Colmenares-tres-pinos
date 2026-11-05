
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.orm import Session

from app.core.dependencies import (
    obtener_usuario_actual,
    requerir_admin,
)
from app.database import get_db
from app.models.usuario import Usuario

from app.schemas.inventario import (
    InventarioIncidenciaResponse,
    InventarioMovimientoCreate,
    InventarioMovimientoResponse,
    InventarioResumenResponse,
    InventarioStockResponse,
    MaterialInventario,
    UbicacionInventario,
)

from app.services import inventario as inventario_service
from app.services import (
    inventario_operaciones as operaciones_service,
)


# ==========================================================
# ROUTER: INVENTARIO GENERAL
# PROYECTO: COLMENARES TRES PINOS
# ==========================================================
#
# Todas las rutas requieren autenticacion.
#
# Las operaciones de escritura requieren rol ADMIN.
# ==========================================================

router = APIRouter(
    prefix="/inventario",
    tags=["Inventario"],
    dependencies=[Depends(obtener_usuario_actual)],
)


# ==========================================================
# CONSULTAR RESUMEN GENERAL
# ==========================================================

@router.get(
    "/resumen",
    response_model=InventarioResumenResponse,
)
def obtener_resumen_inventario(
    db: Session = Depends(get_db),
):
    return inventario_service.obtener_resumen(db)


# ==========================================================
# CONSULTAR STOCK
# ==========================================================

@router.get(
    "/stock",
    response_model=list[InventarioStockResponse],
)
def listar_stock_inventario(
    material: MaterialInventario | None = Query(
        default=None,
    ),
    ubicacion: UbicacionInventario | None = Query(
        default=None,
    ),
    colmena_id: int | None = Query(
        default=None,
        gt=0,
    ),
    db: Session = Depends(get_db),
):
    return inventario_service.listar_stock(
        db=db,
        material=material,
        ubicacion=ubicacion,
        colmena_id=colmena_id,
    )


# ==========================================================
# CONSULTAR HISTORIAL DE MOVIMIENTOS
# ==========================================================

@router.get(
    "/movimientos",
    response_model=list[InventarioMovimientoResponse],
)
def listar_movimientos_inventario(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    db: Session = Depends(get_db),
):
    return inventario_service.listar_movimientos(
        db=db,
        limit=limit,
    )


# ==========================================================
# REGISTRAR INGRESO O RETIRO DE BODEGA
# ==========================================================
#
# POST /inventario/movimientos
#
# Requiere usuario ADMIN.
#
# Por ahora permite:
# - INGRESO de materiales BUENOS a BODEGA.
# - RETIRO de materiales BUENOS desde BODEGA.
#
# Los traslados, danos y reparaciones se incorporaran
# en las siguientes etapas.
# ==========================================================

@router.post(
    "/movimientos",
    response_model=InventarioMovimientoResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_movimiento_inventario(
    datos: InventarioMovimientoCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(requerir_admin),
):
    return operaciones_service.registrar_movimiento_bodega(
        db=db,
        datos=datos,
        usuario_id=usuario_actual.id,
    )


# ==========================================================
# CONSULTAR INCIDENCIAS
# ==========================================================

@router.get(
    "/incidencias",
    response_model=list[InventarioIncidenciaResponse],
)
def listar_incidencias_inventario(
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    db: Session = Depends(get_db),
):
    return inventario_service.listar_incidencias(
        db=db,
        limit=limit,
    )


# ==========================================================
# CONSULTAR INCIDENCIA POR ID
# ==========================================================

@router.get(
    "/incidencias/{incidencia_id}",
    response_model=InventarioIncidenciaResponse,
)
def obtener_incidencia_inventario(
    incidencia_id: int,
    db: Session = Depends(get_db),
):
    incidencia = inventario_service.obtener_incidencia(
        db=db,
        incidencia_id=incidencia_id,
    )

    if incidencia is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incidencia de inventario no encontrada",
        )

    return incidencia
