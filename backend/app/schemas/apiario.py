from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiarioBase(BaseModel):
    nombre: str = Field(
        min_length=2,
        max_length=100
    )

    ubicacion: str | None = Field(
        default=None,
        max_length=255
    )

    descripcion: str | None = None


class ApiarioCreate(ApiarioBase):
    pass


class ApiarioUpdate(BaseModel):
    nombre: str | None = Field(
        default=None,
        min_length=2,
        max_length=100
    )

    ubicacion: str | None = Field(
        default=None,
        max_length=255
    )

    descripcion: str | None = None


class ApiarioResponse(ApiarioBase):
    id: int
    activo: bool

    fecha_creacion: datetime
    fecha_actualizacion: datetime
    fecha_eliminacion: datetime | None

    model_config = ConfigDict(
        from_attributes=True
    )