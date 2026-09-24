from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


EstadoTratamiento = Literal[
    "PLANIFICADO",
    "EN_CURSO",
    "FINALIZADO",
    "CANCELADO"
]


class TratamientoBase(BaseModel):
    colmena_id: int = Field(
        gt=0
    )

    inspeccion_id: int | None = Field(
        default=None,
        gt=0
    )

    usuario_id: int = Field(
        gt=0
    )

    tipo_tratamiento: str = Field(
        min_length=2,
        max_length=100
    )

    producto: str | None = Field(
        default=None,
        max_length=150
    )

    dosis: str | None = Field(
        default=None,
        max_length=100
    )

    motivo: str | None = None

    fecha_inicio: date

    fecha_fin: date | None = None

    estado: EstadoTratamiento = "EN_CURSO"

    observaciones: str | None = None

    @model_validator(mode="after")
    def validar_fechas(self):
        if (
            self.fecha_fin is not None
            and self.fecha_fin < self.fecha_inicio
        ):
            raise ValueError(
                "La fecha_fin no puede ser anterior a fecha_inicio"
            )

        return self


class TratamientoCreate(TratamientoBase):
    pass


class TratamientoUpdate(BaseModel):
    tipo_tratamiento: str | None = Field(
        default=None,
        min_length=2,
        max_length=100
    )

    producto: str | None = Field(
        default=None,
        max_length=150
    )

    dosis: str | None = Field(
        default=None,
        max_length=100
    )

    motivo: str | None = None

    fecha_fin: date | None = None

    estado: EstadoTratamiento | None = None

    observaciones: str | None = None


class TratamientoResponse(TratamientoBase):
    id: int

    fecha_creacion: datetime
    fecha_actualizacion: datetime

    model_config = ConfigDict(
        from_attributes=True
    )