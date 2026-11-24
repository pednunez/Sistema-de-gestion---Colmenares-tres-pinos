from datetime import datetime, timezone
from typing import get_args

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import obtener_usuario_actual
from app.database import get_db
from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion
from app.models.inspeccion import Inspeccion
from app.models.tratamiento import Tratamiento
from app.models.usuario import Usuario
from app.schemas.inspeccion import ContenidoMarco, Nivel, UbicacionMarco
from app.schemas.movil import (
    ApiarioCatalogo,
    CatalogoMovilResponse,
    ColmenaCatalogo,
    GrupoCatalogo,
    InspeccionResumenMovil,
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
    # Seleccionar solo las columnas que consume la app evita hidratar
    # objetos ORM completos para cientos de registros del catálogo.
    apiarios = db.execute(
        select(Apiario.id, Apiario.nombre, Apiario.ubicacion)
        .where(Apiario.activo.is_(True))
        .order_by(Apiario.nombre, Apiario.id)
    ).all()

    colmenas = db.execute(
        select(
            Colmena.id,
            Colmena.codigo,
            Colmena.codigo_qr,
            Colmena.apiario_id,
            Colmena.estado,
            Colmena.cantidad_marcos,
        )
        .where(Colmena.activo.is_(True))
        .order_by(Colmena.codigo, Colmena.id)
    ).all()

    grupos = db.execute(
        select(
            GrupoColmena.id,
            GrupoColmena.apiario_id,
            GrupoColmena.nombre,
        )
        .where(GrupoColmena.activo.is_(True))
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

    tratamientos = db.execute(
        select(
            Tratamiento.id,
            Tratamiento.colmena_id,
            Tratamiento.tipo_tratamiento,
            Tratamiento.producto,
            Tratamiento.dosis,
            Tratamiento.fecha_inicio,
        )
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


# ==========================================================
# RESUMEN LIVIANO DE INSPECCIONES PARA LA APP MÓVIL
# ==========================================================
#
# La pantalla Colmenas solo necesita la última inspección
# de cada colmena para calcular alertas y mostrar la fecha.
# Evita descargar todas las inspecciones y sus marcos
# cada vez que se abre el listado.
# ==========================================================

@router.get(
    "/inspecciones-resumen",
    response_model=list[InspeccionResumenMovil],
)
def obtener_inspecciones_resumen(
    ultimas_por_colmena: bool = False,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
):
    # Se devuelven solo columnas generales. El detalle de marcos se consulta
    # mediante GET /inspecciones/{id} cuando el usuario abre una inspección.
    columnas = (
        Inspeccion.id.label("id"),
        Inspeccion.colmena_id.label("colmena_id"),
        Inspeccion.usuario_id.label("usuario_id"),
        Inspeccion.id_cliente.label("id_cliente"),
        Inspeccion.fecha_inspeccion.label("fecha_inspeccion"),
        Inspeccion.estado_general.label("estado_general"),
        Inspeccion.reina_observada.label("reina_observada"),
        Inspeccion.presencia_cria.label("presencia_cria"),
        Inspeccion.postura.label("postura"),
        Inspeccion.nivel_poblacion.label("nivel_poblacion"),
        Inspeccion.reservas_alimento.label("reservas_alimento"),
        Inspeccion.cantidad_marcos.label("cantidad_marcos"),
        Inspeccion.tiene_alza.label("tiene_alza"),
        Inspeccion.miel.label("miel"),
        Inspeccion.alimentacion_suministrada.label("alimentacion_suministrada"),
        Inspeccion.signos_enfermedad.label("signos_enfermedad"),
        Inspeccion.enfermedad_observada.label("enfermedad_observada"),
        Inspeccion.tiras_medicamento.label("tiras_medicamento"),
        Inspeccion.observaciones.label("observaciones"),
    )

    if ultimas_por_colmena:
        subconsulta = (
            select(
                *columnas,
                func.row_number()
                .over(
                    partition_by=Inspeccion.colmena_id,
                    order_by=(
                        Inspeccion.fecha_inspeccion.desc(),
                        Inspeccion.id.desc(),
                    ),
                )
                .label("fila"),
            )
            .where(Inspeccion.activo.is_(True))
            .subquery()
        )

        filas = db.execute(
            select(
                *[
                    subconsulta.c[columna.name]
                    for columna in columnas
                ]
            )
            .where(subconsulta.c.fila == 1)
            .order_by(subconsulta.c.colmena_id)
        ).all()
    else:
        filas = db.execute(
            select(*columnas)
            .where(Inspeccion.activo.is_(True))
            .order_by(
                Inspeccion.fecha_inspeccion.desc(),
                Inspeccion.id.desc(),
            )
        ).all()

    return [
        InspeccionResumenMovil.model_validate(dict(fila._mapping))
        for fila in filas
    ]
