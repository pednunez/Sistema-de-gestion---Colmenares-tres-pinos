from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import requerir_admin
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.auditoria import AuditoriaResponse
from app.services import auditoria as auditoria_service


router = APIRouter(
    prefix="/auditoria",
    tags=["Auditoría"]
)


# ==========================================================
# LISTAR REGISTROS DE AUDITORÍA
# SOLO ADMIN
# ==========================================================

@router.get(
    "/",
    response_model=list[AuditoriaResponse]
)
def listar_auditoria(
    response: Response,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin),
    entidad: str | None = Query(default=None, min_length=1, max_length=100),
    accion: str | None = Query(default=None, min_length=1, max_length=20),
    usuario_id: int | None = Query(default=None, gt=0),
    desde: date | None = Query(default=None, ge=date(2, 1, 1), lt=date.max),
    hasta: date | None = Query(default=None, ge=date(2, 1, 1), lt=date.max),
    offset: int = Query(default=0, ge=0),
    limit: int | None = Query(default=None, ge=1, le=500),
):
    if desde is not None and hasta is not None and desde > hasta:
        raise HTTPException(status_code=422, detail="Desde no puede ser posterior a hasta")
    registros, total = auditoria_service.listar_auditoria(
        db, entidad=entidad, accion=accion, usuario_id=usuario_id,
        desde=desde, hasta=hasta, offset=offset, limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return registros


# ==========================================================
# OBTENER REGISTRO DE AUDITORÍA POR ID
# SOLO ADMIN
# ==========================================================

@router.get(
    "/{auditoria_id}",
    response_model=AuditoriaResponse
)
def obtener_auditoria(
    auditoria_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    registro = auditoria_service.obtener_auditoria(
        db,
        auditoria_id
    )

    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Registro de auditoría no encontrado"
        )

    return registro
