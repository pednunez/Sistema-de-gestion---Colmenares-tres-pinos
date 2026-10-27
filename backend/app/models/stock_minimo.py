
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Integer,
    String,
    func,
    text,
)

from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from app.database import Base


# ==========================================================
# CONFIGURACION DE MINIMOS DE STOCK
# COLMENARES TRES PINOS
# ==========================================================
#
# Este modelo permite configurar la cantidad minima
# deseada para cada material almacenado en BODEGA.
#
# IMPORTANTE:
#
# 1. No guarda existencias fisicas.
# 2. No modifica inventario_stock.
# 3. No registra movimientos.
# 4. No duplica materiales instalados.
#
# Las existencias reales se consultan desde:
#
# inventario_stock
#
# Un minimo es solamente una configuracion
# utilizada para detectar stock bajo.
#
# Ejemplo:
#
# Material: ALZA
# Minimo: 10
#
# Si quedan 5 alzas disponibles en bodega,
# el frontend podra mostrar una alerta.
#
# ==========================================================


class StockMinimo(Base):

    # ======================================================
    # NOMBRE DE TABLA EN POSTGRESQL
    # ======================================================

    __tablename__ = "stock_minimos"

    # ======================================================
    # RESTRICCIONES DE INTEGRIDAD
    # ======================================================

    __table_args__ = (

        # ==================================================
        # MATERIALES ADMITIDOS POR EL FRONTEND
        # ==================================================
        #
        # Solo se permite configurar minimos para
        # los siete materiales acordados con Pedro.
        #
        # Los otros materiales del inventario general
        # mantienen su compatibilidad, pero no se
        # incorporan a esta configuracion.
        # ==================================================

        CheckConstraint(
            "material IN ("
            "'CAJON', "
            "'ALZA', "
            "'MARCO_VACIO', "
            "'MARCO_CERA_ESTIRADA', "
            "'MARCO_CERA_UNTADA', "
            "'TECHO', "
            "'TECHO_AMERICANO', "
            "'ENTRETAPA', "
            "'PISO'"
            ")",
            name="ck_stock_minimos_material",
        ),

        # ==================================================
        # NO PERMITIR MINIMOS NEGATIVOS
        # ==================================================
        #
        # Permitido: 0, 1, 2, 3...
        # No permitido: -1, -2...
        # ==================================================

        CheckConstraint(
            "minimo >= 0",
            name="ck_stock_minimos_no_negativo",
        ),
    )

    # ======================================================
    # IDENTIFICADOR DEL MATERIAL
    # ======================================================
    #
    # Cada material solamente puede tener un minimo.
    #
    # Se utiliza como clave primaria para impedir
    # configuraciones duplicadas del mismo material.
    # ======================================================

    material: Mapped[str] = mapped_column(
        String(30),
        primary_key=True,
        nullable=False,
    )

    # ======================================================
    # CANTIDAD MINIMA CONFIGURADA
    # ======================================================
    #
    # Debe ser un numero entero mayor o igual a cero.
    #
    # Si el material no tiene una fila en esta tabla,
    # significa que no tiene minimo configurado.
    # ======================================================

    minimo: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # FECHA DE ULTIMA CONFIGURACION
    # ======================================================
    #
    # PostgreSQL establece la fecha inicial.
    #
    # SQLAlchemy actualiza la fecha cuando modifica
    # este registro mediante una operacion UPDATE.
    # ======================================================

    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=func.now(),
    )
