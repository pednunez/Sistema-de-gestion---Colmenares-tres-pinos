from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ==========================================================
# ESTADOS PERMITIDOS PARA UNA COLMENA
# ==========================================================

EstadoColmena = Literal[
    "ACTIVA",
    "EN_OBSERVACION",
    "INACTIVA",
    "BAJA"
]


# ==========================================================
# DATOS BASE DE UNA COLMENA
# ==========================================================

class ColmenaBase(BaseModel):

    apiario_id: int = Field(
        gt=0
    )

    codigo: str = Field(
        min_length=1,
        max_length=50
    )

    estado: EstadoColmena = "ACTIVA"

    fecha_instalacion: date | None = None

    # ======================================================
    # CANTIDAD DE MARCOS
    # RF-25 / RF-40 / RF-41
    # ======================================================
    #
    # No se permiten cantidades negativas.
    #
    # Ejemplos válidos:
    # 0
    # 5
    # 10
    #
    # Ejemplo inválido:
    # -2
    # ======================================================

    cantidad_marcos: int = Field(
        default=0,
        ge=0
    )

    observaciones: str | None = None


# ==========================================================
# CREAR COLMENA
# ==========================================================

class ColmenaCreate(ColmenaBase):
    pass


# ==========================================================
# ACTUALIZAR COLMENA
# ==========================================================

class ColmenaUpdate(BaseModel):

    apiario_id: int | None = Field(
        default=None,
        gt=0
    )

    codigo: str | None = Field(
        default=None,
        min_length=1,
        max_length=50
    )

    estado: EstadoColmena | None = None

    fecha_instalacion: date | None = None

    # ======================================================
    # ACTUALIZACIÓN DE CANTIDAD DE MARCOS
    # ======================================================

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0
    )

    observaciones: str | None = None


# ==========================================================
# RESPUESTA DE LA API
# ==========================================================

class ColmenaResponse(ColmenaBase):

    id: int

    codigo_qr: UUID

    activo: bool

    fecha_creacion: datetime

    fecha_actualizacion: datetime

    fecha_eliminacion: datetime | None

    model_config = ConfigDict(
        from_attributes=True
    )