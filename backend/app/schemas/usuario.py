from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


RolUsuario = Literal[
    "ADMIN",
    "APICULTOR"
]


class UsuarioBase(BaseModel):
    nombre: str = Field(
        min_length=2,
        max_length=100
    )

    apellido: str | None = Field(
        default=None,
        max_length=100
    )

    email: str = Field(
        min_length=5,
        max_length=150
    )

    rol: RolUsuario = "APICULTOR"


class UsuarioCreate(UsuarioBase):
    password: str = Field(
        min_length=8,
        max_length=128
    )


class UsuarioUpdate(BaseModel):
    nombre: str | None = Field(
        default=None,
        min_length=2,
        max_length=100
    )

    apellido: str | None = Field(
        default=None,
        max_length=100
    )

    email: str | None = Field(
        default=None,
        min_length=5,
        max_length=150
    )

    rol: RolUsuario | None = None


class UsuarioResponse(UsuarioBase):
    id: int
    activo: bool

    fecha_creacion: datetime
    fecha_actualizacion: datetime
    fecha_eliminacion: datetime | None

    model_config = ConfigDict(
        from_attributes=True
    )