
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator
)


# ==========================================================
# VALORES PERMITIDOS EN LAS INSPECCIONES
# ==========================================================

EstadoGeneral = Literal[
    "COMPLETA",
    "EN_DESARROLLO",
    "DONANTE",
    "DEBIL",
    "REQUIERE_REVISION",
    "BUENO",
    "REGULAR",
    "CRITICO",
]

Nivel = Literal[
    "BAJO",
    "MEDIO",
    "ALTO"
]


# ==========================================================
# NUEVO - UBICACIONES DE LOS MARCOS
# ==========================================================
#
# CAMARA_CRIA:
# Caja principal donde se encuentra la cría.
#
# ALZA:
# Caja superior de la colmena.
# ==========================================================

UbicacionMarco = Literal[
    "CAMARA_CRIA",
    "ALZA"
]


# ==========================================================
# NUEVO - CONTENIDOS PERMITIDOS DE LOS MARCOS
# ==========================================================
#
# MIEL_Y_CRIA   -> contiene miel y cría.
# SOLO_CRIA     -> contiene cría.
# SOLO_MIEL     -> contiene miel.
# CERA_ESTIRADA -> cera ya construida.
# CERA_ESTAMPADA-> lámina de cera estampada.
# CERA_UNTADA   -> cera untada.
# SIN_MARCO     -> posición vacía.
# ==========================================================

ContenidoMarco = Literal[
    "MIEL_Y_CRIA",
    "SOLO_CRIA",
    "SOLO_MIEL",
    "CERA_ESTIRADA",
    "CERA_ESTAMPADA",
    "CERA_UNTADA",
    "SIN_MARCO"
]


# ==========================================================
# NUEVO - ESQUEMA DE UNA POSICIÓN DE MARCO
# ==========================================================
#
# Representa una posición individual durante
# una inspección.
#
# Cada caja tiene 10 posiciones.
# ==========================================================

class InspeccionMarcoSchema(BaseModel):

    model_config = ConfigDict(
        from_attributes=True
    )

    # ------------------------------------------------------
    # UBICACIÓN
    # ------------------------------------------------------

    ubicacion: UbicacionMarco

    # ------------------------------------------------------
    # NÚMERO DE POSICIÓN
    # ------------------------------------------------------

    numero: int = Field(
        ge=1,
        le=10
    )

    # ------------------------------------------------------
    # CONTENIDO DE LA POSICIÓN
    # ------------------------------------------------------

    contenido: ContenidoMarco

    # ------------------------------------------------------
    # DESTINO DE TRANSFERENCIA
    # ------------------------------------------------------
    #
    # None:
    # No existe una transferencia.
    #
    # Número positivo:
    # ID de la colmena destino.
    # ------------------------------------------------------

    transferido_a_colmena_id: int | None = Field(
        default=None,
        gt=0
    )

    # ------------------------------------------------------
    # VALIDACIÓN DE TRANSFERENCIA
    # ------------------------------------------------------

    @model_validator(mode="after")
    def validar_transferencia(self):

        if (
            self.contenido == "SIN_MARCO"
            and self.transferido_a_colmena_id is not None
        ):
            raise ValueError(
                "No se puede transferir una posición SIN_MARCO"
            )

        return self


# ==========================================================
# FUNCIÓN AUXILIAR - VALIDAR DETALLE DE MARCOS
# ==========================================================

def validar_posiciones_marcos(
    marcos: list[InspeccionMarcoSchema],
    tiene_alza: bool | None,
    cantidad_marcos: int | None
):

    # ------------------------------------------------------
    # DETALLE NO REGISTRADO
    # ------------------------------------------------------
    #
    # Permite mantener compatibilidad con
    # inspecciones antiguas.
    # ------------------------------------------------------

    if not marcos:
        return

    # ------------------------------------------------------
    # VALIDAR POSICIONES DUPLICADAS
    # ------------------------------------------------------

    posiciones = [
        (marco.ubicacion, marco.numero)
        for marco in marcos
    ]

    if len(posiciones) != len(set(posiciones)):
        raise ValueError(
            "No se permiten posiciones de marcos duplicadas"
        )

    # ------------------------------------------------------
    # SEPARAR CÁMARA DE CRÍA Y ALZA
    # ------------------------------------------------------

    camara = [
        marco for marco in marcos
        if marco.ubicacion == "CAMARA_CRIA"
    ]

    alza = [
        marco for marco in marcos
        if marco.ubicacion == "ALZA"
    ]

    # ------------------------------------------------------
    # VALIDAR CÁMARA DE CRÍA
    # ------------------------------------------------------

    if len(camara) != 10:
        raise ValueError(
            "La cámara de cría debe registrar "
            "sus 10 posiciones"
        )

    # ------------------------------------------------------
    # VALIDAR ALZA
    # ------------------------------------------------------

    if tiene_alza is True:

        if len(alza) != 10:
            raise ValueError(
                "El alza debe registrar sus 10 posiciones"
            )

    elif alza:

        raise ValueError(
            "No se pueden registrar posiciones de alza "
            "si tiene_alza no es true"
        )

    # ------------------------------------------------------
    # CALCULAR CANTIDAD DE MARCOS PRESENTES
    # ------------------------------------------------------
    #
    # SIN_MARCO no representa un marco físico.
    # ------------------------------------------------------

    cantidad_real = sum(
        1
        for marco in marcos
        if marco.contenido != "SIN_MARCO"
    )

    # ------------------------------------------------------
    # VALIDAR COINCIDENCIA DE CANTIDADES
    # ------------------------------------------------------

    if (
        cantidad_marcos is not None
        and cantidad_marcos != cantidad_real
    ):
        raise ValueError(
            f"cantidad_marcos indica {cantidad_marcos}, "
            f"pero el detalle contiene {cantidad_real} "
            "marcos presentes"
        )


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
    #
    # El router sustituye este valor por
    # el usuario autenticado.
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
    # Entre 0 y 20.
    #
    # No cuenta posiciones SIN_MARCO.
    # ------------------------------------------------------

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0,
        le=20
    )

    # ------------------------------------------------------
    # PRESENCIA DE ALZA
    # ------------------------------------------------------

    tiene_alza: bool | None = None

    # ------------------------------------------------------
    # NUEVO - DETALLE DE MARCOS
    # ------------------------------------------------------
    #
    # Contiene las posiciones registradas.
    #
    # [] indica que no se registró el detalle.
    # ------------------------------------------------------

    marcos: list[InspeccionMarcoSchema] = Field(
        default_factory=list
    )

    # ------------------------------------------------------
    # RF-27 - MIEL
    # ------------------------------------------------------

    miel: str | None = Field(
        default=None,
        max_length=50
    )

    # ------------------------------------------------------
    # RF-28 - ALIMENTACIÓN SUMINISTRADA
    # ------------------------------------------------------

    alimentacion_suministrada: str | None = Field(
        default=None,
        max_length=500
    )

    # ------------------------------------------------------
    # RF-31 - POSTURA
    # ------------------------------------------------------

    postura: bool | None = None

    # ------------------------------------------------------
    # SIGNOS DE ENFERMEDAD
    # ------------------------------------------------------

    signos_enfermedad: bool = False

    # ------------------------------------------------------
    # ENFERMEDAD OBSERVADA
    # ------------------------------------------------------

    enfermedad_observada: str | None = None

    # ------------------------------------------------------
    # TIRAS DE MEDICAMENTO
    # ------------------------------------------------------
    #
    # Permite 1, 2 o 3.
    #
    # None indica que no se aplicaron
    # o no se registró el dato.
    # ------------------------------------------------------

    tiras_medicamento: int | None = Field(
        default=None,
        ge=1,
        le=3
    )

    # ------------------------------------------------------
    # OBSERVACIONES GENERALES
    # ------------------------------------------------------

    observaciones: str | None = None

    # ------------------------------------------------------
    # VALIDACIÓN DE MARCOS
    # ------------------------------------------------------

    @model_validator(mode="after")
    def validar_detalle_marcos(self):

        validar_posiciones_marcos(
            self.marcos,
            self.tiene_alza,
            self.cantidad_marcos
        )

        return self


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================

class InspeccionCreate(InspeccionBase):
    fecha_inspeccion: datetime | None = None

    # "Guardar y siguiente" de una revision por grupo (S2-T16):
    # la colmena queda REVISADA en esa sesion.
    sesion_revision_id: int | None = Field(default=None, gt=0)

    # UUID generado en el telefono para sincronizar sin duplicar.
    id_cliente: UUID | None = None

    @model_validator(mode="after")
    def validar_fecha_inspeccion(self):
        fecha = self.fecha_inspeccion

        if fecha is None:
            return self

        if fecha.tzinfo is None or fecha.utcoffset() is None:
            raise ValueError(
                "fecha_inspeccion debe incluir zona horaria"
            )

        if fecha > datetime.now(timezone.utc):
            raise ValueError(
                "La fecha de inspeccion no puede ser futura"
            )

        return self


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================
#
# Los campos son opcionales para permitir PATCH.
# ==========================================================

class InspeccionUpdate(BaseModel):

    estado_general: EstadoGeneral | None = None

    reina_observada: bool | None = None

    presencia_cria: bool | None = None

    nivel_poblacion: Nivel | None = None

    reservas_alimento: Nivel | None = None

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0,
        le=20
    )

    tiene_alza: bool | None = None

    # ------------------------------------------------------
    # ACTUALIZACIÓN DEL DETALLE DE MARCOS
    # ------------------------------------------------------
    #
    # None:
    # No modificar los marcos.
    #
    # []:
    # Solicitar que se elimine el detalle existente.
    #
    # Lista:
    # Solicitar reemplazar el detalle existente.
    # ------------------------------------------------------

    marcos: list[InspeccionMarcoSchema] | None = None

    miel: str | None = Field(
        default=None,
        max_length=50
    )

    alimentacion_suministrada: str | None = Field(
        default=None,
        max_length=500
    )

    postura: bool | None = None

    signos_enfermedad: bool | None = None

    enfermedad_observada: str | None = None

    tiras_medicamento: int | None = Field(
        default=None,
        ge=1,
        le=3
    )

    observaciones: str | None = None

    # ------------------------------------------------------
    # VALIDACIÓN BÁSICA EN PATCH
    # ------------------------------------------------------
    #
    # La consistencia con los valores existentes
    # de la inspección se verificará en el servicio.
    # ------------------------------------------------------

    @model_validator(mode="after")
    def validar_marcos_actualizados(self):

        if self.marcos is not None:

            posiciones = [
                (marco.ubicacion, marco.numero)
                for marco in self.marcos
            ]

            if len(posiciones) != len(set(posiciones)):
                raise ValueError(
                    "No se permiten posiciones duplicadas"
                )

            # Si ambos datos están presentes, podemos
            # validar las cantidades directamente.
            if (
                self.marcos
                and self.tiene_alza is not None
            ):
                validar_posiciones_marcos(
                    self.marcos,
                    self.tiene_alza,
                    self.cantidad_marcos
                )

        return self


# ==========================================================
# RESPUESTA DE LA API
# ==========================================================
#
# Incluye:
# - Datos generales de inspección.
# - Presencia de alza.
# - Tiras de medicamento.
# - Lista de marcos relacionados.
# ==========================================================

class InspeccionResponse(InspeccionBase):

    id: int

    # UUID generado en el telefono para sincronizar sin duplicar.
    id_cliente: UUID | None = None

    fecha_inspeccion: datetime

    activo: bool

    fecha_creacion: datetime

    fecha_actualizacion: datetime

    fecha_eliminacion: datetime | None

    model_config = ConfigDict(
        from_attributes=True
    )
