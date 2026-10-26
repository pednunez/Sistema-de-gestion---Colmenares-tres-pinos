from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.apiario import Apiario
from app.models.colmena import Colmena
from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion
from app.schemas.grupo import GrupoCreate, GrupoUpdate


# ==========================================================
# SERVICIO DE GRUPOS O FILAS DE COLMENAS (PB-06)
# ==========================================================
#
# Las funciones de escritura no hacen commit: el router
# confirma junto con la auditoria en una sola transaccion.
# ==========================================================

ESTADOS_NO_OPERATIVOS = ("INACTIVA", "BAJA")


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def obtener_apiario_activo(db: Session, apiario_id: int) -> Apiario | None:
    return db.scalar(
        select(Apiario).where(
            Apiario.id == apiario_id,
            Apiario.activo == True,
        )
    )


def obtener_grupo(
    db: Session,
    grupo_id: int,
    incluir_inactivos: bool = False,
) -> GrupoColmena | None:

    consulta = select(GrupoColmena).where(GrupoColmena.id == grupo_id)

    if not incluir_inactivos:
        consulta = consulta.where(GrupoColmena.activo == True)

    return db.scalar(consulta)


def nombre_en_uso(
    db: Session,
    apiario_id: int,
    nombre: str,
    excluir_id: int | None = None,
) -> bool:
    """Compara sin distinguir mayusculas, solo entre grupos activos."""

    consulta = select(GrupoColmena.id).where(
        GrupoColmena.apiario_id == apiario_id,
        GrupoColmena.activo == True,
        func.lower(GrupoColmena.nombre) == nombre.lower(),
    )

    if excluir_id is not None:
        consulta = consulta.where(GrupoColmena.id != excluir_id)

    return db.scalar(consulta) is not None


def contar_colmenas(db: Session, grupo_ids: list[int]) -> dict[int, int]:

    if not grupo_ids:
        return {}

    filas = db.execute(
        select(
            GrupoColmenaAsignacion.grupo_id,
            func.count(),
        )
        .where(
            GrupoColmenaAsignacion.grupo_id.in_(grupo_ids),
            GrupoColmenaAsignacion.fecha_retiro.is_(None),
        )
        .group_by(GrupoColmenaAsignacion.grupo_id)
    ).all()

    return {grupo_id: cantidad for grupo_id, cantidad in filas}


def listar_grupos(
    db: Session,
    apiario_id: int | None = None,
    incluir_inactivos: bool = False,
) -> list[GrupoColmena]:

    consulta = select(GrupoColmena).order_by(
        GrupoColmena.apiario_id,
        func.lower(GrupoColmena.nombre),
        GrupoColmena.id,
    )

    if apiario_id is not None:
        consulta = consulta.where(GrupoColmena.apiario_id == apiario_id)

    if not incluir_inactivos:
        consulta = consulta.where(GrupoColmena.activo == True)

    return db.scalars(consulta).all()


def colmenas_del_grupo(db: Session, grupo_id: int):
    """Colmenas asignadas actualmente, ordenadas por codigo."""

    return db.execute(
        select(Colmena, GrupoColmenaAsignacion.fecha_asignacion)
        .join(
            GrupoColmenaAsignacion,
            GrupoColmenaAsignacion.colmena_id == Colmena.id,
        )
        .where(
            GrupoColmenaAsignacion.grupo_id == grupo_id,
            GrupoColmenaAsignacion.fecha_retiro.is_(None),
        )
        .order_by(Colmena.codigo, Colmena.id)
    ).all()


def historial_del_grupo(db: Session, grupo_id: int):
    """Todas las asignaciones, vigentes y cerradas, de la mas reciente."""

    return db.execute(
        select(GrupoColmenaAsignacion, Colmena.codigo)
        .join(Colmena, Colmena.id == GrupoColmenaAsignacion.colmena_id)
        .where(GrupoColmenaAsignacion.grupo_id == grupo_id)
        .order_by(
            GrupoColmenaAsignacion.fecha_asignacion.desc(),
            GrupoColmenaAsignacion.id.desc(),
        )
    ).all()


def crear_grupo(db: Session, datos: GrupoCreate) -> GrupoColmena:

    grupo = GrupoColmena(
        apiario_id=datos.apiario_id,
        nombre=datos.nombre,
        descripcion=datos.descripcion,
    )

    db.add(grupo)
    db.flush()

    return grupo


def actualizar_grupo(
    db: Session,
    grupo: GrupoColmena,
    datos: GrupoUpdate,
) -> GrupoColmena:

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(grupo, campo, valor)

    grupo.fecha_actualizacion = ahora()
    db.flush()

    return grupo


def desactivar_grupo(db: Session, grupo: GrupoColmena) -> list[int]:
    """Baja logica. Cierra las asignaciones vigentes y las devuelve."""

    momento = ahora()

    vigentes = db.scalars(
        select(GrupoColmenaAsignacion).where(
            GrupoColmenaAsignacion.grupo_id == grupo.id,
            GrupoColmenaAsignacion.fecha_retiro.is_(None),
        )
    ).all()

    for asignacion in vigentes:
        asignacion.fecha_retiro = momento

    grupo.activo = False
    grupo.fecha_eliminacion = momento
    grupo.fecha_actualizacion = momento
    db.flush()

    return [asignacion.colmena_id for asignacion in vigentes]


def colmenas_no_asignables(
    db: Session,
    grupo: GrupoColmena,
    colmena_ids: list[int],
) -> list[int]:
    """Ids que no existen, estan dados de baja, no estan operativos
    o pertenecen a otro apiario."""

    validas = set(
        db.scalars(
            select(Colmena.id).where(
                Colmena.id.in_(colmena_ids),
                Colmena.activo == True,
                Colmena.estado.not_in(ESTADOS_NO_OPERATIVOS),
                Colmena.apiario_id == grupo.apiario_id,
            )
        ).all()
    )

    return [colmena_id for colmena_id in colmena_ids if colmena_id not in validas]


def asignar_colmenas(
    db: Session,
    grupo: GrupoColmena,
    colmena_ids: list[int],
    usuario_id: int,
) -> dict[str, list]:
    """Asigna las colmenas al grupo. Si una estaba en otro grupo,
    cierra esa asignacion (reasignacion) y conserva el historial."""

    momento = ahora()

    vigentes = {
        asignacion.colmena_id: asignacion
        for asignacion in db.scalars(
            select(GrupoColmenaAsignacion)
            .where(
                GrupoColmenaAsignacion.colmena_id.in_(colmena_ids),
                GrupoColmenaAsignacion.fecha_retiro.is_(None),
            )
            .with_for_update()
        ).all()
    }

    resultado = {"asignadas": [], "reasignadas": [], "sin_cambios": []}

    for colmena_id in colmena_ids:

        actual = vigentes.get(colmena_id)

        if actual is not None and actual.grupo_id == grupo.id:
            resultado["sin_cambios"].append(colmena_id)
            continue

        if actual is not None:
            actual.fecha_retiro = momento
            resultado["reasignadas"].append(
                {"colmena_id": colmena_id, "grupo_anterior_id": actual.grupo_id}
            )
            # El indice de asignacion vigente exige cerrar antes de abrir.
            db.flush()
        else:
            resultado["asignadas"].append(colmena_id)

        db.add(
            GrupoColmenaAsignacion(
                grupo_id=grupo.id,
                colmena_id=colmena_id,
                usuario_id=usuario_id,
                fecha_asignacion=momento,
            )
        )

    grupo.fecha_actualizacion = momento
    db.flush()

    return resultado


def retirar_colmena(
    db: Session,
    grupo: GrupoColmena,
    colmena_id: int,
) -> GrupoColmenaAsignacion | None:

    asignacion = db.scalar(
        select(GrupoColmenaAsignacion).where(
            GrupoColmenaAsignacion.grupo_id == grupo.id,
            GrupoColmenaAsignacion.colmena_id == colmena_id,
            GrupoColmenaAsignacion.fecha_retiro.is_(None),
        )
    )

    if asignacion is None:
        return None

    momento = ahora()
    asignacion.fecha_retiro = momento
    grupo.fecha_actualizacion = momento
    db.flush()

    return asignacion
