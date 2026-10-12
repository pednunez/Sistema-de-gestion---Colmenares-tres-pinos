
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship
)

from app.database import Base


# ==========================================================
# MODELO: INSPECCIÓN DE COLMENAS
# ==========================================================
#
# Almacena la información general de cada inspección.
#
# Incluye:
# - Colmena inspeccionada.
# - Usuario responsable.
# - Estado general.
# - Condiciones de la reina y cría.
# - Alimentación y miel.
# - Cantidad de marcos.
# - Presencia de alza.
# - Enfermedades y medicamentos.
# - Observaciones.
# - Historial y baja lógica.
#
# RELACIÓN:
# Una inspección puede tener múltiples marcos.
# ==========================================================

class Inspeccion(Base):

    __tablename__ = "inspecciones"

    # ======================================================
    # RESTRICCIONES DE INTEGRIDAD
    # ======================================================

    __table_args__ = (
        CheckConstraint(
            "tiras_medicamento IS NULL OR "
            "tiras_medicamento BETWEEN 1 AND 3",
            name="ck_inspecciones_tiras_medicamento"
        ),
    )

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    # ======================================================
    # COLMENA INSPECCIONADA
    # ======================================================

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    # ======================================================
    # USUARIO RESPONSABLE
    # ======================================================

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    # ======================================================
    # FECHA DE INSPECCIÓN
    # ======================================================

    fecha_inspeccion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # ESTADO GENERAL
    # ======================================================
    # BUENO / REGULAR / CRITICO
    # ======================================================

    estado_general: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    # ======================================================
    # REINA OBSERVADA
    # ======================================================

    reina_observada: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )

    # ======================================================
    # PRESENCIA DE CRÍA
    # ======================================================

    presencia_cria: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )

    # ======================================================
    # NIVEL DE POBLACIÓN
    # ======================================================
    # BAJO / MEDIO / ALTO
    # ======================================================

    nivel_poblacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    # ======================================================
    # RESERVAS DE ALIMENTO
    # ======================================================
    # BAJO / MEDIO / ALTO
    # ======================================================

    reservas_alimento: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    # ======================================================
    # CANTIDAD DE MARCOS OBSERVADOS
    # ======================================================
    #
    # Cantidad real de marcos presentes durante
    # esta inspección.
    #
    # No incluye posiciones con SIN_MARCO.
    #
    # Se conserva como nullable para permitir
    # inspecciones históricas sin este dato.
    # ======================================================

    cantidad_marcos: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    # ======================================================
    # PRESENCIA DE ALZA
    # ======================================================
    #
    # True:
    # La colmena tenía alza.
    #
    # False:
    # La colmena no tenía alza.
    #
    # None:
    # No se registró información.
    # ======================================================

    tiene_alza: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )

    # ======================================================
    # RF-27 - MIEL
    # ======================================================
    #
    # SIN_MIEL
    # POCA
    # MEDIA
    # ABUNDANTE
    # ======================================================

    miel: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True
    )

    # ======================================================
    # RF-28 - ALIMENTACIÓN SUMINISTRADA
    # ======================================================

    alimentacion_suministrada: Mapped[str | None] = (
        mapped_column(
            Text,
            nullable=True
        )
    )

    # ======================================================
    # RF-31 - POSTURA
    # ======================================================

    postura: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )

    # ======================================================
    # SIGNOS DE ENFERMEDAD
    # ======================================================

    signos_enfermedad: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false")
    )

    # ======================================================
    # ENFERMEDAD OBSERVADA
    # ======================================================

    enfermedad_observada: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # ======================================================
    # TIRAS DE MEDICAMENTO
    # ======================================================
    #
    # 1: una tira.
    # 2: dos tiras.
    # 3: tres tiras.
    #
    # None: no se aplicaron o no se registraron.
    #
    # La restricción de la tabla limita los valores
    # permitidos cuando se aplique la migración.
    # ======================================================

    tiras_medicamento: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )

    # ======================================================
    # OBSERVACIONES GENERALES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # ======================================================
    # ESTADO ACTIVO / BAJA LÓGICA
    # ======================================================

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true")
    )

    # ======================================================
    # FECHA DE CREACIÓN
    # ======================================================

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # FECHA DE ACTUALIZACIÓN
    # ======================================================

    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # FECHA DE ELIMINACIÓN
    # ======================================================

    fecha_eliminacion: Mapped[datetime | None] = (
        mapped_column(
            DateTime(timezone=True),
            nullable=True
        )
    )

    # ======================================================
    # NUEVO - RELACIÓN CON LOS MARCOS
    # ======================================================
    #
    # Relación uno a muchos (1:N).
    #
    # Una inspección puede contener:
    # - 10 posiciones de cámara de cría.
    # - 10 posiciones adicionales de alza.
    #
    # lazy="selectin":
    # Carga los marcos relacionados eficientemente
    # al consultar una o varias inspecciones.
    #
    # back_populates="inspeccion":
    # Relación inversa del modelo InspeccionMarco.
    # ======================================================

    marcos: Mapped[list["InspeccionMarco"]] = relationship(
        "InspeccionMarco",
        back_populates="inspeccion",
        lazy="selectin",
        order_by="(InspeccionMarco.ubicacion, InspeccionMarco.numero)"
    )
