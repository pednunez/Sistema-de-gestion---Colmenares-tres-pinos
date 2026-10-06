from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.dependencies import obtener_usuario_actual, requerir_admin
from app.database import probar_conexion, settings

from app.routers.apiarios import router as apiarios_router
from app.routers.colmenas import router as colmenas_router
from app.routers.usuarios import router as usuarios_router
from app.routers.inspecciones import router as inspecciones_router
from app.routers.tratamientos import router as tratamientos_router
from app.routers.transferencias_marcos import (
    router as transferencias_marcos_router
)
from app.routers.historial import router as historial_router
from app.routers.auditoria import router as auditoria_router
from app.routers.auth import router as auth_router


app = FastAPI(
    title="API Colmenares Tres Pinos",
    description="API para el control operativo y trazabilidad de colmenas",
    version="1.0.0"
)


# ==========================================================
# CORS
# ==========================================================

app.add_middleware(CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================================
# ROUTERS
# ==========================================================

app.include_router(auth_router)

app.include_router(
    apiarios_router,
    dependencies=[Depends(obtener_usuario_actual)]
)
app.include_router(
    colmenas_router,
    dependencies=[Depends(obtener_usuario_actual)]
)
app.include_router(usuarios_router)
app.include_router(
    inspecciones_router,
    dependencies=[Depends(obtener_usuario_actual)]
)
app.include_router(
    tratamientos_router,
    dependencies=[Depends(obtener_usuario_actual)]
)
app.include_router(
    transferencias_marcos_router,
    dependencies=[Depends(obtener_usuario_actual)]
)
app.include_router(
    historial_router,
    dependencies=[Depends(obtener_usuario_actual)]
)
app.include_router(auditoria_router)


# ==========================================================
# RUTA PRINCIPAL
# ==========================================================

@app.get("/")
def inicio():
    return {
        "mensaje": "Sistema Colmenares Tres Pinos funcionando"
    }


# ==========================================================
# PRUEBA DE CONEXIÓN A POSTGRESQL
# ==========================================================

@app.get("/database", dependencies=[Depends(requerir_admin)])
def comprobar_database():
    version = probar_conexion()

    return {
        "estado": "Conexion exitosa",
        "postgresql": version
    }

@app.get("/health", tags=["Estado"])
def health():
    """Comprueba disponibilidad de la API sin exponer datos del servidor."""
    return {"status": "ok"}
