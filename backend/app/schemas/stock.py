
from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


# ==========================================================
# SCHEMAS DE MOVIMIENTOS DE STOCK
# COLMENARES TRES PINOS
# ==========================================================
#
# Contrato de datos para el frontend de Pedro.
#
# POST /stock/movimientos/
# GET /stock/movimientos/
#
# Este archivo solamente valida datos.
#
# No modifica PostgreSQL.
# No registra movimientos.
# No altera el inventario general.
# ==========================================================


# ==========================================================
# SIETE MATERIALES PERMITIDOS
# ==========================================================

MaterialStock = Literal[
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO_AMERICANO",
    "ENTRETAPA",
    "PISO",
]


# ==========================================================
# TIPOS DE MOVIMIENTO DEL FRONTEND
# ==========================================================

TipoMovimientoStock = Literal[
    "INGRESO",
    "ENVIO",
    "DANO",
    "REPARACION",
    "DESCARTE",
]


# ==========================================================
# SOLICITUD PARA REGISTRAR UN MOVIMIENTO
# ==========================================================

class StockMovimientoCreate(BaseModel):

    # ======================================================
    # MATERIAL QUE SE VA A MODIFICAR
    # ======================================================

    material: MaterialStock

    # ======================================================
    # OPERACION SOLICITADA
    # ======================================================

    tipo: TipoMovimientoStock

    # ======================================================
    # CANTIDAD OBLIGATORIAMENTE POSITIVA
    # ======================================================
    #
    # No se permiten negativos, decimales ni booleanos.
    # ======================================================

    cantidad: int = Field(
        gt=0,
        strict=True,
    )

    # ======================================================
    # APIARIO DE DESTINO
    # ======================================================
    #
    # Obligatorio para ENVIO.
    # No se requiere para otros movimientos.
    # ======================================================

    apiario_id: int | None = Field(
        default=None,
        gt=0,
        strict=True,
    )

    # ======================================================
    # COLMENA DE DESTINO
    # ======================================================
    #
    # Opcional para ENVIO.
    #
    # El servicio posteriormente comprobara que
    # la colmena pertenece al apiario indicado.
    # ======================================================

    colmena_id: int | None = Field(
        default=None,
        gt=0,
        strict=True,
    )

    # ======================================================
    # INFORMACION ADICIONAL
    # ======================================================

    observaciones: str | None = None

    # ======================================================
    # NO ACEPTAR CAMPOS DESCONOCIDOS
    # ======================================================

    model_config = ConfigDict(
        extra="forbid",
    )

    # ======================================================
    # VALIDACIONES SEGUN EL TIPO DE MOVIMIENTO
    # ======================================================

    @model_validator(mode="after")
    def validar_datos_movimiento(self):

        # ==================================================
        # ENVIO
        # ==================================================
        #
        # El envio siempre debe indicar un apiario.
        # La colmena es opcional segun el frontend.
        # ==================================================

        if self.tipo == "ENVIO":

            if self.apiario_id is None:

                raise ValueError(
                    "El envio requiere indicar un apiario"
                )

        # ==================================================
        # INGRESO, DANO, REPARACION Y DESCARTE
        # ==================================================
        #
        # Estas operaciones afectan el stock de bodega.
        # No requieren apiario ni colmena.
        # ==================================================

        else:

            if (
                self.apiario_id is not None
                or self.colmena_id is not None
            ):

                raise ValueError(
                    "Esta operacion no requiere "
                    "apiario ni colmena"
                )

        return self


# ==========================================================
# RESPUESTA DEL MOVIMIENTO REGISTRADO
# ==========================================================
#
# Este esquema representa los datos que recibira
# el frontend despues de registrar un movimiento.
# ==========================================================

class StockMovimientoResponse(BaseModel):

    id: int

    material: MaterialStock

    tipo: TipoMovimientoStock

    cantidad: int = Field(gt=0)

    apiario_id: int | None = None

    colmena_id: int | None = None

    observaciones: str | None = None

    usuario_id: int

    fecha: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )
