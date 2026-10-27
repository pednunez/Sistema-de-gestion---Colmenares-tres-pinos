
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    text,
)

from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# ==========================================================
# HISTORIAL DE MOVIMIENTOS - COLMENARES TRES PINOS
# ==========================================================
#
# Esta tabla registra todos los movimientos realizados
# en el inventario de materiales.
#
# INGRESO:
# Incorporar materiales al inventario.
#
# RETIRO:
# Retirar materiales del inventario.
#
# TRASLADO:
# Mover materiales entre bodega y colmenas.
#
# DANAR:
# Cambiar materiales disponibles a DANADO.
#
# ROMPER:
# Cambiar materiales a ROTO.
#
# INICIAR_REPARACION:
# Cambiar materiales a EN_REPARACION.
#
# REPARAR:
# Recuperar materiales para volver a utilizarlos.
#
# BAJA:
# Retirar definitivamente materiales del inventario.
#
# AJUSTE_INICIAL:
# Registrar el conteo inicial del inventario.
#
# Los movimientos se conservan para trazabilidad.
# ==========================================================


class InventarioMovimiento(Base):

    __tablename__ = "inventario_movimientos"

    __table_args__ = (

        # ==================================================
        # CANTIDAD POSITIVA
        # ==================================================

        CheckConstraint(
            "cantidad > 0",
            name="ck_inv_mov_cantidad_positiva",
        ),

        # ==================================================
        # MATERIALES PERMITIDOS
        # ==================================================
        #
        # Se conservan los seis materiales originales
        # y se agregan los cinco nuevos.
        #
        # Debe coincidir con inventario_stock.py
        # y con la migracion Alembic.
        # ==================================================

        CheckConstraint(
            "material IN ("
            "'MARCO', "
            "'ALZA', "
            "'CAJON', "
            "'TAPA', "
            "'TECHO_LATA', "
            "'TECHO', "
            "'TECHO_AMERICANO', "
            "'MARCO_VACIO', "
            "'MARCO_CERA_ESTIRADA', "
            "'MARCO_CERA_UNTADA', "
            "'ENTRETAPA', "
            "'PISO'"
            ")",
            name="ck_inv_mov_material",
        ),

        # ==================================================
        # TIPOS DE MOVIMIENTO
        # ==================================================
        #
        # Se mantienen los tipos internos actuales.
        # Los nombres del frontend se adaptaran
        # posteriormente en el endpoint /stock/.
        # ==================================================

        CheckConstraint(
            "tipo_movimiento IN ("
            "'INGRESO', "
            "'RETIRO', "
            "'TRASLADO', "
            "'DANAR', "
            "'ROMPER', "
            "'INICIAR_REPARACION', "
            "'REPARAR', "
            "'BAJA', "
            "'AJUSTE_INICIAL'"
            ")",
            name="ck_inv_mov_tipo",
        ),

        # ==================================================
        # UBICACION DE ORIGEN
        # ==================================================

        CheckConstraint(
            "origen_ubicacion IS NULL "
            "OR origen_ubicacion IN ("
            "'BODEGA', 'INSTALADO'"
            ")",
            name="ck_inv_mov_origen_ubicacion",
        ),

        # ==================================================
        # UBICACION DE DESTINO
        # ==================================================

        CheckConstraint(
            "destino_ubicacion IS NULL "
            "OR destino_ubicacion IN ("
            "'BODEGA', 'INSTALADO'"
            ")",
            name="ck_inv_mov_destino_ubicacion",
        ),

        # ==================================================
        # ESTADO DE ORIGEN
        # ==================================================

        CheckConstraint(
            "origen_estado IS NULL "
            "OR origen_estado IN ("
            "'BUENO', "
            "'DANADO', "
            "'ROTO', "
            "'EN_REPARACION', "
            "'REPARADO'"
            ")",
            name="ck_inv_mov_origen_estado",
        ),

        # ==================================================
        # ESTADO DE DESTINO
        # ==================================================

        CheckConstraint(
            "destino_estado IS NULL "
            "OR destino_estado IN ("
            "'BUENO', "
            "'DANADO', "
            "'ROTO', "
            "'EN_REPARACION', "
            "'REPARADO'"
            ")",
            name="ck_inv_mov_destino_estado",
        ),

        # ==================================================
        # VALIDAR COLMENA DE ORIGEN
        # ==================================================
        #
        # Si el origen es INSTALADO,
        # debe existir colmena_origen_id.
        # ==================================================

        CheckConstraint(
            "("
            "origen_ubicacion IS NULL "
            "AND colmena_origen_id IS NULL"
            ") OR ("
            "origen_ubicacion = 'BODEGA' "
            "AND colmena_origen_id IS NULL"
            ") OR ("
            "origen_ubicacion = 'INSTALADO' "
            "AND colmena_origen_id IS NOT NULL"
            ")",
            name="ck_inv_mov_origen_colmena",
        ),

        # ==================================================
        # VALIDAR COLMENA DE DESTINO
        # ==================================================
        #
        # Si el destino es INSTALADO,
        # debe existir colmena_destino_id.
        # ==================================================

        CheckConstraint(
            "("
            "destino_ubicacion IS NULL "
            "AND colmena_destino_id IS NULL"
            ") OR ("
            "destino_ubicacion = 'BODEGA' "
            "AND colmena_destino_id IS NULL"
            ") OR ("
            "destino_ubicacion = 'INSTALADO' "
            "AND colmena_destino_id IS NOT NULL"
            ")",
            name="ck_inv_mov_destino_colmena",
        ),

        # ==================================================
        # EXIGIR ORIGEN O DESTINO
        # ==================================================

        CheckConstraint(
            "origen_ubicacion IS NOT NULL "
            "OR destino_ubicacion IS NOT NULL",
            name="ck_inv_mov_requiere_ubicacion",
        ),

        # ==================================================
        # INDICES PARA CONSULTAS
        # ==================================================

        Index(
            "idx_inv_mov_material",
            "material",
        ),

        Index(
            "idx_inv_mov_fecha",
            "fecha_creacion",
        ),

        Index(
            "idx_inv_mov_usuario",
            "usuario_id",
        ),
    )

    # ======================================================
    # IDENTIFICADOR DEL MOVIMIENTO
    # ======================================================

    id: Mapped[int] = mapped_column(
        BigInteger,
        Identity(always=True),
        primary_key=True,
    )

    # ======================================================
    # MATERIAL
    # ======================================================

    material: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # ======================================================
    # TIPO DE MOVIMIENTO
    # ======================================================

    tipo_movimiento: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    # ======================================================
    # CANTIDAD MOVILIZADA
    # ======================================================

    cantidad: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # ======================================================
    # UBICACION DE ORIGEN
    # ======================================================

    origen_ubicacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # ======================================================
    # COLMENA DE ORIGEN
    # ======================================================

    colmena_origen_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    # ======================================================
    # ESTADO ANTERIOR DEL MATERIAL
    # ======================================================

    origen_estado: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # ======================================================
    # UBICACION DE DESTINO
    # ======================================================

    destino_ubicacion: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # ======================================================
    # COLMENA DE DESTINO
    # ======================================================

    colmena_destino_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    # ======================================================
    # DESTINO INFORMADO EN UNA SALIDA (ENVIO)
    # ======================================================
    #
    # Solo referencia: la salida no suma stock en el
    # apiario ni en la colmena.
    # ======================================================

    salida_apiario_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("apiarios.id"),
        nullable=True,
    )

    salida_colmena_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("colmenas.id"),
        nullable=True,
    )

    # ======================================================
    # ESTADO NUEVO DEL MATERIAL
    # ======================================================

    destino_estado: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    # ======================================================
    # USUARIO RESPONSABLE
    # ======================================================

    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )

    # ======================================================
    # OBSERVACIONES
    # ======================================================

    observaciones: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ======================================================
    # FECHA DEL MOVIMIENTO
    # ======================================================

    fecha_creacion: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
