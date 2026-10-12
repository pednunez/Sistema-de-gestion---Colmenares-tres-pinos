
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Identity
)

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship
)

from app.database import Base


# ==========================================================
# MODELO: MARCOS REGISTRADOS EN UNA INSPECCIÓN
# ==========================================================
#
# Guarda una posición individual de una caja.
#
# Cada inspección puede registrar:
#
# CAMARA_CRIA:
# Posiciones 1 al 10.
#
# ALZA:
# Posiciones 1 al 10.
#
# Una posición SIN_MARCO indica que no había
# marco físicamente presente en ese espacio.
#
# No debe contarse en cantidad_marcos.
# ==========================================================

class InspeccionMarco(Base):

    __tablename__ = "inspeccion_marcos"

    # ======================================================
    # RESTRICCIONES DE INTEGRIDAD
    # ======================================================

    __table_args__ = (

        # No puede repetirse la misma posición
        # dentro de la misma caja e inspección.

        UniqueConstraint(
            "inspeccion_id",
            "ubicacion",
            "numero",
            name="uq_inspeccion_marco_posicion"
        ),

        # Posiciones permitidas.

        CheckConstraint(
            "numero BETWEEN 1 AND 10",
            name="ck_inspeccion_marco_numero"
        ),

        # Ubicaciones válidas.

        CheckConstraint(
            "ubicacion IN ('CAMARA_CRIA', 'ALZA')",
            name="ck_inspeccion_marco_ubicacion"
        ),

        # Contenidos permitidos.

        CheckConstraint(
            "contenido IN ("
            "'MIEL_Y_CRIA', "
            "'SOLO_CRIA', "
            "'SOLO_MIEL', "
            "'CERA_ESTIRADA', "
            "'CERA_ESTAMPADA', "
            "'CERA_UNTADA', "
            "'SIN_MARCO'"
            ")",
            name="ck_inspeccion_marco_contenido"
        ),
    )

    # ======================================================
    # IDENTIFICADOR
    # ======================================================
    #
    # PostgreSQL genera automáticamente los ID.
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True
    )

    # ======================================================
    # INSPECCIÓN PRINCIPAL
    # ======================================================

    inspeccion_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("inspecciones.id"),
        nullable=False,
        index=True
    )

    # ======================================================
    # UBICACIÓN DEL MARCO
    # ======================================================
    #
    # CAMARA_CRIA
    # ALZA
    # ======================================================

    ubicacion: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    # ======================================================
    # NÚMERO DE POSICIÓN
    # ======================================================
    #
    # Valores entre 1 y 10.
    # ======================================================

    numero: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    # ======================================================
    # CONTENIDO DEL MARCO
    # ======================================================
    #
    # MIEL_Y_CRIA
    # SOLO_CRIA
    # SOLO_MIEL
    # CERA_ESTIRADA
    # CERA_ESTAMPADA
    # CERA_UNTADA
    # SIN_MARCO
    # ======================================================

    contenido: Mapped[str] = mapped_column(
        String(30),
        nullable=False
    )

    # ======================================================
    # COLMENA DESTINO DE UNA TRANSFERENCIA
    # ======================================================
    #
    # Si el marco se transfirió:
    # Guarda el ID de la colmena destino.
    #
    # Si no se transfirió:
    # Permanece NULL.
    #
    # Importante:
    # El registro de una transferencia se incorporará
    # posteriormente en el servicio de inspecciones.
    # ======================================================

    transferido_a_colmena_id: Mapped[int | None] = (
        mapped_column(
            BigInteger,
            ForeignKey("colmenas.id"),
            nullable=True
        )
    )

    # ======================================================
    # RELACIÓN INVERSA CON LA INSPECCIÓN
    # ======================================================
    #
    # Cada marco pertenece a una inspección.
    #
    # back_populates="marcos":
    # Conecta con la relación del modelo Inspeccion.
    # ======================================================

    inspeccion: Mapped["Inspeccion"] = relationship(
        "Inspeccion",
        back_populates="marcos"
    )
