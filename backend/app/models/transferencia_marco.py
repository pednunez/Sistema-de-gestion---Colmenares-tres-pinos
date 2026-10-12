
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# MODELO: DETALLE DE MARCOS DE UNA INSPECCIÓN
# ==========================================================

class InspeccionMarco(Base):

    __tablename__ = "inspeccion_marcos"

    # ======================================================
    # RESTRICCIONES DE INTEGRIDAD
    # ======================================================

    __table_args__ = (
        UniqueConstraint(
            "inspeccion_id",
            "ubicacion",
            "numero",
            name="uq_inspeccion_marco_posicion"
        ),
        CheckConstraint(
            "numero BETWEEN 1 AND 10",
            name="ck_inspeccion_marco_numero"
        ),
        CheckConstraint(
            "ubicacion IN ('CAMARA_CRIA', 'ALZA')",
            name="ck_inspeccion_marco_ubicacion"
        ),
        CheckConstraint(
            "contenido IN ("
            "'MIEL_Y_CRIA', 'SOLO_CRIA', 'SOLO_MIEL', "
            "'CERA_ESTIRADA', 'CERA_ESTAMPADA', "
            "'CERA_UNTADA', 'SIN_MARCO')",
            name="ck_inspeccion_marco_contenido"
        ),
    )

    # ======================================================
    # IDENTIFICADOR
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=True
    )

    # ======================================================
    # INSPECCIÓN A LA QUE PERTENECE
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
    # CAMARA_CRIA o ALZA
    # ======================================================

    ubicacion: Mapped[str] = mapped_column(
        String(20),
        nullable=False
    )

    # ======================================================
    # POSICIÓN DEL MARCO
    # ======================================================
    # Número del 1 al 10 dentro de su caja.
    # ======================================================

    numero: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )

    # ======================================================
    # CONTENIDO OBSERVADO
    # ======================================================

    contenido: Mapped[str] = mapped_column(
        String(30),
        nullable=False
    )

    # ======================================================
    # COLMENA A LA QUE SE TRANSFIERE
    # ======================================================
    # NULL cuando el marco no fue transferido.
    # ======================================================

    transferido_a_colmena_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True
    )
