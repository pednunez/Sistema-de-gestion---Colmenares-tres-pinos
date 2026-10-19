
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
)
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db

from app.schemas.inventario import (
    EstadoInventario,
    InventarioIncidenciaResponse,
    InventarioMovimientoResponse,
    InventarioResumenResponse,
    InventarioStockResponse,
    MaterialInventario,
    UbicacionInventario,
)

from app.services import inventario as inventario_service


# ==========================================================
# ROUTER: INVENTARIO GENERAL
# COLMENARES TRES PINOS
# ==========================================================
#
# Todas las rutas requieren autenticacion.
#
# En esta primera etapa solo ofrecemos consultas.
# Las operaciones de escritura se incorporaran
# despues de implementar sus validaciones y
# transacciones de base de datos.
# ==========================================================

router = APIRouter(
    prefix="/inventario",
    tags=["Inventario"],
    dependencies=[Depends(obtener_usuario_actual)],
)


# ==========================================================
# RESUMEN GENERAL
# ==========================================================
#
# GET /inventario/resumen
#
# Devuelve:
# - Materiales en bodega
# - Materiales instalados
# - Cantidades por estado
# - Total disponible
# - Total general
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
# CONSULTAR EXISTENCIAS
# ==========================================================
#
# GET /inventario/stock
#
# Filtros opcionales:
# - material
# - ubicacion
# - colmena_id
# ==========================================================

@router.get(
    "/stock",
    response_model=list[InventarioStockResponse],
)
def listar_stock_inventario(
    material: MaterialInventario | None = Query(
        default=None
    ),
    ubicacion: UbicacionInventario | None = Query(
        default=None
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
# HISTORIAL DE MOVIMIENTOS
# ==========================================================
#
# GET /inventario/movimientos
#
# Muestra los movimientos mas recientes.
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
# CONSULTAR INCIDENCIAS
# ==========================================================
#
# GET /inventario/incidencias
#
# Permite consultar materiales danados, rotos,
# pendientes, en reparacion y reparados.
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
# CONSULTAR UNA INCIDENCIA POR ID
# ==========================================================
#
# GET /inventario/incidencias/{incidencia_id}
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
