
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


# ==========================================================
# SISTEMA DE GESTIÓN - COLMENARES TRES PINOS
# SCHEMAS DE INSPECCIONES
#
# S3-T05: RETIRO DE MARCOS A BODEGA
# ==========================================================


# ==========================================================
# ESTADOS GENERALES PERMITIDOS
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


# ==========================================================
# NIVELES DE EVALUACIÓN
# ==========================================================

Nivel = Literal[
    "BAJO",
    "MEDIO",
    "ALTO",
]


# ==========================================================
# UBICACIONES DE LOS MARCOS
# ==========================================================
#
# CAMARA_CRIA: caja principal.
# ALZA: caja superior de la colmena.
# ==========================================================

UbicacionMarco = Literal[
    "CAMARA_CRIA",
    "ALZA",
]


# ==========================================================
# CONTENIDOS PERMITIDOS DE LOS MARCOS
# ==========================================================

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
# S3-T05 - CONTENIDOS QUE PUEDEN IR A BODEGA
# ==========================================================
#
# Los marcos con cría no pueden retirarse a bodega.
# Las posiciones SIN_MARCO tampoco.
# ==========================================================

CONTENIDOS_PERMITIDOS_BODEGA = {
    "SOLO_MIEL",
    "CERA_ESTIRADA",
    "CERA_ESTAMPADA",
    "CERA_UNTADA",
}


# ==========================================================
# ESQUEMA DE UNA POSICIÓN DE MARCO
# ==========================================================
#
# Cada caja tiene 10 posiciones.
#
# Permite:
# - Registrar ubicación y contenido.
# - Transferir a otra colmena.
# - Retirar a bodega.
#
# No permite utilizar ambos destinos simultáneamente.
# ==========================================================

class InspeccionMarcoSchema(BaseModel):

    model_config = ConfigDict(
        from_attributes=True,
    )

    # Ubicación física.
    ubicacion: UbicacionMarco

    # Número de posición: 1 a 10.
    numero: int = Field(
        ge=1,
        le=10,
    )

    # Contenido observado.
    contenido: ContenidoMarco

    # Transferencia hacia otra colmena.
    transferido_a_colmena_id: int | None = Field(
        default=None,
        gt=0,
    )

    # ======================================================
    # S3-T05 - RETIRO A BODEGA
    # ======================================================
    #
    # False: el marco no se retira.
    # True: se solicita retirarlo a bodega.
    #
    # El servicio debe registrar el ingreso a inventario
    # dentro de la transacción de creación.
    # ======================================================

    retirar_a_bodega: bool = False

    # ======================================================
    # VALIDACIONES DE DESTINO
    # ======================================================

    @model_validator(mode="after")
    def validar_transferencia(self):

        # ----------------------------------------------
        # POSICIÓN VACÍA
        # ----------------------------------------------

        if (
            self.contenido == "SIN_MARCO"
            and self.transferido_a_colmena_id is not None
        ):
            raise ValueError(
                "No se puede transferir una "
                "posición SIN_MARCO"
            )

        # ----------------------------------------------
        # RETIRO A BODEGA
        # ----------------------------------------------

        if self.retirar_a_bodega:

            # Solamente marcos con cera o miel.
            if (
                self.contenido
                not in CONTENIDOS_PERMITIDOS_BODEGA
            ):
                raise ValueError(
                    "Solo los marcos con cera o miel "
                    "pueden retirarse a bodega"
                )

            # No permitir dos destinos.
            if (
                self.transferido_a_colmena_id
                is not None
            ):
                raise ValueError(
                    "No se puede retirar a bodega "
                    "y transferir el mismo marco "
                    "a otra colmena"
                )

        return self


# ==========================================================
# FUNCIÓN AUXILIAR - VALIDAR DETALLE DE MARCOS
# ==========================================================

def validar_posiciones_marcos(
    marcos: list[InspeccionMarcoSchema],
    tiene_alza: bool | None,
    cantidad_marcos: int | None,
):

    # ======================================================
    # DETALLE NO REGISTRADO
    # ======================================================
    #
    # Se permite para conservar compatibilidad
    # con inspecciones antiguas.
    # ======================================================

    if not marcos:
        return

    # ======================================================
    # EVITAR POSICIONES DUPLICADAS
    # ======================================================

    posiciones = [
        (marco.ubicacion, marco.numero)
        for marco in marcos
    ]

    if len(posiciones) != len(set(posiciones)):
        raise ValueError(
            "No se permiten posiciones "
            "de marcos duplicadas"
        )

    # ======================================================
    # SEPARAR CÁMARA DE CRÍA Y ALZA
    # ======================================================

    camara = [
        marco
        for marco in marcos
        if marco.ubicacion == "CAMARA_CRIA"
    ]

    alza = [
        marco
        for marco in marcos
        if marco.ubicacion == "ALZA"
    ]

    # ======================================================
    # VALIDAR CÁMARA DE CRÍA
    # ======================================================

    if len(camara) != 10:
        raise ValueError(
            "La cámara de cría debe registrar "
            "sus 10 posiciones"
        )

    # ======================================================
    # VALIDAR ALZA
    # ======================================================

    if tiene_alza is True:

        if len(alza) != 10:
            raise ValueError(
                "El alza debe registrar "
                "sus 10 posiciones"
            )

    elif alza:

        raise ValueError(
            "No se pueden registrar posiciones "
            "de alza si tiene_alza no es true"
        )

    # ======================================================
    # CONTAR MARCOS FÍSICAMENTE PRESENTES
    # ======================================================
    #
    # SIN_MARCO no cuenta como marco físico.
    #
    # La cantidad corresponde a lo observado
    # durante la inspección, antes de aplicar
    # movimientos de traslado o retiro.
    # ======================================================

    cantidad_real = sum(
        1
        for marco in marcos
        if marco.contenido != "SIN_MARCO"
    )

    # ======================================================
    # VALIDAR CANTIDAD DECLARADA
    # ======================================================

    if (
        cantidad_marcos is not None
        and cantidad_marcos != cantidad_real
    ):
        raise ValueError(
            f"cantidad_marcos indica "
            f"{cantidad_marcos}, "
            f"pero el detalle contiene "
            f"{cantidad_real} marcos presentes"
        )


# ==========================================================
# DATOS BASE DE UNA INSPECCIÓN
# ==========================================================

class InspeccionBase(BaseModel):

    # ======================================================
    # COLMENA INSPECCIONADA
    # ======================================================

    colmena_id: int = Field(
        gt=0,
    )

    # ======================================================
    # USUARIO RESPONSABLE
    # ======================================================
    #
    # El router reemplaza el valor recibido
    # por el usuario autenticado.
    # ======================================================

    usuario_id: int = Field(
        gt=0,
    )

    # ======================================================
    # ESTADO GENERAL
    # ======================================================

    estado_general: EstadoGeneral | None = None

    # ======================================================
    # REINA OBSERVADA
    # ======================================================

    reina_observada: bool | None = None

    # ======================================================
    # PRESENCIA DE CRÍA
    # ======================================================

    presencia_cria: bool | None = None

    # ======================================================
    # NIVEL DE POBLACIÓN
    # ======================================================

    nivel_poblacion: Nivel | None = None

    # ======================================================
    # RESERVAS DE ALIMENTO
    # ======================================================

    reservas_alimento: Nivel | None = None

    # ======================================================
    # CANTIDAD DE MARCOS
    # ======================================================
    #
    # Entre 0 y 20.
    # No incluye SIN_MARCO.
    # ======================================================

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0,
        le=20,
    )

    # ======================================================
    # PRESENCIA DE ALZA
    # ======================================================

    tiene_alza: bool | None = None

    # ======================================================
    # DETALLE INDIVIDUAL DE MARCOS
    # ======================================================

    marcos: list[InspeccionMarcoSchema] = Field(
        default_factory=list,
    )

    # ======================================================
    # NIVEL DE MIEL
    # ======================================================

    miel: str | None = Field(
        default=None,
        max_length=50,
    )

    # ======================================================
    # ALIMENTACIÓN SUMINISTRADA
    # ======================================================

    alimentacion_suministrada: str | None = Field(
        default=None,
        max_length=500,
    )

    # ======================================================
    # POSTURA
    # ======================================================

    postura: bool | None = None

    # ======================================================
    # SIGNOS DE ENFERMEDAD
    # ======================================================

    signos_enfermedad: bool = False

    # ======================================================
    # ENFERMEDAD OBSERVADA
    # ======================================================

    enfermedad_observada: str | None = None

    # ======================================================
    # TIRAS DE MEDICAMENTO
    # ======================================================
    #
    # Permite valores de 1 a 3.
    # None si no se aplicaron o registraron.
    # ======================================================

    tiras_medicamento: int | None = Field(
        default=None,
        ge=1,
        le=3,
    )

    # ======================================================
    # OBSERVACIONES GENERALES
    # ======================================================

    observaciones: str | None = None

    # ======================================================
    # VALIDACIÓN COMPLETA DE MARCOS
    # ======================================================

    @model_validator(mode="after")
    def validar_detalle_marcos(self):

        validar_posiciones_marcos(
            self.marcos,
            self.tiene_alza,
            self.cantidad_marcos,
        )

        return self


# ==========================================================
# CREAR INSPECCIÓN
# ==========================================================
#
# POST /inspecciones/
#
# Permite registrar:
# - Datos generales.
# - Detalle de marcos.
# - Transferencias.
# - Solicitudes de retiro a bodega.
# - Identificador móvil para sincronización.
# ==========================================================

class InspeccionCreate(InspeccionBase):

    # Fecha indicada por el usuario o dispositivo.
    fecha_inspeccion: datetime | None = None

    # Revisión por grupo.
    # Se conserva por compatibilidad histórica.
    sesion_revision_id: int | None = Field(
        default=None,
        gt=0,
    )

    # UUID para prevenir duplicación en reintentos móviles.
    id_cliente: UUID | None = None

    # ======================================================
    # VALIDAR FECHA DE INSPECCIÓN
    # ======================================================

    @model_validator(mode="after")
    def validar_fecha_inspeccion(self):

        fecha = self.fecha_inspeccion

        if fecha is None:
            return self

        # La fecha debe incorporar zona horaria.
        if (
            fecha.tzinfo is None
            or fecha.utcoffset() is None
        ):
            raise ValueError(
                "fecha_inspeccion debe incluir "
                "zona horaria"
            )

        # No permitir fechas futuras.
        if fecha > datetime.now(timezone.utc):
            raise ValueError(
                "La fecha de inspeccion "
                "no puede ser futura"
            )

        return self


# ==========================================================
# ACTUALIZAR INSPECCIÓN
# ==========================================================
#
# PATCH /inspecciones/{id}
#
# Los campos son opcionales.
#
# IMPORTANTE S3-T05:
# Editar una inspección histórica no puede generar
# movimientos nuevos de inventario.
# ==========================================================

class InspeccionUpdate(BaseModel):

    # ======================================================
    # CAMPOS GENERALES
    # ======================================================

    estado_general: EstadoGeneral | None = None

    reina_observada: bool | None = None

    presencia_cria: bool | None = None

    nivel_poblacion: Nivel | None = None

    reservas_alimento: Nivel | None = None

    cantidad_marcos: int | None = Field(
        default=None,
        ge=0,
        le=20,
    )

    tiene_alza: bool | None = None

    # ======================================================
    # DETALLE DE MARCOS
    # ======================================================
    #
    # None: no modificar el detalle.
    # []: eliminar el detalle.
    # Lista: reemplazar las posiciones.
    #
    # Las reglas de movimientos históricos
    # se comprueban también en el servicio.
    # ======================================================

    marcos: list[InspeccionMarcoSchema] | None = None

    # ======================================================
    # MIEL Y ALIMENTACIÓN
    # ======================================================

    miel: str | None = Field(
        default=None,
        max_length=50,
    )

    alimentacion_suministrada: str | None = Field(
        default=None,
        max_length=500,
    )

    # ======================================================
    # POSTURA Y ENFERMEDADES
    # ======================================================

    postura: bool | None = None

    signos_enfermedad: bool | None = None

    enfermedad_observada: str | None = None

    tiras_medicamento: int | None = Field(
        default=None,
        ge=1,
        le=3,
    )

    # ======================================================
    # OBSERVACIONES
    # ======================================================

    observaciones: str | None = None

    # ======================================================
    # VALIDAR ACTUALIZACIÓN DE MARCOS
    # ======================================================

    @model_validator(mode="after")
    def validar_marcos_actualizados(self):

        if self.marcos is not None:

            # ----------------------------------------------
            # S3-T05 - PROHIBIR RETIROS NUEVOS POR PATCH
            # ----------------------------------------------
            #
            # Los retiros se deben registrar al crear
            # la inspección. Esto evita contabilizarlos
            # dos veces al editar un registro anterior.
            # ----------------------------------------------

            if any(
                marco.retirar_a_bodega
                for marco in self.marcos
            ):
                raise ValueError(
                    "No se pueden registrar retiros "
                    "a bodega editando una "
                    "inspeccion historica"
                )

            # ----------------------------------------------
            # VALIDAR POSICIONES DUPLICADAS
            # ----------------------------------------------

            posiciones = [
                (marco.ubicacion, marco.numero)
                for marco in self.marcos
            ]

            if len(posiciones) != len(set(posiciones)):
                raise ValueError(
                    "No se permiten posiciones duplicadas"
                )

            # ----------------------------------------------
            # VALIDAR CANTIDAD Y ALZA
            # ----------------------------------------------

            if (
                self.marcos
                and self.tiene_alza is not None
            ):
                validar_posiciones_marcos(
                    self.marcos,
                    self.tiene_alza,
                    self.cantidad_marcos,
                )

        return self


# ==========================================================
# RESPUESTA DE LA API
# ==========================================================
#
# Se utiliza para entregar:
# - Datos de inspección.
# - Detalle de los marcos.
# - Destinos de transferencia.
# - Indicador de retiro a bodega.
# - Identificador de sincronización móvil.
# - Fechas y estado del registro.
# ==========================================================

class InspeccionResponse(InspeccionBase):

    # Identificador interno.
    id: int

    # Identificador generado por Mobile.
    id_cliente: UUID | None = None

    # Fecha de inspección.
    fecha_inspeccion: datetime

    # Baja lógica.
    activo: bool

    # Fechas de auditoría del registro.
    fecha_creacion: datetime

    fecha_actualizacion: datetime

    fecha_eliminacion: datetime | None

    # Permitir respuestas desde objetos SQLAlchemy.
    model_config = ConfigDict(
        from_attributes=True,
    )
