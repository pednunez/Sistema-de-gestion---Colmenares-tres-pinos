"""S3-T06: estado actual, historico seguro y escritura de posiciones.

Las escrituras no hacen COMMIT. El servicio llamador controla la transaccion.
No reconstruye estados historicos cuando falta informacion confiable.
"""

from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.colmena import Colmena
from app.models.colmena_marco_estado import ColmenaMarcoEstado
from app.models.inspeccion import Inspeccion
from app.models.transferencia_marco import TransferenciaMarco
from app.services.capacidad_marcos import EstadoColmena, _copiar_y_validar


def contar_marcos(estado: EstadoColmena) -> int:
    return sum(
        pos["contenido"] != "SIN_MARCO"
        for piso in (estado.camara_cria, estado.alza or [])
        for pos in piso
    )


def _leer_estado_actual(db: Session, colmena_id: int):
    """Devuelve (estado, existe_algun_registro).

    Nunca interpreta un estado parcialmente guardado como un estado valido.
    """
    filas = db.scalars(
        select(ColmenaMarcoEstado)
        .where(ColmenaMarcoEstado.colmena_id == colmena_id)
        .order_by(ColmenaMarcoEstado.ubicacion, ColmenaMarcoEstado.numero)
    ).all()
    if not filas:
        return None, False
    mapa = {"CAMARA_CRIA": {}, "ALZA": {}}
    for fila in filas:
        if (
            fila.ubicacion not in mapa
            or type(fila.numero) is not int
            or not 1 <= fila.numero <= 10
            or fila.numero in mapa[fila.ubicacion]
        ):
            return None, True
        mapa[fila.ubicacion][fila.numero] = fila.contenido
    if len(mapa["CAMARA_CRIA"]) != 10 or len(mapa["ALZA"]) not in (0, 10):
        return None, True
    try:
        estado = _copiar_y_validar(
            EstadoColmena(
                camara_cria=[
                    {"numero": n, "contenido": mapa["CAMARA_CRIA"][n]}
                    for n in range(1, 11)
                ],
                alza=(
                    [
                        {"numero": n, "contenido": mapa["ALZA"][n]}
                        for n in range(1, 11)
                    ]
                    if mapa["ALZA"] else None
                ),
            ),
            "colmena",
        )
    except (ValueError, KeyError):
        return None, True
    return estado, True


def _reconstruir_desde_ultima_inspeccion(db: Session, colmena: Colmena):
    """Solo usa una inspeccion con 10 posiciones por cada piso declarado.

    Si hubo otras transferencias posteriores, no se reconstruye el estado.
    """
    inspeccion = db.scalar(
        select(Inspeccion)
        .where(
            Inspeccion.colmena_id == colmena.id,
            Inspeccion.activo.is_(True),
            Inspeccion.marcos.any(),
        )
        .order_by(Inspeccion.fecha_creacion.desc(), Inspeccion.id.desc())
        .limit(1)
    )
    if inspeccion is None or inspeccion.tiene_alza is None:
        return None

    movimientos_posteriores = db.scalar(
        select(TransferenciaMarco.id)
        .where(
            or_(
                TransferenciaMarco.colmena_origen_id == colmena.id,
                TransferenciaMarco.colmena_destino_id == colmena.id,
            ),
            TransferenciaMarco.fecha_creacion >= inspeccion.fecha_creacion,
            or_(
                TransferenciaMarco.inspeccion_id.is_(None),
                TransferenciaMarco.inspeccion_id != inspeccion.id,
            ),
        )
        .limit(1)
    )
    if movimientos_posteriores is not None:
        return None

    pisos = {"CAMARA_CRIA": {}, "ALZA": {}}
    for marco in inspeccion.marcos:
        if (
            marco.ubicacion not in pisos
            or type(marco.numero) is not int
            or not 1 <= marco.numero <= 10
            or marco.numero in pisos[marco.ubicacion]
        ):
            return None
        contenido = marco.contenido
        if marco.retirar_a_bodega or marco.transferido_a_colmena_id is not None:
            contenido = "SIN_MARCO"
        pisos[marco.ubicacion][marco.numero] = contenido

    if len(pisos["CAMARA_CRIA"]) != 10:
        return None
    if inspeccion.tiene_alza and len(pisos["ALZA"]) != 10:
        return None
    if not inspeccion.tiene_alza and pisos["ALZA"]:
        return None
    try:
        return _copiar_y_validar(
            EstadoColmena(
                camara_cria=[
                    {"numero": n, "contenido": pisos["CAMARA_CRIA"][n]}
                    for n in range(1, 11)
                ],
                alza=(
                    [
                        {"numero": n, "contenido": pisos["ALZA"][n]}
                        for n in range(1, 11)
                    ] if inspeccion.tiene_alza else None
                ),
            ),
            "colmena",
        )
    except (KeyError, ValueError):
        return None


def obtener_marcos_colmena(db: Session, colmena_id: int):
    colmena = db.scalar(
        select(Colmena).where(
            Colmena.id == colmena_id,
            Colmena.activo.is_(True),
        )
    )
    if colmena is None:
        return None
    respuesta = {"colmena_id": colmena.id, "camara_cria": None, "alza": None}

    estado, registrado = _leer_estado_actual(db, colmena.id)
    if not registrado:
        estado = _reconstruir_desde_ultima_inspeccion(db, colmena)
    if estado is None or contar_marcos(estado) != colmena.cantidad_marcos:
        return respuesta

    respuesta["camara_cria"] = estado.camara_cria
    respuesta["alza"] = estado.alza
    return respuesta


def guardar_estado_actual(db: Session, colmena_id: int, estado: EstadoColmena):
    """Sobrescribe una fotografia coherente de las 10/20 posiciones.

    El llamador DEBE bloquear primero la fila de Colmena con FOR UPDATE.
    No modifica colmenas.cantidad_marcos y no ejecuta commit.
    """
    estado = _copiar_y_validar(estado, "colmena")
    filas = db.scalars(
        select(ColmenaMarcoEstado)
        .where(ColmenaMarcoEstado.colmena_id == colmena_id)
        .with_for_update()
    ).all()
    existentes = {(f.ubicacion, f.numero): f for f in filas}
    nuevas = {}
    ahora = datetime.now(timezone.utc)
    for ubicacion, piso in (
        ("CAMARA_CRIA", estado.camara_cria),
        ("ALZA", estado.alza or []),
    ):
        for posicion in piso:
            clave = (ubicacion, posicion["numero"])
            fila = existentes.get(clave)
            if fila is None:
                fila = ColmenaMarcoEstado(
                    colmena_id=colmena_id,
                    ubicacion=ubicacion,
                    numero=posicion["numero"],
                    contenido=posicion["contenido"],
                )
                db.add(fila)
            else:
                fila.contenido = posicion["contenido"]
                fila.fecha_actualizacion = ahora
            nuevas[clave] = fila
    for clave, fila in existentes.items():
        if clave not in nuevas:
            db.delete(fila)
    db.flush()
    return estado


def guardar_observacion_inspeccion(
    db: Session,
    colmena_id: int,
    marcos,
    tiene_alza: bool,
):
    """Inicia estado desde la inspeccion; retiros quedan como SIN_MARCO.

    Transferencias todavia no se descuentan: el servicio de transferencia
    debe moverlos despues, con capacidad y auditoria.
    """
    if not marcos:
        return
    pisos = {"CAMARA_CRIA": {}, "ALZA": {}}
    for marco in marcos:
        if marco.ubicacion not in pisos:
            raise ValueError("Ubicacion de marco desconocida")
        if marco.numero in pisos[marco.ubicacion]:
            raise ValueError("Posicion duplicada")
        contenido = "SIN_MARCO" if marco.retirar_a_bodega else marco.contenido
        pisos[marco.ubicacion][marco.numero] = contenido
    if len(pisos["CAMARA_CRIA"]) != 10:
        raise ValueError("La inspeccion necesita 10 posiciones en camara")
    if tiene_alza and len(pisos["ALZA"]) != 10:
        raise ValueError("La inspeccion necesita 10 posiciones en alza")
    if not tiene_alza and pisos["ALZA"]:
        raise ValueError("No hay alza registrada")
    estado = EstadoColmena(
        camara_cria=[
            {"numero": n, "contenido": pisos["CAMARA_CRIA"][n]}
            for n in range(1, 11)
        ],
        alza=(
            [{"numero": n, "contenido": pisos["ALZA"][n]} for n in range(1, 11)]
            if tiene_alza else None
        ),
    )
    return guardar_estado_actual(db, colmena_id, estado)
