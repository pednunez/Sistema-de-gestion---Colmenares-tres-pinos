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
# Contrato de datos para el frontend.
#
# POST /stock/movimientos/
# GET  /stock/movimientos/
#
# Este archivo solamente valida y estructura datos.
# No modifica PostgreSQL ni registra movimientos.
# ==========================================================


# ==========================================================
# MATERIALES PERMITIDOS
# ==========================================================

MaterialStock = Literal[
    "CAJON",
    "ALZA",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "TECHO",
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
    "ENVIO_REPARACION",
    "REPARACION",
    "DESCARTE",
]


# ==========================================================
# ORIGEN DE UNA MERMA (DESCARTE)
# ==========================================================

EstadoOrigenMerma = Literal[
    "DANADO",
    "EN_REPARACION",
]


# ==========================================================
# SOLICITUD PARA REGISTRAR UN MOVIMIENTO
# ==========================================================

class StockMovimientoCreate(BaseModel):
    """Datos necesarios para solicitar un movimiento de stock."""

    material: MaterialStock
    tipo: TipoMovimientoStock

    # Cantidad entera, positiva. strict=True rechaza decimales
    # y valores booleanos.
    cantidad: int = Field(
        gt=0,
        strict=True,
    )

    # Destino opcional para ENVIO.
    # El servicio debe validar la colmena y resolver el apiario
    # si se informa colmena_id.
    apiario_id: int | None = Field(
        default=None,
        gt=0,
        strict=True,
    )

    colmena_id: int | None = Field(
        default=None,
        gt=0,
        strict=True,
    )

    # Obligatorio solo para DESCARTE.
    estado_origen: EstadoOrigenMerma | None = None

    observaciones: str | None = Field(
        default=None,
        max_length=500,
    )

    # Rechaza campos que no forman parte de este contrato.
    model_config = ConfigDict(
        extra="forbid",
    )

    @model_validator(mode="after")
    def validar_datos_movimiento(self):
        """Valida los campos que dependen del tipo solicitado."""

        if self.tipo == "DESCARTE":
            if self.estado_origen is None:
                raise ValueError(
                    "La merma requiere indicar el estado de origen: "
                    "DANADO o EN_REPARACION"
                )
        elif self.estado_origen is not None:
            raise ValueError(
                "Solo la merma requiere estado de origen"
            )

        if self.tipo == "ENVIO":
            # Un ENVIO puede ser una salida genérica de bodega.
            # Si hay destino, el servicio validará su existencia
            # y la relación entre apiario y colmena.
            return self

        # Los demás movimientos se registran
        # sobre el stock de bodega, sin apiario ni colmena.
        if (
            self.apiario_id is not None
            or self.colmena_id is not None
        ):
            raise ValueError(
                "Esta operación no requiere apiario ni colmena"
            )

        return self


# ==========================================================
# RESPUESTA DEL MOVIMIENTO REGISTRADO
# ==========================================================

class StockMovimientoResponse(BaseModel):
    """Datos que recibe el frontend después de consultar o registrar."""

    id: int
    material: MaterialStock
    tipo: TipoMovimientoStock
    cantidad: int = Field(gt=0)

    apiario_id: int | None = None
    colmena_id: int | None = None
    estado_origen: EstadoOrigenMerma | None = None
    observaciones: str | None = None

    usuario_id: int
    fecha: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )