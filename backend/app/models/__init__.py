
# ==========================================================
# MODELOS SQLALCHEMY - COLMENARES TRES PINOS
# ==========================================================
#
# Este archivo registra los modelos de la aplicacion
# para que SQLAlchemy y Alembic puedan reconocerlos.
#
# Se conservan todos los modelos existentes.
# ==========================================================


# ==========================================================
# MODELOS PRINCIPALES DEL SISTEMA
# ==========================================================

from app.models.apiario import Apiario

from app.models.colmena import Colmena

from app.models.usuario import Usuario

from app.models.inspeccion import Inspeccion

from app.models.inspeccion_marco import InspeccionMarco

from app.models.tratamiento import Tratamiento

from app.models.transferencia_marco import TransferenciaMarco

from app.models.auditoria import Auditoria


# ==========================================================
# INVENTARIO GENERAL DE MATERIALES
# ==========================================================
#
# Almacena cantidades por material, ubicacion,
# colmena y estado.
#
# BODEGA e INSTALADO permanecen separados.
# ==========================================================

from app.models.inventario_stock import InventarioStock


# ==========================================================
# HISTORIAL DE MOVIMIENTOS DEL INVENTARIO
# ==========================================================
#
# Registra ingresos, retiros, traslados,
# danos, reparaciones y bajas.
# ==========================================================

from app.models.inventario_movimiento import InventarioMovimiento


# ==========================================================
# INCIDENCIAS Y REPARACIONES
# ==========================================================
#
# Permite registrar materiales danados, rotos,
# en reparacion y dados de baja.
# ==========================================================

from app.models.inventario_incidencia import InventarioIncidencia


# ==========================================================
# CONFIGURACION DE MINIMOS DE STOCK
# ==========================================================
#
# NUEVO MODELO
#
# Guarda el minimo configurado para cada uno
# de los siete materiales utilizados en
# el modulo Stock del frontend de Pedro.
#
# No almacena cantidades fisicas.
# No duplica el inventario.
# ==========================================================

from app.models.stock_minimo import StockMinimo


# ==========================================================
# GRUPOS O FILAS DE COLMENAS (PB-06)
# ==========================================================
#
# Grupos por apiario e historial de asignaciones.
# ==========================================================

from app.models.grupo import GrupoColmena, GrupoColmenaAsignacion


# ==========================================================
# SESIONES DE REVISION POR GRUPO (D-07 / S2-T16)
# ==========================================================

from app.models.revision import SesionRevision, SesionRevisionColmena
