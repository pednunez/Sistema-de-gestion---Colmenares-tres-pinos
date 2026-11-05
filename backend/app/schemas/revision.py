from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ==========================================================
# SCHEMAS DE SESIONES DE REVISION POR GRUPO (S2-T16)
# ==========================================================

EstadoSesion = Literal["EN_CURSO", "FINALIZADA"]

EstadoColmenaSesion = Literal["PENDIENTE", "REVISADA", "OMITIDA"]


class SesionRevisionCreate(BaseModel):

    grupo_id: int = Field(gt=0)

    # UUID del telefono: si la app reintenta, se devuelve la
    # misma sesion.
    id_cliente: UUID | None = None

    model_config = ConfigDict(extra="forbid")


class OmitirColmena(BaseModel):

    colmena_id: int = Field(gt=0)

    motivo: str | None = Field(default=None, max_length=300)

    model_config = ConfigDict(extra="forbid")


class ColmenaEnSesion(BaseModel):

    orden: int
    colmena_id: int
    codigo: str
    estado: EstadoColmenaSesion
    inspeccion_id: int | None
    # Estado general registrado en su inspeccion, si la hay.
    estado_general: str | None
    motivo_omision: str | None


class ProgresoSesion(BaseModel):

    total: int
    revisadas: int
    omitidas: int
    pendientes: int


class SesionRevisionResponse(BaseModel):

    id: int
    apiario_id: int
    grupo_id: int
    grupo_nombre: str
    usuario_id: int
    estado: EstadoSesion
    id_cliente: UUID | None
    fecha_inicio: datetime
    fecha_fin: datetime | None

    progreso: ProgresoSesion

    # Primera colmena pendiente en el orden: la que sigue en
    # "Guardar y siguiente". null si no quedan pendientes.
    siguiente_colmena_id: int | None

    # Cuantas colmenas quedaron en cada estado_general.
    resumen_estados: dict[str, int]

    colmenas: list[ColmenaEnSesion]
