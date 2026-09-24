from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


EstadoGeneral = Literal[
    "BUENO",
    "REGULAR",
    "CRITICO"
]

Nivel = Literal[
    "BAJO",
    "MEDIO",
    "ALTO"
]


class InspeccionBase(BaseModel):
    colmena_id: int = Field(
        gt=0
    )

    usuario_id: int = Field(
        gt=0
    )

    estado_general: EstadoGeneral | None = None

    reina_observada: bool | None = None

    presencia_cria: bool | None = None

    nivel_poblacion: Nivel | None = None

    reservas_alimento: Nivel | None = None

    signos_enfermedad: bool = False

    enfermedad_observada: str | None = None

    observaciones: str | None = None


class InspeccionCreate(InspeccionBase):
    pass


class InspeccionUpdate(BaseModel):
    estado_general: EstadoGeneral | None = None

    reina_observada: bool | None = None

    presencia_cria: bool | None = None

    nivel_poblacion: Nivel | None = None

    reservas_alimento: Nivel | None = None

    signos_enfermedad: bool | None = None

    enfermedad_observada: str | None = None

    observaciones: str | None = None


class InspeccionResponse(InspeccionBase):
    id: int
    fecha_inspeccion: datetime
    activo: bool

    fecha_creacion: datetime
    fecha_actualizacion: datetime
    fecha_eliminacion: datetime | None

    model_config = ConfigDict(
        from_attributes=True
    )