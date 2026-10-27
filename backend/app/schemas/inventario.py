
from datetime import datetime
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


# ==========================================================
# SCHEMAS DE INVENTARIO - COLMENARES TRES PINOS
# ==========================================================
#
# Define las validaciones y respuestas de los
# endpoints del inventario general.
#
# Mantiene compatibilidad con los materiales originales
# e incorpora los nuevos materiales de bodega.
# ==========================================================


# ==========================================================
# MATERIALES PERMITIDOS
# ==========================================================
#
# Se conservan los seis materiales originales
# y se incorporan cinco nuevos.
#
# Total: 12 identificadores.
#
# Deben coincidir con las restricciones de PostgreSQL.
# ==========================================================

MaterialInventario = Literal[
    "MARCO",
    "ALZA",
    "CAJON",
    "TAPA",
    "TECHO_LATA",
    "TECHO",
    "TECHO_AMERICANO",
    "MARCO_VACIO",
    "MARCO_CERA_ESTIRADA",
    "MARCO_CERA_UNTADA",
    "ENTRETAPA",
    "PISO",
]


# ==========================================================
# ESTADOS PERMITIDOS
# ==========================================================

EstadoInventario = Literal[
    "BUENO",
    "DANADO",
    "ROTO",
    "EN_REPARACION",
    "REPARADO",
]


# ==========================================================
# UBICACIONES PERMITIDAS
# ==========================================================

UbicacionInventario = Literal[
    "BODEGA",
    "INSTALADO",
]


# ==========================================================
# RESPUESTA DE STOCK
# ==========================================================

class InventarioStockResponse(BaseModel):

    id: int

    material: MaterialInventario

    ubicacion: UbicacionInventario

    colmena_id: int | None

    estado: EstadoInventario

    cantidad: int = Field(ge=0)

    fecha_actualizacion: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


# ==========================================================
# SOLICITUD DE MOVIMIENTOS
# ==========================================================
#
# Estos son los movimientos del inventario general.
#
# Las operaciones especificas del frontend de Pedro
# se implementaran en POST /stock/movimientos/.
#
# No modificamos los tipos actuales para conservar
# compatibilidad con los endpoints existentes.
# ==========================================================

class InventarioMovimientoCreate(BaseModel):

    material: MaterialInventario

    tipo_movimiento: Literal[
        "INGRESO",
        "RETIRO",
        "TRASLADO",
    ]

    cantidad: int = Field(gt=0)

    estado: EstadoInventario = "BUENO"

    origen_ubicacion: UbicacionInventario | None = None

    colmena_origen_id: int | None = Field(
        default=None,
        gt=0,
    )

    destino_ubicacion: UbicacionInventario | None = None

    colmena_destino_id: int | None = Field(
        default=None,
        gt=0,
    )

    observaciones: str | None = None

    # ======================================================
    # VALIDAR MOVIMIENTO
    # ======================================================

    @model_validator(mode="after")
    def validar_movimiento(self):

        # ==================================================
        # VALIDAR UBICACION DE ORIGEN
        # ==================================================

        if self.origen_ubicacion == "BODEGA":

            if self.colmena_origen_id is not None:
                raise ValueError(
                    "La bodega no requiere colmena de origen"
                )

        elif self.origen_ubicacion == "INSTALADO":

            if self.colmena_origen_id is None:
                raise ValueError(
                    "Debe indicar la colmena de origen"
                )

        elif self.colmena_origen_id is not None:

            raise ValueError(
                "Debe indicar la ubicacion de origen"
            )

        # ==================================================
        # VALIDAR UBICACION DE DESTINO
        # ==================================================

        if self.destino_ubicacion == "BODEGA":

            if self.colmena_destino_id is not None:
                raise ValueError(
                    "La bodega no requiere colmena de destino"
                )

        elif self.destino_ubicacion == "INSTALADO":

            if self.colmena_destino_id is None:
                raise ValueError(
                    "Debe indicar la colmena de destino"
                )

        elif self.colmena_destino_id is not None:

            raise ValueError(
                "Debe indicar la ubicacion de destino"
            )

        # ==================================================
        # VALIDAR INGRESO
        # ==================================================

        if self.tipo_movimiento == "INGRESO":

            if self.origen_ubicacion is not None:
                raise ValueError(
                    "Un ingreso no debe tener origen"
                )

            if self.destino_ubicacion is None:
                raise ValueError(
                    "Un ingreso requiere destino"
                )

        # ==================================================
        # VALIDAR RETIRO
        # ==================================================

        elif self.tipo_movimiento == "RETIRO":

            if self.origen_ubicacion is None:
                raise ValueError(
                    "Un retiro requiere origen"
                )

            if self.destino_ubicacion is not None:
                raise ValueError(
                    "Un retiro no debe tener destino"
                )

        # ==================================================
        # VALIDAR TRASLADO
        # ==================================================

        elif self.tipo_movimiento == "TRASLADO":

            if (
                self.origen_ubicacion is None
                or self.destino_ubicacion is None
            ):
                raise ValueError(
                    "Un traslado requiere origen y destino"
                )

            origen = (
                self.origen_ubicacion,
                self.colmena_origen_id,
            )

            destino = (
                self.destino_ubicacion,
                self.colmena_destino_id,
            )

            if origen == destino:
                raise ValueError(
                    "El origen y destino deben ser diferentes"
                )

        return self


# ==========================================================
# RESPUESTA DEL HISTORIAL DE MOVIMIENTOS
# ==========================================================

class InventarioMovimientoResponse(BaseModel):

    id: int

    material: MaterialInventario

    tipo_movimiento: str

    cantidad: int

    origen_ubicacion: UbicacionInventario | None

    colmena_origen_id: int | None

    origen_estado: EstadoInventario | None

    destino_ubicacion: UbicacionInventario | None

    colmena_destino_id: int | None

    destino_estado: EstadoInventario | None

    usuario_id: int

    observaciones: str | None

    fecha_creacion: datetime

    model_config = ConfigDict(
        from_attributes=True
    )


# ==========================================================
# REGISTRAR MATERIAL DANADO O ROTO
# ==========================================================

class InventarioIncidenciaCreate(BaseModel):

    material: MaterialInventario

    tipo_dano: Literal[
        "DANADO",
        "ROTO",
    ]

    estado_origen: Literal[
        "BUENO",
        "REPARADO",
    ] = "BUENO"

    ubicacion_detectada: UbicacionInventario

    colmena_detectada_id: int | None = Field(
        default=None,
        gt=0,
    )

    cantidad_afectada: int = Field(gt=0)

    descripcion_dano: str = Field(
        min_length=3,
    )

    observaciones: str | None = None

    # ======================================================
    # VALIDAR UBICACION DE LA INCIDENCIA
    # ======================================================

    @model_validator(mode="after")
    def validar_ubicacion(self):

        if self.ubicacion_detectada == "BODEGA":

            if self.colmena_detectada_id is not None:
                raise ValueError(
                    "En bodega no debe indicar colmena"
                )

        elif self.colmena_detectada_id is None:

            raise ValueError(
                "Debe indicar la colmena donde ocurrio el dano"
            )

        return self


# ==========================================================
# ACTUALIZAR REPARACION
# ==========================================================

class InventarioReparacionCreate(BaseModel):

    accion: Literal[
        "INICIAR_REPARACION",
        "FINALIZAR_REPARACION",
        "BAJA",
    ]

    cantidad: int = Field(gt=0)

    detalle_reparacion: str | None = None

    observaciones: str | None = None


# ==========================================================
# RESPUESTA DE INCIDENCIAS
# ==========================================================

class InventarioIncidenciaResponse(BaseModel):

    id: int

    material: MaterialInventario

    tipo_dano: Literal[
        "DANADO",
        "ROTO",
    ]

    ubicacion_detectada: UbicacionInventario

    colmena_detectada_id: int | None

    cantidad_afectada: int

    cantidad_pendiente: int

    cantidad_en_reparacion: int

    cantidad_reparada: int

    cantidad_baja: int

    descripcion_dano: str

    detalle_reparacion: str | None

    observaciones: str | None

    usuario_reporte_id: int

    fecha_deteccion: datetime

    fecha_actualizacion: datetime

    fecha_cierre: datetime | None

    model_config = ConfigDict(
        from_attributes=True
    )


# ==========================================================
# RESUMEN GENERAL DEL INVENTARIO
# ==========================================================
#
# No suma colmenas.cantidad_marcos por separado.
#
# Cada material debe contarse una sola vez segun
# su ubicacion real en inventario_stock.
# ==========================================================

class InventarioResumenMaterial(BaseModel):

    material: MaterialInventario

    bodega: int = Field(ge=0)

    instalado: int = Field(ge=0)

    bueno: int = Field(ge=0)

    danado: int = Field(ge=0)

    roto: int = Field(ge=0)

    en_reparacion: int = Field(ge=0)

    reparado: int = Field(ge=0)

    disponibles: int = Field(ge=0)

    total: int = Field(ge=0)


class InventarioResumenResponse(BaseModel):

    materiales: list[InventarioResumenMaterial]

    total_bodega: int = Field(ge=0)

    total_instalado: int = Field(ge=0)

    total_disponible: int = Field(ge=0)

    total_general: int = Field(ge=0)
