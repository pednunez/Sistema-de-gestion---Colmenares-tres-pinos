
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.dependencies import (
    obtener_usuario_actual,
    requerir_admin,
)
from app.core.registro import (
    HEADER as CORRELATION_HEADER,
    CorrelationIdMiddleware,
    configurar_logging,
)
from app.database import probar_conexion, settings

configurar_logging()

# ==========================================================
# ROUTERS EXISTENTES
# ==========================================================

from app.routers.apiarios import router as apiarios_router
from app.routers.colmenas import router as colmenas_router
from app.routers.usuarios import router as usuarios_router
from app.routers.inspecciones import router as inspecciones_router
from app.routers.tratamientos import router as tratamientos_router

from app.routers.transferencias_marcos import (
    router as transferencias_marcos_router,
)

from app.routers.historial import router as historial_router
from app.routers.auditoria import router as auditoria_router
from app.routers.auth import router as auth_router

# ==========================================================
# INVENTARIO GENERAL
# ==========================================================

from app.routers.inventario import router as inventario_router

# ==========================================================
# STOCK DE BODEGA - FRONTEND DE PEDRO
# ==========================================================

from app.routers.stock import router as stock_router


# ==========================================================
# CONFIGURACION FASTAPI
# ==========================================================

app = FastAPI(
    title="API Colmenares Tres Pinos",
    description="API para el control operativo y trazabilidad de colmenas",
    version="1.0.0",
)


# ==========================================================
# CORS
# ==========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[CORRELATION_HEADER],
)


# ==========================================================
# CORRELATION ID Y LOG JSON POR PETICION (RNF-57)
# ==========================================================
#
# Se agrega despues de CORS para quedar por fuera: tambien
# registra y responde el ID en las peticiones OPTIONS.
# ==========================================================

app.add_middleware(CorrelationIdMiddleware)


# ==========================================================
# REGISTRAR ROUTERS EXISTENTES
# ==========================================================

app.include_router(auth_router)

app.include_router(
    apiarios_router,
    dependencies=[Depends(obtener_usuario_actual)],
)

app.include_router(
    colmenas_router,
    dependencies=[Depends(obtener_usuario_actual)],
)

app.include_router(usuarios_router)

app.include_router(
    inspecciones_router,
    dependencies=[Depends(obtener_usuario_actual)],
)

app.include_router(
    tratamientos_router,
    dependencies=[Depends(obtener_usuario_actual)],
)

app.include_router(
    transferencias_marcos_router,
    dependencies=[Depends(obtener_usuario_actual)],
)

app.include_router(
    historial_router,
    dependencies=[Depends(obtener_usuario_actual)],
)

app.include_router(auditoria_router)


# ==========================================================
# INVENTARIO GENERAL
# ==========================================================

app.include_router(inventario_router)


# ==========================================================
# STOCK DE BODEGA
# ==========================================================
#
# Contrato esperado por el frontend de Pedro:
#
# GET   /stock/
# POST  /stock/movimientos/
# GET   /stock/movimientos/
# PATCH /stock/{material}
#
# La autenticacion se encuentra definida
# dentro del propio router.
# ==========================================================

app.include_router(stock_router)


# ==========================================================
# RUTA PRINCIPAL
# ==========================================================

@app.get("/")
def inicio():
    return {
        "mensaje": "Sistema Colmenares Tres Pinos funcionando"
    }


# ==========================================================
# COMPROBAR CONEXION POSTGRESQL
# ==========================================================

@app.get(
    "/database",
    dependencies=[Depends(requerir_admin)],
)
def comprobar_database():
    version = probar_conexion()

    return {
        "estado": "Conexion exitosa",
        "postgresql": version,
    }


# ==========================================================
# ESTADO DEL BACKEND
# ==========================================================

@app.get("/health", tags=["Estado"])
def health():
    """Comprueba disponibilidad de la API."""
    return {
        "status": "ok"
    }
