from datetime import datetime

from pydantic import BaseModel


class HistorialEventoResponse(BaseModel):
    colmena_id: int
    fecha: datetime
    tipo_evento: str
    evento_id: int
    detalle: str | None = None