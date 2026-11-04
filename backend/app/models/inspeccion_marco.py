from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Identity,
    text,
)

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.database import Base

if TYPE_CHECKING:
    from app.models.inspeccion import Inspeccion


# ==========================================================
# SISTEMA DE GESTION - COLMENARES TRES PINOS
# MODELO DE MARCOS DE INSPECCION
# S3-T05 - RETIRO DE MARCOS A BODEGA
# ==========================================================


class InspeccionMarco(Base):

    __tablename__ = "inspeccion_marcos"

    # ======================================================
    # RESTRICCIONES DE INTEGRIDAD
    # ======================================================

    __table_args__ = (

        # No repetir posiciones en una misma inspeccion.
        UniqueConstraint(
            "inspeccion_id",
            "ubicacion",
            "numero",
            name="uq_inspeccion_marco_posicion",
        ),

        # Cada caja admite 10 posiciones.
        CheckConstraint(
            "numero BETWEEN 1 AND 10",
            name="ck_inspeccion_marco_numero",
        ),

        # Ubicaciones permitidas.
        CheckConstraint(
            "ubicacion IN ('CAMARA_CRIA', 'ALZA')",
            name="ck_inspeccion_marco_ubicacion",
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
            name="ck_inspeccion_marco_contenido",
        ),

        # S3-T05: los marcos con cría y las posiciones
        # vacías no pueden retirarse a bodega.
        # Tampoco pueden tener dos destinos.
        CheckConstraint(
            "NOT retirar_a_bodega OR ("
            "contenido IN ("
            "'SOLO_MIEL', "
            "'CERA_ESTIRADA', "
            "'CERA_ESTAMPADA', "
            "'CERA_UNTADA'"
            ") AND transferido_a_colmena_id IS NULL"
            ")",
            name="ck_inspeccion_marco_retiro_bodega",
        ),
    )

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(),
        primary_key=True,
    )

    # ======================================================
    # INSPECCION PRINCIPAL
    # ======================================================

    inspeccion_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("inspecciones.id"),
        nullable=False,
        index=True,
    )

    # ======================================================
    # UBICACION DEL MARCO
    # ======================================================

    ubicacion: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # ======================================================
    # NUMERO DE POSICION
    # ======================================================

    numero: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # CONTENIDO OBSERVADO
    # ======================================================

    contenido: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # ======================================================
    # TRANSFERENCIA HACIA OTRA COLMENA
    # ======================================================

    transferido_a_colmena_id: Mapped[int | None] = (
        mapped_column(
            BigInteger,
            ForeignKey("colmenas.id"),
            nullable=True,
        )
    )

    # ======================================================
    # S3-T05 - RETIRO A BODEGA
    # ======================================================
    #
    # False:
    # El marco no fue retirado a bodega.
    #
    # True:
    # El marco fue retirado durante la inspeccion.
    #
    # Se conserva el valor historico para mostrar
    # el movimiento en el detalle de inspeccion.
    # ======================================================

    retirar_a_bodega: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    # ======================================================
    # RELACION CON LA INSPECCION
    # ======================================================

    inspeccion: Mapped["Inspeccion"] = relationship(
        "Inspeccion",
        back_populates="marcos",
    )
