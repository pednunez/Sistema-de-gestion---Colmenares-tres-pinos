
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
# Este servicio permite:
#
# 1. Consultar existencias por material.
# 2. Filtrar por ubicacion y colmena.
# 3. Calcular el resumen general.
# 4. Consultar el historial de movimientos.
# 5. Consultar incidencias y reparaciones.
#
# IMPORTANTE:
#
# BODEGA e INSTALADO son ubicaciones diferentes.
#
# Cada pieza debe pertenecer a una sola ubicacion
# y a un solo estado.
#
# No sumamos colmenas.cantidad_marcos por separado,
# porque eso podria duplicar los materiales.
#
# ==========================================================


# ==========================================================
# CATALOGO GENERAL DE MATERIALES
# ==========================================================
#
# Conservamos los seis materiales anteriores.
# Incorporamos los cinco nuevos acordados con Pedro.
#
# Total: 11 identificadores.
#
# Este catalogo debe coincidir con:
#
# - app/models/inventario_stock.py
# - app/models/inventario_movimiento.py
# - app/models/inventario_incidencia.py
# - app/schemas/inventario.py
# - Migracion Alembic
#
# ==========================================================

MATERIALES = (
    "MARCO",
    "ALZA",
    "CAJON",
    "TAPA",
    "TECHO_LATA",
    "TECHO_AMERICANO",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "ENTRETAPA",
    "PISO",
)


# ==========================================================
# ESTADOS DEL INVENTARIO
# ==========================================================
#
# Los estados se utilizan para clasificar
# las cantidades de cada material.
#
# BUENO y REPARADO se consideran disponibles.
#
# DANADO, ROTO y EN_REPARACION no se consideran
# disponibles para uso inmediato.
#
# ==========================================================

ESTADOS = {
    "BUENO": "bueno",
    "DANADO": "danado",
    "ROTO": "roto",
    "EN_REPARACION": "en_reparacion",
    "REPARADO": "reparado",
}


# ==========================================================
# CONSULTAR EXISTENCIAS DEL INVENTARIO
# ==========================================================
#
# Permite consultar registros individuales de stock.
#
# Filtros opcionales:
#
# - material
# - ubicacion
# - colmena_id
#
# No modifica PostgreSQL.
#
# ==========================================================

def listar_stock(
    db: Session,
    material: str | None = None,
    ubicacion: str | None = None,
    colmena_id: int | None = None,
):

    consulta = select(InventarioStock)

    # ======================================================
    # FILTRO POR MATERIAL
    # ======================================================

    if material is not None:

        consulta = consulta.where(
            InventarioStock.material == material
        )

    # ======================================================
    # FILTRO POR UBICACION
    # ======================================================

    if ubicacion is not None:

        consulta = consulta.where(
            InventarioStock.ubicacion == ubicacion
        )

    # ======================================================
    # FILTRO POR COLMENA
    # ======================================================

    if colmena_id is not None:

        consulta = consulta.where(
            InventarioStock.colmena_id == colmena_id
        )

    # ======================================================
    # ORDENAR RESULTADOS
    # ======================================================

    consulta = consulta.order_by(
        InventarioStock.material,
        InventarioStock.ubicacion,
        InventarioStock.colmena_id,
        InventarioStock.estado,
    )

    return db.scalars(consulta).all()


# ==========================================================
# OBTENER RESUMEN GENERAL DEL INVENTARIO
# ==========================================================
#
# Devuelve los once materiales, incluso cuando
# todavia no existen cantidades registradas.
#
# Agrupa existencias por:
#
# - Material.
# - Ubicacion.
# - Estado.
#
# Calcula:
#
# - Existencias en bodega.
# - Existencias instaladas.
# - Cantidades por estado.
# - Disponibles.
# - Total fisico.
#
# No cuenta los materiales dos veces.
#
# ==========================================================

def obtener_resumen(db: Session):

    # ======================================================
    # PREPARAR TODOS LOS MATERIALES CON CANTIDAD CERO
    # ======================================================

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

    # ======================================================
    # AGRUPAR CANTIDADES DESDE POSTGRESQL
    # ======================================================
    #
    # Consultamos inventario_stock una sola vez.
    #
    # No sumamos cantidades de otras tablas,
    # evitando duplicaciones.
    # ======================================================

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

    # ======================================================
    # ACUMULAR CANTIDADES EN EL RESUMEN
    # ======================================================

    for material, ubicacion, estado, cantidad in resultados:

        cantidad = int(cantidad)

        fila = resumen[material]

        # ==================================================
        # BODEGA
        # ==================================================

        if ubicacion == "BODEGA":

            fila["bodega"] += cantidad

        # ==================================================
        # INSTALADO
        # ==================================================

        elif ubicacion == "INSTALADO":

            fila["instalado"] += cantidad

        # ==================================================
        # ESTADO DEL MATERIAL
        # ==================================================

        campo_estado = ESTADOS[estado]

        fila[campo_estado] += cantidad

    # ======================================================
    # CALCULAR DISPONIBLES Y TOTAL FISICO
    # ======================================================
    #
    # DISPONIBLES:
    # BUENO + REPARADO
    #
    # TOTAL:
    # BODEGA + INSTALADO
    #
    # Los estados representan condiciones de las
    # mismas piezas; no se suman nuevamente al total.
    # ======================================================

    for fila in resumen.values():

        fila["disponibles"] = (
            fila["bueno"]
            + fila["reparado"]
        )

        fila["total"] = (
            fila["bodega"]
            + fila["instalado"]
        )

    # ======================================================
    # CONVERTIR RESUMEN A LISTA
    # ======================================================

    materiales = list(resumen.values())

    # ======================================================
    # RESPUESTA FINAL DEL INVENTARIO
    # ======================================================

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
# CONSULTAR HISTORIAL DE MOVIMIENTOS
# ==========================================================
#
# Obtiene los movimientos mas recientes.
#
# Se conserva el comportamiento existente
# para mantener compatibilidad con el router
# del inventario general.
#
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
#
# Devuelve las incidencias registradas
# comenzando por las mas recientes.
#
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
