from sqlalchemy import BigInteger, Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Apiario(Base):
    __tablename__ = "apiarios"

    id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True
    )

    nombre: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False
    )

    ubicacion: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    descripcion: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    activo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True
    )

    fecha_creacion: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    fecha_actualizacion: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )

    fecha_eliminacion: Mapped[object | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )