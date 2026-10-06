from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ==========================================================
# VALORES PERMITIDOS
# ==========================================================

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


# ==========================================================
# DATOS BASE DE UNA INSPECCIÓN
# ==========================================================

class InspeccionBase(BaseModel):

    # ------------------------------------------------------
    # COLMENA INSPECCIONADA
    # ------------------------------------------------------

    colmena_id: int = Field(
        gt=0
    )

    # ------------------------------------------------------
    # USUARIO QUE REALIZA LA INSPECCIÓN
    # ------------------------------------------------------

    usuario_id: int = Field(
        gt=0
    )

    # ------------------------------------------------------
    # ESTADO GENERAL
    # ------------------------------------------------------

    estado_general: EstadoGeneral | None = None

    # ------------------------------------------------------
    # REINA OBSERVADA
    # ------------------------------------------------------

    reina_observada: bool | None = None

    # ------------------------------------------------------
    # PRESENCIA DE CRÍA
    # ------------------------------------------------------

    presencia_cria: bool | None = None

    # ------------------------------------------------------
    # NIVEL DE POBLACIÓN
    # ------------------------------------------------------

    nivel_poblacion: Nivel | None = None

    # ------------------------------------------------------
    # RESERVAS DE ALIMENTO
    # ------------------------------------------------------

    reservas_alimento: Nivel | None = None

    # ------------------------------------------------------
    # CANTIDAD DE MARCOS OBSERVADOS
    # ------------------------------------------------------
    #
    # Guarda la cantidad de marcos que tenía la colmena
    # al momento de realizar la inspección.
    #
    # ge=0:
    # permite 0 o valores positivos.
    #
    # Ejemplos:
    #
    # 0  -> válido
    # 8  -> válido
    # 10 -> válido
    # -1 -> inválido
    #
    # Se deja opcional para mantener compatibilidad con
    # inspecciones antiguas donde este dato no existía.
    # ------------------------------------------------------

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0
    )

    # ------------------------------------------------------
    # SIGNOS DE ENFERMEDAD
    # ------------------------------------------------------

    signos_enfermedad: bool = False

    # ------------------------------------------------------
    # ENFERMEDAD OBSERVADA
    # ------------------------------------------------------

    enfermedad_observada: str | None = None

    # ------------------------------------------------------
    # OBSERVACIONES
    # ------------------------------------------------------

    observaciones: str | None = None


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================

class InspeccionCreate(InspeccionBase):
    pass


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================

class InspeccionUpdate(BaseModel):

    estado_general: EstadoGeneral | None = None

    reina_observada: bool | None = None

    presencia_cria: bool | None = None

    nivel_poblacion: Nivel | None = None

    reservas_alimento: Nivel | None = None

    # ------------------------------------------------------
    # ACTUALIZAR CANTIDAD DE MARCOS
    # ------------------------------------------------------

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0
    )

    signos_enfermedad: bool | None = None

    enfermedad_observada: str | None = None

    observaciones: str | None = None


# ==========================================================
# RESPUESTA DE LA API
# ==========================================================

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