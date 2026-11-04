from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ColmenaMarcoEstado(Base):
    __tablename__ = "colmena_marcos_estado"
    __table_args__ = (
        CheckConstraint(
            "ubicacion IN ('CAMARA_CRIA', 'ALZA')",
            name="ck_colmena_marcos_estado_ubicacion",
        ),
        CheckConstraint(
            "numero BETWEEN 1 AND 10",
            name="ck_colmena_marcos_estado_numero",
        ),
        CheckConstraint(
            "contenido IN ("
            "'MIEL_Y_CRIA', 'SOLO_CRIA', 'SOLO_MIEL', "
            "'CERA_ESTIRADA', 'CERA_ESTAMPADA', "
            "'CERA_UNTADA', 'SIN_MARCO'"
            ")",
            name="ck_colmena_marcos_estado_contenido",
        ),
    )

    colmena_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ubicacion: Mapped[str] = mapped_column(
        String(20),
        primary_key=True,
    )
    numero: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )
    contenido: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    fecha_actualizacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
