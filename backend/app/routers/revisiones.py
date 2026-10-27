from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual, verificar_autor_o_admin
from app.database import get_db
from app.models.revision import SesionRevision
from app.models.usuario import Usuario
from app.schemas.auditoria import AuditoriaCreate
from app.schemas.revision import (
    EstadoSesion,
    OmitirColmena,
    SesionRevisionCreate,
    SesionRevisionResponse,
)
from app.services import auditoria as auditoria_service
from app.services import grupo as grupo_service
from app.services import revision as revision_service


# ==========================================================
# SESIONES DE REVISION POR GRUPO (D-07 / S2-T16)
# ==========================================================
#
# GET  /revisiones/                    ADMIN y APICULTOR
# GET  /revisiones/{id}                ADMIN y APICULTOR
# POST /revisiones/                    ADMIN y APICULTOR (iniciar)
# POST /revisiones/{id}/omitir         responsable o ADMIN
# POST /revisiones/{id}/finalizar      responsable o ADMIN
#
# "Guardar y siguiente" = POST /inspecciones/ con
# sesion_revision_id: la inspeccion se guarda y la colmena
# queda REVISADA en la misma transaccion.
#
# La sesion se exige al registrar el router en main.py.
# ==========================================================

router = APIRouter(
    prefix="/revisiones",
    tags=["Revisión por grupo"]
)


def obtener_o_404(db: Session, sesion_id: int) -> SesionRevision:
    sesion = revision_service.obtener_sesion(db, sesion_id)

    if sesion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sesión de revisión no encontrada"
        )

    return sesion


def exigir_en_curso(sesion: SesionRevision) -> None:
    if sesion.estado != "EN_CURSO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La sesión de revisión ya fue finalizada"
        )


def auditar(db: Session, usuario_id: int, sesion: SesionRevision,
            accion: str, datos: dict) -> None:
    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_id,
            entidad="SESION_REVISION",
            entidad_id=sesion.id,
            accion=accion,
            datos_anteriores=None,
            datos_nuevos=datos,
        ),
        commit=False,
    )


@router.get("/", response_model=list[SesionRevisionResponse])
def listar_sesiones(
    db: Session = Depends(get_db),
    grupo_id: int | None = Query(default=None, gt=0),
    estado: EstadoSesion | None = Query(default=None),
):
    return [
        revision_service.detalle(db, sesion)
        for sesion in revision_service.listar_sesiones(db, grupo_id, estado)
    ]


@router.get("/{sesion_id}", response_model=SesionRevisionResponse)
def obtener_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
):
    return revision_service.detalle(db, obtener_o_404(db, sesion_id))


@router.post(
    "/",
    response_model=SesionRevisionResponse,
    status_code=status.HTTP_201_CREATED,
)
def iniciar_sesion(
    datos: SesionRevisionCreate,
    response: Response,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    # Reintento de la app: misma sesion.
    if datos.id_cliente is not None:
        existente = revision_service.obtener_por_id_cliente(db, datos.id_cliente)

        if existente is not None:
            if existente.usuario_id != usuario.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El id_cliente ya fue usado por otro usuario"
                )
            response.status_code = status.HTTP_200_OK
            return revision_service.detalle(db, existente)

    grupo = grupo_service.obtener_grupo(db, datos.grupo_id)

    if grupo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grupo no encontrado"
        )

    en_curso = revision_service.sesion_en_curso_del_grupo(db, grupo.id)

    if en_curso is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El grupo ya tiene una revisión en curso (sesión {en_curso.id}). "
                "Continúala o finalízala antes de iniciar otra."
            )
        )

    try:
        sesion = revision_service.crear_sesion(db, grupo, usuario.id, datos.id_cliente)
    except ValueError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error)
        ) from error

    auditar(db, usuario.id, sesion, "CREAR", {"grupo_id": grupo.id, "estado": "EN_CURSO"})

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existente = (
            revision_service.obtener_por_id_cliente(db, datos.id_cliente)
            if datos.id_cliente is not None
            else None
        )
        if existente is None or existente.usuario_id != usuario.id:
            raise
        response.status_code = status.HTTP_200_OK
        return revision_service.detalle(db, existente)

    return revision_service.detalle(db, sesion)


@router.post("/{sesion_id}/omitir", response_model=SesionRevisionResponse)
def omitir_colmena(
    sesion_id: int,
    datos: OmitirColmena,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    sesion = obtener_o_404(db, sesion_id)
    verificar_autor_o_admin(usuario, sesion.usuario_id)
    exigir_en_curso(sesion)

    fila = revision_service.fila_de_colmena(db, sesion.id, datos.colmena_id)

    if fila is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La colmena no forma parte de esta sesión"
        )

    if fila.estado == "REVISADA":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La colmena ya fue revisada en esta sesión"
        )

    revision_service.omitir(db, fila, datos.motivo)
    auditar(db, usuario.id, sesion, "MODIFICAR",
            {"operacion": "OMITIR", "colmena_id": datos.colmena_id, "motivo": fila.motivo_omision})
    db.commit()

    return revision_service.detalle(db, sesion)


@router.post("/{sesion_id}/finalizar", response_model=SesionRevisionResponse)
def finalizar_sesion(
    sesion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    sesion = obtener_o_404(db, sesion_id)
    verificar_autor_o_admin(usuario, sesion.usuario_id)
    exigir_en_curso(sesion)

    revision_service.finalizar(db, sesion)
    resumen = revision_service.detalle(db, sesion)
    auditar(db, usuario.id, sesion, "MODIFICAR",
            {"operacion": "FINALIZAR", **resumen.progreso.model_dump()})
    db.commit()

    return revision_service.detalle(db, sesion)
