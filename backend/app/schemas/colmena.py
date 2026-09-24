from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


EstadoColmena = Literal[
    "ACTIVA",
    "EN_OBSERVACION",
    "INACTIVA",
    "BAJA"
]


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

    observaciones: str | None = None


class ColmenaCreate(ColmenaBase):
    pass


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

    observaciones: str | None = None


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