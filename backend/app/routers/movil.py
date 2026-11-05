from datetime import datetime, timezone
from typing import get_args

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion
from app.models.tratamiento import Tratamiento
from app.models.usuario import Usuario
from app.schemas.inspeccion import ContenidoMarco, Nivel, UbicacionMarco
from app.schemas.movil import (
    ApiarioCatalogo,
    CatalogoMovilResponse,
    ColmenaCatalogo,
    GrupoCatalogo,
    OpcionesCatalogo,
    TratamientoCatalogo,
    UsuarioCatalogo,
)
from app.schemas.tratamiento import EstadoTratamiento


# ==========================================================
# APP MOVIL (S2-T31)
# ==========================================================
#
# GET /movil/catalogo   ADMIN y APICULTOR
#
# Una sola descarga para trabajar sin senal. Solo incluye
# registros activos: apiarios y colmenas sin baja logica,
# grupos activos y tratamientos EN_CURSO.
# ==========================================================

router = APIRouter(
    prefix="/movil",
    tags=["App móvil"]
)

# Escala vigente (H005-E4). BUENO, REGULAR y CRITICO solo se
# aceptan para leer inspecciones antiguas: no se ofrecen.
ESTADOS_GENERALES_VIGENTES = [
    "COMPLETA",
    "EN_DESARROLLO",
    "DONANTE",
    "DEBIL",
    "REQUIERE_REVISION",
]

# Escala de miel que usa el frontend web (campo miel).
NIVELES_MIEL = ["SIN_MIEL", "POCA", "MEDIA", "ABUNDANTE"]


@router.get("/catalogo", response_model=CatalogoMovilResponse)
def obtener_catalogo(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    apiarios = db.scalars(
        select(Apiario)
        .where(Apiario.activo == True)
        .order_by(Apiario.nombre, Apiario.id)
    ).all()

    colmenas = db.scalars(
        select(Colmena)
        .where(Colmena.activo == True)
        .order_by(Colmena.codigo, Colmena.id)
    ).all()

    grupos = db.scalars(
        select(GrupoColmena)
        .where(GrupoColmena.activo == True)
        .order_by(GrupoColmena.apiario_id, GrupoColmena.nombre)
    ).all()

    miembros: dict[int, list[int]] = {grupo.id: [] for grupo in grupos}

    if grupos:
        filas = db.execute(
            select(GrupoColmenaAsignacion.grupo_id, Colmena.id)
            .join(Colmena, Colmena.id == GrupoColmenaAsignacion.colmena_id)
            .where(
                GrupoColmenaAsignacion.grupo_id.in_(list(miembros)),
                GrupoColmenaAsignacion.fecha_retiro.is_(None),
                Colmena.activo == True,
            )
            .order_by(Colmena.codigo, Colmena.id)
        ).all()

        for grupo_id, colmena_id in filas:
            miembros[grupo_id].append(colmena_id)

    tratamientos = db.scalars(
        select(Tratamiento)
        .where(Tratamiento.estado == "EN_CURSO")
        .order_by(Tratamiento.colmena_id, Tratamiento.fecha_inicio)
    ).all()

    return CatalogoMovilResponse(
        generado_en=datetime.now(timezone.utc),
        usuario=UsuarioCatalogo(id=usuario.id, nombre=usuario.nombre, rol=usuario.rol),
        apiarios=[
            ApiarioCatalogo(id=a.id, nombre=a.nombre, ubicacion=a.ubicacion)
            for a in apiarios
        ],
        colmenas=[
            ColmenaCatalogo(
                id=c.id,
                codigo=c.codigo,
                codigo_qr=c.codigo_qr,
                apiario_id=c.apiario_id,
                estado=c.estado,
                cantidad_marcos=c.cantidad_marcos,
            )
            for c in colmenas
        ],
        grupos=[
            GrupoCatalogo(
                id=g.id,
                apiario_id=g.apiario_id,
                nombre=g.nombre,
                colmena_ids=miembros[g.id],
            )
            for g in grupos
        ],
        tratamientos_en_curso=[
            TratamientoCatalogo(
                id=t.id,
                colmena_id=t.colmena_id,
                tipo_tratamiento=t.tipo_tratamiento,
                producto=t.producto,
                dosis=t.dosis,
                fecha_inicio=t.fecha_inicio,
            )
            for t in tratamientos
        ],
        opciones=OpcionesCatalogo(
            estado_general=ESTADOS_GENERALES_VIGENTES,
            nivel=list(get_args(Nivel)),
            nivel_miel=NIVELES_MIEL,
            contenido_marco=list(get_args(ContenidoMarco)),
            ubicacion_marco=list(get_args(UbicacionMarco)),
            estado_tratamiento=list(get_args(EstadoTratamiento)),
        ),
    )
