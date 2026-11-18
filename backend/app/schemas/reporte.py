from datetime import date
from typing import Literal, get_args

from pydantic import BaseModel, Field, model_validator

from app.schemas.inspeccion import EstadoGeneral

TipoReporte = Literal["inspecciones", "tratamientos", "colmenas"]
FormatoReporte = Literal["pdf", "xlsx", "csv"]


class FiltrosReporte(BaseModel):
    formato: FormatoReporte
    desde: date | None = Field(default=None, ge=date(2, 1, 1), lt=date.max)
    hasta: date | None = Field(default=None, ge=date(2, 1, 1), lt=date.max)
    apiario_id: int | None = Field(default=None, gt=0)
    colmena_id: int | None = Field(default=None, gt=0)
    estado: str | None = Field(default=None, min_length=1, max_length=30)

    @model_validator(mode="after")
    def validar_periodo(self):
        if self.desde and self.hasta and self.desde > self.hasta:
            raise ValueError("Desde no puede ser posterior a hasta")
        return self

    def validar_estado(self, tipo: TipoReporte):
        estados = set(get_args(EstadoGeneral))
        if tipo == "tratamientos":
            estados = {"PLANIFICADO", "EN_CURSO", "FINALIZADO", "CANCELADO"}
        elif tipo == "colmenas":
            estados.add("SIN")
        if self.estado is not None and self.estado not in estados:
            raise ValueError("Estado no válido para este tipo de reporte")
