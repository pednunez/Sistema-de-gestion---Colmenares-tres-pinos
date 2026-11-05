"""S3-T06 - Planificador PURO de capacidad e intercambio de marcos.

No accede a la base de datos, no escribe stock y no ejecuta commit.
Recibe estados de posiciones comprobados y produce una propuesta de
nuevo estado; la transaccion de inspeccion/transferencia la aplicara.

Invariantes:
- Cada piso presente dispone de 10 posiciones numeradas del 1 al 10.
- SIN_MARCO no es un marco fisico.
- Cuando hay lugar se ocupa la primera posicion libre.
- Cuando el piso esta lleno debe seleccionarse una posicion ocupada.
- Un marco desplazado con cria vuelve a la posicion liberada del origen.
- Cera/miel desplazada se envia a bodega; jamas se descarta silenciosamente.
"""

from dataclasses import dataclass
from typing import Literal, TypedDict


Ubicacion = Literal["CAMARA_CRIA", "ALZA"]
AccionDesplazado = Literal["INTERCAMBIO", "BODEGA"]

CONTENIDOS_VALIDOS = frozenset({
    "MIEL_Y_CRIA", "SOLO_CRIA", "SOLO_MIEL", "CERA_ESTIRADA",
    "CERA_ESTAMPADA", "CERA_UNTADA", "SIN_MARCO",
})

MATERIALES_BODEGA = {
    "SOLO_MIEL": "MARCO_MIEL",
    "CERA_ESTIRADA": "MARCO_CERA_ESTIRADA",
    "CERA_ESTAMPADA": "MARCO_CERA_ESTAMPADA",
    "CERA_UNTADA": "MARCO_CERA_UNTADA",
}

CONTENIDOS_CON_CRIA = frozenset({"MIEL_Y_CRIA", "SOLO_CRIA"})


class Posicion(TypedDict):
    numero: int
    contenido: str


@dataclass
class EstadoColmena:
    camara_cria: list[Posicion]
    alza: list[Posicion] | None = None


@dataclass
class PlanTransferencia:
    origen: EstadoColmena
    destino: EstadoColmena
    numero_colocado: int
    accion_desplazado: AccionDesplazado | None = None
    contenido_desplazado: str | None = None
    material_bodega: str | None = None


def _copiar_y_validar(estado: EstadoColmena, nombre: str) -> EstadoColmena:
    """Devuelve una copia, validando la integridad de las 10 posiciones."""
    if estado is None or estado.camara_cria is None:
        raise ValueError(f"No se conoce el estado de marcos de {nombre}")

    def validar_piso(piso: list[Posicion], etiqueta: str) -> list[Posicion]:
        if not isinstance(piso, list) or len(piso) != 10:
            raise ValueError(f"{nombre}: {etiqueta} debe tener 10 posiciones")
        mapeo = {}
        for posicion in piso:
            if not isinstance(posicion, dict):
                raise ValueError(f"{nombre}: posicion invalida en {etiqueta}")
            numero = posicion.get("numero")
            contenido = posicion.get("contenido")
            if (
                type(numero) is not int
                or numero not in range(1, 11)
                or numero in mapeo
                or contenido not in CONTENIDOS_VALIDOS
            ):
                raise ValueError(f"{nombre}: posiciones invalidas en {etiqueta}")
            mapeo[numero] = {"numero": numero, "contenido": contenido}
        if len(mapeo) != 10:
            raise ValueError(f"{nombre}: {etiqueta} tiene posiciones faltantes")
        return [mapeo[numero] for numero in range(1, 11)]

    return EstadoColmena(
        camara_cria=validar_piso(estado.camara_cria, "CAMARA_CRIA"),
        alza=(
            None if estado.alza is None
            else validar_piso(estado.alza, "ALZA")
        ),
    )


def _obtener_piso(estado: EstadoColmena, ubicacion: Ubicacion) -> list[Posicion]:
    if ubicacion == "CAMARA_CRIA":
        return estado.camara_cria
    if ubicacion == "ALZA" and estado.alza is not None:
        return estado.alza
    raise ValueError(f"No existe el piso de destino/origen: {ubicacion}")


def planificar_transferencia(
    *,
    estado_origen: EstadoColmena,
    estado_destino: EstadoColmena,
    ubicacion_origen: Ubicacion,
    numero_origen: int,
    ubicacion_destino: Ubicacion,
    marco_desplazado_numero: int | None = None,
    contenido_marco: str | None = None,
) -> PlanTransferencia:
    """Planifica el movimiento sin mutar entradas ni registrar movimientos.

    Requiere posiciones reales y consistentes de origen y destino. El
    servicio de persistencia debe bloquear las colmenas y aplicar el plan,
    actualizar cantidades, auditoria y bodega en UNA transaccion.
    """
    if ubicacion_origen not in ("CAMARA_CRIA", "ALZA"):
        raise ValueError("ubicacion_origen invalida")
    if ubicacion_destino not in ("CAMARA_CRIA", "ALZA"):
        raise ValueError("ubicacion_destino invalida")
    if type(numero_origen) is not int or not 1 <= numero_origen <= 10:
        raise ValueError("numero_origen debe estar entre 1 y 10")
    if marco_desplazado_numero is not None and (
        type(marco_desplazado_numero) is not int
        or not 1 <= marco_desplazado_numero <= 10
    ):
        raise ValueError("marco_desplazado_numero debe estar entre 1 y 10")

    origen = _copiar_y_validar(estado_origen, "origen")
    destino = _copiar_y_validar(estado_destino, "destino")
    piso_origen = _obtener_piso(origen, ubicacion_origen)
    piso_destino = _obtener_piso(destino, ubicacion_destino)

    fuente = piso_origen[numero_origen - 1]
    contenido = fuente["contenido"]
    if contenido == "SIN_MARCO":
        raise ValueError("La posicion de origen no contiene un marco")
    if contenido_marco is not None and contenido_marco != contenido:
        raise ValueError("El contenido informado no coincide con la posicion de origen")

    posiciones_libres = [p for p in piso_destino if p["contenido"] == "SIN_MARCO"]
    if posiciones_libres:
        if marco_desplazado_numero is not None:
            raise ValueError("No corresponde desplazar un marco: existen posiciones libres")
        receptor = posiciones_libres[0]
        numero_colocado = receptor["numero"]
        fuente["contenido"] = "SIN_MARCO"
        receptor["contenido"] = contenido
        return PlanTransferencia(
            origen=origen,
            destino=destino,
            numero_colocado=numero_colocado,
        )

    if marco_desplazado_numero is None:
        raise ValueError(
            "El piso de destino esta lleno: indica marco_desplazado_numero"
        )

    receptor = piso_destino[marco_desplazado_numero - 1]
    desplazado = receptor["contenido"]
    if desplazado == "SIN_MARCO":
        raise ValueError("La posicion desplazada debe contener un marco")

    fuente["contenido"] = "SIN_MARCO"
    receptor["contenido"] = contenido

    if desplazado in CONTENIDOS_CON_CRIA:
        fuente["contenido"] = desplazado
        return PlanTransferencia(
            origen=origen,
            destino=destino,
            numero_colocado=marco_desplazado_numero,
            accion_desplazado="INTERCAMBIO",
            contenido_desplazado=desplazado,
        )

    material = MATERIALES_BODEGA.get(desplazado)
    if material is None:
        raise ValueError("Contenido desplazado no permitido para bodega")
    return PlanTransferencia(
        origen=origen,
        destino=destino,
        numero_colocado=marco_desplazado_numero,
        accion_desplazado="BODEGA",
        contenido_desplazado=desplazado,
        material_bodega=material,
    )
