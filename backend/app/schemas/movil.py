from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


# ==========================================================
# CATALOGO PARA LA APP MOVIL (GET /movil/catalogo)
# ==========================================================
#
# Todo lo que la app necesita para trabajar sin senal:
# resolver un QR a su colmena, elegir destinos de
# transferencia, recorrer grupos y finalizar tratamientos.
# ==========================================================

class ApiarioCatalogo(BaseModel):
    id: int
    nombre: str
    ubicacion: str | None


class ColmenaCatalogo(BaseModel):
    id: int
    codigo: str
    codigo_qr: UUID
    apiario_id: int
    estado: str
    cantidad_marcos: int | None


class GrupoCatalogo(BaseModel):
    id: int
    apiario_id: int
    nombre: str
    # En el orden en que se recorren en terreno (por codigo).
    colmena_ids: list[int]


class TratamientoCatalogo(BaseModel):
    id: int
    colmena_id: int
    tipo_tratamiento: str
    producto: str | None
    dosis: str | None
    fecha_inicio: date


class OpcionesCatalogo(BaseModel):
    """Valores que acepta la API, para validar en el telefono."""

    estado_general: list[str]
    nivel: list[str]
    nivel_miel: list[str]
    contenido_marco: list[str]
    ubicacion_marco: list[str]
    estado_tratamiento: list[str]


class UsuarioCatalogo(BaseModel):
    id: int
    nombre: str
    rol: str


class CatalogoMovilResponse(BaseModel):
    # Hora del servidor: la app la guarda como "catalogo al".
    generado_en: datetime
    usuario: UsuarioCatalogo
    apiarios: list[ApiarioCatalogo]
    colmenas: list[ColmenaCatalogo]
    grupos: list[GrupoCatalogo]
    tratamientos_en_curso: list[TratamientoCatalogo]
    opciones: OpcionesCatalogo
