from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


# ==========================================================
# SCHEMAS DE GRUPOS O FILAS DE COLMENAS (PB-06)
# ==========================================================


def limpiar_nombre(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = " ".join(valor.split())
    if not valor:
        raise ValueError("El nombre del grupo no puede estar vacío")
    return valor


class GrupoCreate(BaseModel):

    apiario_id: int = Field(gt=0)

    nombre: str = Field(min_length=1, max_length=60)

    descripcion: str | None = Field(default=None, max_length=500)

    model_config = ConfigDict(extra="forbid")

    _nombre = field_validator("nombre")(limpiar_nombre)


class GrupoUpdate(BaseModel):

    nombre: str | None = Field(default=None, min_length=1, max_length=60)

    descripcion: str | None = Field(default=None, max_length=500)

    model_config = ConfigDict(extra="forbid")

    _nombre = field_validator("nombre")(limpiar_nombre)

    @model_validator(mode="after")
    def validar_cambios(self):
        if not self.model_fields_set:
            raise ValueError("Indica al menos un campo para modificar")
        if "nombre" in self.model_fields_set and self.nombre is None:
            raise ValueError("El nombre del grupo no puede ser nulo")
        return self


class GrupoColmenasAsignar(BaseModel):

    # Colmenas a asignar o reasignar a este grupo.
    colmena_ids: list[int] = Field(min_length=1, max_length=100)

    model_config = ConfigDict(extra="forbid")

    @field_validator("colmena_ids")
    @classmethod
    def validar_ids(cls, valores: list[int]) -> list[int]:
        if any(valor <= 0 for valor in valores):
            raise ValueError("Los identificadores deben ser positivos")
        if len(set(valores)) != len(valores):
            raise ValueError("No repitas colmenas en la misma solicitud")
        return valores


class GrupoResponse(BaseModel):

    id: int
    apiario_id: int
    nombre: str
    descripcion: str | None
    activo: bool

    # Colmenas asignadas actualmente.
    cantidad_colmenas: int = 0

    fecha_creacion: datetime
    fecha_actualizacion: datetime
    fecha_eliminacion: datetime | None

    model_config = ConfigDict(from_attributes=True)


class GrupoColmenaItem(BaseModel):

    colmena_id: int
    codigo: str
    estado: str
    fecha_asignacion: datetime


class GrupoDetalleResponse(GrupoResponse):

    colmenas: list[GrupoColmenaItem] = []


class GrupoAsignacionResponse(BaseModel):

    colmena_id: int
    codigo: str
    usuario_id: int
    fecha_asignacion: datetime

    # null mientras la colmena sigue en el grupo.
    fecha_retiro: datetime | None
