from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.core.dependencies import requerir_admin
from app.database import get_db
from app.models.usuario import Usuario
from app.schemas.auditoria import AuditoriaCreate
from app.schemas.reporte import FiltrosReporte, TipoReporte
from app.services import auditoria, reportes
from app.services.exportacion_reportes import MIME, generar_archivo

router = APIRouter(prefix="/reportes", tags=["Reportes"])


@router.get("/{tipo}", response_class=Response,
            responses={200: {"description": "Archivo del reporte",
                             "content": {mime: {} for mime in MIME.values()}}})
def descargar_reporte(
    tipo: TipoReporte,
    filtros: Annotated[FiltrosReporte, Query()],
    db: Session = Depends(get_db),
    admin: Usuario = Depends(requerir_admin),
):
    try:
        filtros.validar_estado(tipo)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    columnas, filas = reportes.armar_reporte(db, tipo, filtros)
    archivo = generar_archivo(filtros.formato, reportes.TITULOS[tipo], columnas, filas)
    # Solo registrar después de generar el archivo; si falla auditoría no entregar una descarga sin registro.
    try:
        auditoria.registrar_auditoria(db, AuditoriaCreate(
            usuario_id=admin.id, entidad="REPORTE", accion="CREAR",
            datos_nuevos={"evento": "DESCARGA", "tipo": tipo, "filas": len(filas),
                          **filtros.model_dump(mode="json")},
        ))
    except Exception:
        db.rollback()
        raise
    return Response(archivo, media_type=MIME[filtros.formato], headers={
        "Content-Disposition": f'attachment; filename="reporte-{tipo}.{filtros.formato}"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    })
