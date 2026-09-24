from fastapi import APIRouter, Depends, HTTPException, status
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
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin)
):
    return auditoria_service.listar_auditoria(db)


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