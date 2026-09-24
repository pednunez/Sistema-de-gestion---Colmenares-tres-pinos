from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


TipoMarco = Literal[
    "CRIA",
    "MIEL",
    "POLEN",
    "VACIO",
    "OTRO"
]


class TransferenciaMarcoBase(BaseModel):
    colmena_origen_id: int = Field(
        gt=0
    )

    colmena_destino_id: int = Field(
        gt=0
    )

    usuario_id: int = Field(
        gt=0
    )

    cantidad_marcos: int = Field(
        gt=0
    )

    tipo_marco: TipoMarco | None = None

    motivo: str | None = Field(
        default=None,
        max_length=255
    )

    observaciones: str | None = None

    @model_validator(mode="after")
    def validar_colmenas(self):
        if self.colmena_origen_id == self.colmena_destino_id:
            raise ValueError(
                "La colmena de origen y destino deben ser diferentes"
            )

        return self


class TransferenciaMarcoCreate(TransferenciaMarcoBase):
    pass


class TransferenciaMarcoResponse(TransferenciaMarcoBase):
    id: int
    fecha_transferencia: datetime
    fecha_creacion: datetime

    model_config = ConfigDict(
        from_attributes=True
    )