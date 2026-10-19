
# ==========================================================
# MODELOS SQLALCHEMY - COLMENARES TRES PINOS
# ==========================================================

# ==========================================================
# MODELOS EXISTENTES
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
# NUEVO MODULO: INVENTARIO GENERAL
# ==========================================================

# Cantidades por material, ubicacion y estado.
from app.models.inventario_stock import InventarioStock

# Historial de entradas, salidas, traslados y reparaciones.
from app.models.inventario_movimiento import InventarioMovimiento

# Identificacion y seguimiento de materiales danados.
from app.models.inventario_incidencia import InventarioIncidencia
