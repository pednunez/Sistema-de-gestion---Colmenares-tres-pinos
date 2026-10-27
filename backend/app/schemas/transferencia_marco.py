
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ==========================================================
# TIPOS PERMITIDOS
# ==========================================================

TipoMarco = Literal[
    "CRIA",
    "MIEL",
    "POLEN",
    "VACIO",
    "OTRO",
]

UbicacionMarco = Literal[
    "CAMARA_CRIA",
    "ALZA",
]

ContenidoMarco = Literal[
    "MIEL_Y_CRIA",
    "SOLO_CRIA",
    "SOLO_MIEL",
    "CERA_ESTIRADA",
    "CERA_ESTAMPADA",
    "CERA_UNTADA",
    "SIN_MARCO",
]


# ==========================================================
# ESQUEMA BASE
# ==========================================================

class TransferenciaMarcoBase(BaseModel):

    colmena_origen_id: int = Field(gt=0)
    colmena_destino_id: int = Field(gt=0)
    usuario_id: int = Field(gt=0)

    cantidad_marcos: int = Field(gt=0)

    tipo_marco: TipoMarco | None = None

    # Campos nuevos de la migración 004.
    # Opcionales para conservar transferencias manuales
    # e históricas.
    inspeccion_id: int | None = Field(default=None, gt=0)

    ubicacion: UbicacionMarco | None = None

    numero_marco: int | None = Field(
        default=None,
        ge=1,
        le=10,
    )

    contenido: ContenidoMarco | None = None

    motivo: str | None = Field(
        default=None,
        max_length=255,
    )

    observaciones: str | None = None

    @model_validator(mode="after")
    def validar_transferencia(self):

        if self.colmena_origen_id == self.colmena_destino_id:
            raise ValueError(
                "La colmena de origen y destino deben ser diferentes"
            )

        # Si se informa el detalle de un marco,
        # deben estar presentes todos sus datos.
        detalle = [
            self.ubicacion,
            self.numero_marco,
            self.contenido,
        ]

        if any(valor is not None for valor in detalle):
            if not all(valor is not None for valor in detalle):
                raise ValueError(
                    "Para identificar un marco debes indicar "
                    "ubicacion, numero_marco y contenido"
                )

            if self.cantidad_marcos != 1:
                raise ValueError(
                    "Las transferencias de marcos individuales "
                    "deben tener cantidad_marcos igual a 1"
                )

            if self.contenido == "SIN_MARCO":
                raise ValueError(
                    "No se puede transferir una posición SIN_MARCO"
                )

        return self


# ==========================================================
# CREAR TRANSFERENCIA
# ==========================================================

class TransferenciaMarcoCreate(TransferenciaMarcoBase):
    pass


# ==========================================================
# RESPUESTA DE TRANSFERENCIA
# ==========================================================

class TransferenciaMarcoResponse(TransferenciaMarcoBase):

    id: int

    fecha_transferencia: datetime
    fecha_creacion: datetime

    model_config = ConfigDict(
        from_attributes=True
    )
