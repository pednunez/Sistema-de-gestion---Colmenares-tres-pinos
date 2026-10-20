
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from sqlalchemy import (
    func,
    select,
    text,
)

from sqlalchemy.orm import Session

from app.core.dependencies import (
    obtener_usuario_actual,
    requerir_admin,
)

from app.database import get_db

from app.models.inventario_stock import InventarioStock
from app.models.stock_minimo import StockMinimo
from app.models.usuario import Usuario

from app.schemas.auditoria import AuditoriaCreate
from app.services import auditoria as auditoria_service


# ==========================================================
# STOCK DE BODEGA - COLMENARES TRES PINOS
# ==========================================================
#
# GET /stock/
# PATCH /stock/{material}
#
# El GET permite consultar existencias y minimos.
#
# El PATCH permite configurar o eliminar un minimo.
#
# IMPORTANTE:
#
# Este modulo trabaja con existencias de BODEGA.
#
# Los materiales instalados en colmenas se mantienen
# en el inventario general y no se duplican.
# ==========================================================


router = APIRouter(
    prefix="/stock",
    tags=["Stock"],
    dependencies=[Depends(obtener_usuario_actual)],
)


# ==========================================================
# CATALOGO DE MATERIALES DEL FRONTEND DE PEDRO
# ==========================================================

MATERIALES_STOCK = (
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
)


# ==========================================================
# ESTADOS DEL INVENTARIO
# ==========================================================

ESTADOS_DISPONIBLES = (
    "BUENO",
    "REPARADO",
)

ESTADOS_DANADOS = (
    "DANADO",
    "ROTO",
    "EN_REPARACION",
)


# ==========================================================
# RESPUESTA GET /stock/
# ==========================================================

class StockFilaResponse(BaseModel):

    material: str

    disponible: int = Field(ge=0)

    danado: int = Field(ge=0)

    minimo: int | None = Field(
        default=None,
        ge=0,
    )

    actualizado_en: datetime | None = None


# ==========================================================
# SOLICITUD PATCH /stock/{material}
# ==========================================================
#
# El campo minimo es obligatorio, pero puede ser NULL.
#
# Ejemplos:
#
# {"minimo": 10}   -> Crear o actualizar
# {"minimo": 0}    -> Establecer minimo en cero
# {"minimo": null} -> Eliminar configuracion
#
# No permitimos numeros negativos.
# ==========================================================

class StockMinimoUpdate(BaseModel):

    minimo: int | None = Field(
        ...,
        ge=0,
        strict=True,
    )

    model_config = ConfigDict(
        extra="forbid",
    )


# ==========================================================
# RESPUESTA PATCH /stock/{material}
# ==========================================================

class StockMinimoResponse(BaseModel):

    material: str

    minimo: int | None

    actualizado_en: datetime | None


# ==========================================================
# GET /stock/
# ==========================================================
#
# Disponible para usuarios autenticados.
#
# ADMIN y APICULTOR pueden consultar el stock.
#
# Este endpoint no modifica PostgreSQL.
# ==========================================================

@router.get(
    "/",
    response_model=list[StockFilaResponse],
)
def consultar_stock(
    db: Session = Depends(get_db),
):

    # ======================================================
    # CREAR ESTRUCTURA INICIAL
    # ======================================================
    #
    # Siempre devolvemos los siete materiales.
    # ======================================================

    resumen = {
        material: {
            "material": material,
            "disponible": 0,
            "danado": 0,
            "minimo": None,
            "actualizado_en": None,
        }
        for material in MATERIALES_STOCK
    }

    # ======================================================
    # CONSULTAR EXISTENCIAS DE BODEGA
    # ======================================================

    consulta_stock = (
        select(
            InventarioStock.material,
            InventarioStock.estado,
            func.sum(
                InventarioStock.cantidad
            ).label("cantidad"),
            func.max(
                InventarioStock.fecha_actualizacion
            ).label("actualizado_en"),
        )
        .where(
            InventarioStock.ubicacion == "BODEGA",
            InventarioStock.material.in_(
                MATERIALES_STOCK
            ),
        )
        .group_by(
            InventarioStock.material,
            InventarioStock.estado,
        )
    )

    resultados_stock = db.execute(
        consulta_stock
    ).all()

    # ======================================================
    # CLASIFICAR LAS CANTIDADES
    # ======================================================

    for fila in resultados_stock:

        item = resumen[fila.material]

        cantidad = int(fila.cantidad)

        if fila.estado in ESTADOS_DISPONIBLES:

            item["disponible"] += cantidad

        elif fila.estado in ESTADOS_DANADOS:

            item["danado"] += cantidad

        if (
            fila.actualizado_en is not None
            and (
                item["actualizado_en"] is None
                or fila.actualizado_en
                > item["actualizado_en"]
            )
        ):
            item["actualizado_en"] = (
                fila.actualizado_en
            )

    # ======================================================
    # CONSULTAR MINIMOS CONFIGURADOS
    # ======================================================

    consulta_minimos = (
        select(
            StockMinimo.material,
            StockMinimo.minimo,
            StockMinimo.actualizado_en,
        )
        .where(
            StockMinimo.material.in_(
                MATERIALES_STOCK
            )
        )
    )

    resultados_minimos = db.execute(
        consulta_minimos
    ).all()

    # ======================================================
    # ASOCIAR MINIMOS AL RESUMEN
    # ======================================================

    for fila in resultados_minimos:

        item = resumen[fila.material]

        item["minimo"] = int(
            fila.minimo
        )

        if (
            fila.actualizado_en is not None
            and (
                item["actualizado_en"] is None
                or fila.actualizado_en
                > item["actualizado_en"]
            )
        ):
            item["actualizado_en"] = (
                fila.actualizado_en
            )

    # ======================================================
    # DEVOLVER STOCK Y MINIMOS
    # ======================================================

    return list(resumen.values())


# ==========================================================
# PATCH /stock/{material}
# ==========================================================
#
# Permite:
#
# 1. Crear un minimo.
# 2. Actualizar un minimo existente.
# 3. Eliminar un minimo usando NULL.
#
# Requiere rol ADMIN.
#
# Cada cambio efectivo genera auditoria.
#
# El minimo y la auditoria se guardan dentro
# de una misma transaccion PostgreSQL.
# ==========================================================

@router.patch(
    "/{material}",
    response_model=StockMinimoResponse,
)
def actualizar_minimo_stock(
    material: str,
    datos: StockMinimoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(requerir_admin),
):

    # ======================================================
    # VALIDAR MATERIAL
    # ======================================================

    material = material.strip().upper()

    if material not in MATERIALES_STOCK:

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Material no permitido en el modulo Stock",
        )

    try:

        # ==================================================
        # BLOQUEAR ACTUALIZACIONES CONCURRENTES
        # ==================================================
        #
        # Utilizamos un bloqueo transaccional exclusivo
        # para las configuraciones de minimos.
        #
        # El recurso 2 es distinto del utilizado por
        # las operaciones del inventario general.
        # ==================================================

        db.execute(
            text(
                "SELECT pg_advisory_xact_lock("
                ":espacio, :recurso)"
            ),
            {
                "espacio": 74112,
                "recurso": 2,
            },
        )

        # ==================================================
        # BUSCAR CONFIGURACION EXISTENTE
        # ==================================================

        consulta = (
            select(StockMinimo)
            .where(
                StockMinimo.material == material
            )
            .with_for_update()
        )

        registro = db.scalar(consulta)

        minimo_anterior = (
            registro.minimo
            if registro is not None
            else None
        )

        # ==================================================
        # EVITAR ESCRITURAS SIN CAMBIOS
        # ==================================================

        if minimo_anterior == datos.minimo:

            fecha_actualizacion = (
                registro.actualizado_en
                if registro is not None
                else None
            )

            db.rollback()

            return {
                "material": material,
                "minimo": datos.minimo,
                "actualizado_en": fecha_actualizacion,
            }

        # ==================================================
        # ELIMINAR MINIMO
        # ==================================================
        #
        # NULL significa eliminar la configuracion.
        #
        # No elimina materiales ni cantidades fisicas.
        # ==================================================

        if datos.minimo is None:

            if registro is not None:
                db.delete(registro)

            fecha_actualizacion = None

        # ==================================================
        # CREAR O ACTUALIZAR MINIMO
        # ==================================================

        else:

            if registro is None:

                registro = StockMinimo(
                    material=material,
                    minimo=datos.minimo,
                )

                db.add(registro)

            else:

                registro.minimo = datos.minimo

                registro.actualizado_en = (
                    datetime.now(timezone.utc)
                )

        # ==================================================
        # GUARDAR CAMBIOS PENDIENTES
        # ==================================================
        #
        # Flush envia las operaciones a PostgreSQL,
        # pero todavia no confirma la transaccion.
        # ==================================================

        db.flush()

        # ==================================================
        # OBTENER FECHA ACTUALIZADA
        # ==================================================

        if datos.minimo is not None:

            db.refresh(registro)

            fecha_actualizacion = (
                registro.actualizado_en
            )

        # ==================================================
        # REGISTRAR AUDITORIA
        # ==================================================

        if minimo_anterior is None:

            accion = "CREAR"

        elif datos.minimo is None:

            accion = "ELIMINAR"

        else:

            accion = "MODIFICAR"

        auditoria_service.registrar_auditoria(
            db,
            AuditoriaCreate(
                usuario_id=usuario_actual.id,
                entidad="STOCK_MINIMO",
                entidad_id=None,
                accion=accion,
                datos_anteriores={
                    "material": material,
                    "minimo": minimo_anterior,
                },
                datos_nuevos={
                    "material": material,
                    "minimo": datos.minimo,
                },
            ),
            commit=False,
        )

        # ==================================================
        # CONFIRMAR CONFIGURACION Y AUDITORIA
        # ==================================================

        db.commit()

        # ==================================================
        # RESPUESTA AL FRONTEND
        # ==================================================

        return {
            "material": material,
            "minimo": datos.minimo,
            "actualizado_en": fecha_actualizacion,
        }

    except Exception:

        db.rollback()

        raise
