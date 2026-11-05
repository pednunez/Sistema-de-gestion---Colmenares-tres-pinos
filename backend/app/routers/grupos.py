from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import requerir_admin
from app.database import get_db
from app.models.grupo import GrupoColmena
from app.models.usuario import Usuario
from app.schemas.auditoria import AuditoriaCreate
from app.schemas.grupo import (
    GrupoAsignacionResponse,
    GrupoColmenaItem,
    GrupoColmenasAsignar,
    GrupoCreate,
    GrupoDetalleResponse,
    GrupoResponse,
    GrupoUpdate,
)
from app.services import auditoria as auditoria_service
from app.services import grupo as grupo_service


# ==========================================================
# GRUPOS O FILAS DE COLMENAS (PB-06 / S2-T01)
# ==========================================================
#
# GET    /grupos/                      ADMIN y APICULTOR
# GET    /grupos/{id}                  ADMIN y APICULTOR
# GET    /grupos/{id}/historial        ADMIN y APICULTOR
# POST   /grupos/                      ADMIN
# PATCH  /grupos/{id}                  ADMIN
# POST   /grupos/{id}/colmenas         ADMIN (asignar o reasignar)
# DELETE /grupos/{id}/colmenas/{cid}   ADMIN (retirar del grupo)
# DELETE /grupos/{id}                  ADMIN (baja logica)
#
# La sesion se exige al registrar el router en main.py.
# ==========================================================

router = APIRouter(
    prefix="/grupos",
    tags=["Grupos de colmenas"]
)

NOMBRE_DUPLICADO = "Ya existe un grupo activo con ese nombre en el apiario"


def grupo_a_dict(grupo: GrupoColmena) -> dict:
    return {
        "id": grupo.id,
        "apiario_id": grupo.apiario_id,
        "nombre": grupo.nombre,
        "descripcion": grupo.descripcion,
        "activo": grupo.activo,
    }


def respuesta_grupo(grupo: GrupoColmena, cantidad: int) -> GrupoResponse:
    return GrupoResponse.model_validate(grupo).model_copy(
        update={"cantidad_colmenas": cantidad}
    )


def respuesta_detalle(db: Session, grupo: GrupoColmena) -> GrupoDetalleResponse:
    colmenas = [
        GrupoColmenaItem(
            colmena_id=colmena.id,
            codigo=colmena.codigo,
            estado=colmena.estado,
            fecha_asignacion=fecha,
        )
        for colmena, fecha in grupo_service.colmenas_del_grupo(db, grupo.id)
    ]

    return GrupoDetalleResponse.model_validate(grupo).model_copy(
        update={"colmenas": colmenas, "cantidad_colmenas": len(colmenas)}
    )


def obtener_o_404(db: Session, grupo_id: int, incluir_inactivos: bool = False):
    grupo = grupo_service.obtener_grupo(db, grupo_id, incluir_inactivos)

    if grupo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grupo no encontrado"
        )

    return grupo


def confirmar(db: Session, usuario_id: int, grupo: GrupoColmena,
              accion: str, anteriores: dict | None, nuevos: dict) -> None:
    """Registra la auditoria y confirma todo en una sola transaccion."""

    auditoria_service.registrar_auditoria(
        db,
        AuditoriaCreate(
            usuario_id=usuario_id,
            entidad="GRUPO_COLMENAS",
            entidad_id=grupo.id,
            accion=accion,
            datos_anteriores=anteriores,
            datos_nuevos=nuevos,
        ),
        commit=False,
    )

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        if getattr(error.orig, "sqlstate", None) != "23505":
            raise
        # Carrera con otra solicitud que uso el mismo nombre o colmena.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El grupo o la asignación cambió mientras se guardaba. Intenta de nuevo."
        ) from error

    db.refresh(grupo)


# ==========================================================
# CONSULTAS
# ==========================================================

@router.get("/", response_model=list[GrupoResponse])
def listar_grupos(
    db: Session = Depends(get_db),
    apiario_id: int | None = Query(default=None, gt=0),
    incluir_inactivos: bool = Query(default=False),
):
    grupos = grupo_service.listar_grupos(db, apiario_id, incluir_inactivos)
    cantidades = grupo_service.contar_colmenas(db, [g.id for g in grupos])

    return [respuesta_grupo(g, cantidades.get(g.id, 0)) for g in grupos]


@router.get("/{grupo_id}", response_model=GrupoDetalleResponse)
def obtener_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
):
    # Un grupo dado de baja se puede consultar: conserva su historial.
    grupo = obtener_o_404(db, grupo_id, incluir_inactivos=True)

    return respuesta_detalle(db, grupo)


@router.get("/{grupo_id}/historial", response_model=list[GrupoAsignacionResponse])
def historial_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
):
    obtener_o_404(db, grupo_id, incluir_inactivos=True)

    return [
        GrupoAsignacionResponse(
            colmena_id=asignacion.colmena_id,
            codigo=codigo,
            usuario_id=asignacion.usuario_id,
            fecha_asignacion=asignacion.fecha_asignacion,
            fecha_retiro=asignacion.fecha_retiro,
        )
        for asignacion, codigo in grupo_service.historial_del_grupo(db, grupo_id)
    ]


# ==========================================================
# ESCRITURA (SOLO ADMIN)
# ==========================================================

@router.post(
    "/",
    response_model=GrupoDetalleResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_grupo(
    datos: GrupoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin),
):
    if grupo_service.obtener_apiario_activo(db, datos.apiario_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El apiario indicado no existe o está inactivo"
        )

    if grupo_service.nombre_en_uso(db, datos.apiario_id, datos.nombre):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=NOMBRE_DUPLICADO
        )

    grupo = grupo_service.crear_grupo(db, datos)
    confirmar(db, usuario.id, grupo, "CREAR", None, grupo_a_dict(grupo))

    return respuesta_detalle(db, grupo)


@router.patch("/{grupo_id}", response_model=GrupoDetalleResponse)
def actualizar_grupo(
    grupo_id: int,
    datos: GrupoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin),
):
    grupo = obtener_o_404(db, grupo_id)
    anteriores = grupo_a_dict(grupo)

    if datos.nombre is not None and grupo_service.nombre_en_uso(
        db, grupo.apiario_id, datos.nombre, excluir_id=grupo.id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=NOMBRE_DUPLICADO
        )

    grupo_service.actualizar_grupo(db, grupo, datos)
    confirmar(db, usuario.id, grupo, "MODIFICAR", anteriores, grupo_a_dict(grupo))

    return respuesta_detalle(db, grupo)


@router.post("/{grupo_id}/colmenas", response_model=GrupoDetalleResponse)
def asignar_colmenas(
    grupo_id: int,
    datos: GrupoColmenasAsignar,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin),
):
    grupo = obtener_o_404(db, grupo_id)

    invalidas = grupo_service.colmenas_no_asignables(db, grupo, datos.colmena_ids)

    if invalidas:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Solo se pueden asignar colmenas activas del mismo apiario. "
                f"No asignables: {', '.join(map(str, invalidas))}."
            )
        )

    resultado = grupo_service.asignar_colmenas(db, grupo, datos.colmena_ids, usuario.id)

    if resultado["asignadas"] or resultado["reasignadas"]:
        confirmar(
            db, usuario.id, grupo, "MODIFICAR", None,
            {"operacion": "ASIGNAR_COLMENAS", **resultado},
        )

    return respuesta_detalle(db, grupo)


@router.delete("/{grupo_id}/colmenas/{colmena_id}", response_model=GrupoDetalleResponse)
def retirar_colmena(
    grupo_id: int,
    colmena_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin),
):
    grupo = obtener_o_404(db, grupo_id)

    if grupo_service.retirar_colmena(db, grupo, colmena_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La colmena no está asignada a este grupo"
        )

    confirmar(
        db, usuario.id, grupo, "MODIFICAR", None,
        {"operacion": "RETIRAR_COLMENA", "colmena_id": colmena_id},
    )

    return respuesta_detalle(db, grupo)


@router.delete("/{grupo_id}", response_model=GrupoDetalleResponse)
def desactivar_grupo(
    grupo_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(requerir_admin),
):
    grupo = obtener_o_404(db, grupo_id)
    anteriores = grupo_a_dict(grupo)

    liberadas = grupo_service.desactivar_grupo(db, grupo)
    confirmar(
        db, usuario.id, grupo, "ELIMINAR", anteriores,
        {**grupo_a_dict(grupo), "colmenas_liberadas": liberadas},
    )

    return respuesta_detalle(db, grupo)
