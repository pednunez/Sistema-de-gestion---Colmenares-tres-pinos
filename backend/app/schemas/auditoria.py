from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


AccionAuditoria = Literal[
    "CREAR",
    "MODIFICAR",
    "ELIMINAR",
    "RESTAURAR"
]


class AuditoriaCreate(BaseModel):
    usuario_id: int | None = None

    entidad: str

    entidad_id: int | None = None

    accion: AccionAuditoria

    datos_anteriores: dict[str, Any] | None = None

    datos_nuevos: dict[str, Any] | None = None


class AuditoriaResponse(AuditoriaCreate):
    id: int
    fecha: datetime

    model_config = ConfigDict(
        from_attributes=True
    )