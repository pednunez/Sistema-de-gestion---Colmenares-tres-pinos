
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.inventario_stock import InventarioStock
from app.models.inventario_movimiento import InventarioMovimiento
from app.models.inventario_incidencia import InventarioIncidencia


# ==========================================================
# SERVICIO DE INVENTARIO GENERAL
# COLMENARES TRES PINOS
# ==========================================================
#
# Este servicio consulta el inventario y calcula
# los totales por material, ubicacion y condicion.
#
# IMPORTANTE:
# Los materiales instalados deben registrarse en
# inventario_stock antes de incluirlos en el total.
#
# No sumamos colmenas.cantidad_marcos por separado
# porque eso podria duplicar los marcos instalados.
# ==========================================================


MATERIALES = (
    "MARCO",
    "ALZA",
    "CAJON",
    "TAPA",
    "TECHO_LATA",
    "TECHO_AMERICANO",
)

ESTADOS = {
    "BUENO": "bueno",
    "DANADO": "danado",
    "ROTO": "roto",
    "EN_REPARACION": "en_reparacion",
    "REPARADO": "reparado",
}


# ==========================================================
# CONSULTAR STOCK
# ==========================================================

def listar_stock(
    db: Session,
    material: str | None = None,
    ubicacion: str | None = None,
    colmena_id: int | None = None,
):
    consulta = select(InventarioStock)

    if material is not None:
        consulta = consulta.where(
            InventarioStock.material == material
        )

    if ubicacion is not None:
        consulta = consulta.where(
            InventarioStock.ubicacion == ubicacion
        )

    if colmena_id is not None:
        consulta = consulta.where(
            InventarioStock.colmena_id == colmena_id
        )

    consulta = consulta.order_by(
        InventarioStock.material,
        InventarioStock.ubicacion,
        InventarioStock.colmena_id,
        InventarioStock.estado,
    )

    return db.scalars(consulta).all()


# ==========================================================
# RESUMEN GENERAL DEL INVENTARIO
# ==========================================================

def obtener_resumen(db: Session):

    # Crear una entrada por cada tipo de material.
    # Asi el frontend recibe los seis materiales
    # incluso si todavia no existe stock registrado.

    resumen = {}

    for material in MATERIALES:
        resumen[material] = {
            "material": material,
            "bodega": 0,
            "instalado": 0,
            "bueno": 0,
            "danado": 0,
            "roto": 0,
            "en_reparacion": 0,
            "reparado": 0,
            "disponibles": 0,
            "total": 0,
        }

    # Sumar cantidades agrupadas directamente
    # en PostgreSQL para evitar traer cada fila.

    consulta = (
        select(
            InventarioStock.material,
            InventarioStock.ubicacion,
            InventarioStock.estado,
            func.sum(
                InventarioStock.cantidad
            ).label("cantidad"),
        )
        .group_by(
            InventarioStock.material,
            InventarioStock.ubicacion,
            InventarioStock.estado,
        )
    )

    resultados = db.execute(consulta).all()

    for material, ubicacion, estado, cantidad in resultados:

        cantidad = int(cantidad)

        fila = resumen[material]

        if ubicacion == "BODEGA":
            fila["bodega"] += cantidad

        elif ubicacion == "INSTALADO":
            fila["instalado"] += cantidad

        campo_estado = ESTADOS[estado]
        fila[campo_estado] += cantidad

    # Calcular el total de cada material.
    # REPARADO representa una condicion actual
    # y cuenta como disponible.
    #
    # Un mismo material no se cuenta dos veces.

    for fila in resumen.values():

        fila["disponibles"] = (
            fila["bueno"]
            + fila["reparado"]
        )

        fila["total"] = (
            fila["bodega"]
            + fila["instalado"]
        )

    materiales = list(resumen.values())

    return {
        "materiales": materiales,

        "total_bodega": sum(
            fila["bodega"]
            for fila in materiales
        ),

        "total_instalado": sum(
            fila["instalado"]
            for fila in materiales
        ),

        "total_disponible": sum(
            fila["disponibles"]
            for fila in materiales
        ),

        "total_general": sum(
            fila["total"]
            for fila in materiales
        ),
    }


# ==========================================================
# HISTORIAL DE MOVIMIENTOS
# ==========================================================

def listar_movimientos(
    db: Session,
    limit: int = 100,
):

    consulta = (
        select(InventarioMovimiento)
        .order_by(
            InventarioMovimiento.fecha_creacion.desc(),
            InventarioMovimiento.id.desc(),
        )
        .limit(limit)
    )

    return db.scalars(consulta).all()


# ==========================================================
# CONSULTAR INCIDENCIAS Y REPARACIONES
# ==========================================================

def listar_incidencias(
    db: Session,
    limit: int = 100,
):

    consulta = (
        select(InventarioIncidencia)
        .order_by(
            InventarioIncidencia.fecha_deteccion.desc(),
            InventarioIncidencia.id.desc(),
        )
        .limit(limit)
    )

    return db.scalars(consulta).all()


# ==========================================================
# CONSULTAR UNA INCIDENCIA POR IDENTIFICADOR
# ==========================================================

def obtener_incidencia(
    db: Session,
    incidencia_id: int,
):

    consulta = select(InventarioIncidencia).where(
        InventarioIncidencia.id == incidencia_id
    )

    return db.scalar(consulta)
