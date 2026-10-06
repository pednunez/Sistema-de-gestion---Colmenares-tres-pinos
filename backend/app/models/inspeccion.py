from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    text
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Inspeccion(Base):
    __tablename__ = "inspecciones"

    # ======================================================
    # IDENTIFICADOR DE LA INSPECCIÓN
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    # ======================================================
    # COLMENA INSPECCIONADA
    # ======================================================
    #
    # Relaciona la inspección con una colmena existente.
    # ======================================================

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=False
    )

    # ======================================================
    # USUARIO QUE REALIZÓ LA INSPECCIÓN
    # ======================================================
    #
    # Permite saber qué apicultor o administrador realizó
    # el registro.
    # ======================================================

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False
    )

    # ======================================================
    # FECHA DE LA INSPECCIÓN
    # ======================================================

    fecha_inspeccion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP")
    )

    # ======================================================
    # ESTADO GENERAL
    # ======================================================
    #
    # Valores que actualmente maneja el schema:
    #
    # BUENO
    # REGULAR
    # CRITICO
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
    #
    # Actualmente:
    #
    # BAJO
    # MEDIO
    # ALTO
    # ======================================================

    nivel_poblacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    # ======================================================
    # RESERVAS DE ALIMENTO
    # ======================================================

    reservas_alimento: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    # ======================================================
    # CANTIDAD DE MARCOS OBSERVADOS
    # ======================================================
    #
    # RF-25 / RF-40 / RF-41
    #
    # Guarda cuántos marcos tenía la colmena al momento
    # exacto de realizar esta inspección.
    #
    # Ejemplo:
    #
    # 06-10-2026 -> 10 marcos
    # 15-10-2026 -> 8 marcos
    # 22-10-2026 -> 11 marcos
    #
    # Así podemos conservar el historial aunque la cantidad
    # actual de marcos de la colmena cambie posteriormente.
    #
    # nullable=True:
    #
    # Lo dejamos opcional porque ya existen inspecciones
    # antiguas en la base de datos que fueron creadas antes
    # de implementar este campo.
    #
    # De esta manera esas inspecciones podrán tener NULL,
    # en lugar de inventar que tenían 0 marcos.
    # ======================================================

    cantidad_marcos: Mapped[int | None] = mapped_column(
        Integer,
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
    # OBSERVACIONES GENERALES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # ======================================================
    # ESTADO ACTIVO / BAJA LÓGICA
    # ======================================================
    #
    # No eliminamos físicamente las inspecciones.
    #
    # activo = True  -> registro vigente
    # activo = False -> inspección anulada
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
    # FECHA DE ELIMINACIÓN / ANULACIÓN
    # ======================================================

    fecha_eliminacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )