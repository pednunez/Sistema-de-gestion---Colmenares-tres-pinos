import json
import logging
import re
import sys
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from uuid import uuid4


# ==========================================================
# REGISTRO ESTRUCTURADO Y CORRELATION ID (RNF-57)
# ==========================================================
#
# Cada peticion lleva un X-Correlation-ID. Si el cliente no
# lo envia, o no es valido, se genera uno nuevo.
#
# - Se devuelve en la respuesta con el mismo header.
# - Todo log emitido durante la peticion lo incluye.
# - Cada peticion deja una linea JSON con metodo, ruta,
#   estado y duracion.
#
# No se registran parametros de la URL ni el cuerpo:
# pueden contener datos personales o credenciales.
# ==========================================================

HEADER = "X-Correlation-ID"

# Letras, numeros, punto, guion y guion bajo. Hasta 128.
FORMATO_VALIDO = re.compile(r"^[A-Za-z0-9._-]{1,128}$")

correlation_id_actual: ContextVar[str | None] = ContextVar(
    "correlation_id",
    default=None,
)

logger_peticiones = logging.getLogger("app.peticiones")


# ==========================================================
# FORMATO JSON
# ==========================================================

class FormatoJSON(logging.Formatter):

    # Campos propios de LogRecord que no se copian como extra.
    CAMPOS_BASE = set(
        logging.LogRecord("", 0, "", 0, "", None, None).__dict__
    ) | {"message", "asctime"}

    def format(self, record: logging.LogRecord) -> str:

        datos = {
            "fecha": datetime.fromtimestamp(
                record.created,
                tz=timezone.utc,
            ).isoformat(),
            "nivel": record.levelname,
            "logger": record.name,
            "mensaje": record.getMessage(),
            "correlation_id": correlation_id_actual.get(),
        }

        for campo, valor in record.__dict__.items():
            if campo not in self.CAMPOS_BASE:
                datos[campo] = valor

        if record.exc_info:
            datos["error"] = self.formatException(record.exc_info)

        return json.dumps(
            datos,
            ensure_ascii=False,
            default=str,
        )


def configurar_logging(nivel: int = logging.INFO) -> None:
    """Envia los logs de la app a stdout en formato JSON."""

    raiz = logging.getLogger("app")

    if any(
        isinstance(h.formatter, FormatoJSON)
        for h in raiz.handlers
    ):
        return

    salida = logging.StreamHandler(sys.stdout)
    salida.setFormatter(FormatoJSON())

    raiz.addHandler(salida)
    raiz.setLevel(nivel)
    raiz.propagate = False


def obtener_correlation_id(valor: str | None) -> str:
    """Usa el ID recibido si es valido; si no, genera uno."""

    if valor and FORMATO_VALIDO.match(valor):
        return valor

    return str(uuid4())


# ==========================================================
# MIDDLEWARE ASGI
# ==========================================================

class CorrelationIdMiddleware:

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):

        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        recibido = None

        for nombre, valor in scope.get("headers", []):
            if nombre.lower() == HEADER.lower().encode():
                recibido = valor.decode("latin-1")
                break

        correlation_id = obtener_correlation_id(recibido)
        token = correlation_id_actual.set(correlation_id)

        inicio = time.perf_counter()
        estado = 500

        async def enviar(mensaje):
            nonlocal estado

            if mensaje["type"] == "http.response.start":
                estado = mensaje["status"]
                headers = [
                    (n, v)
                    for n, v in mensaje.get("headers", [])
                    if n.lower() != HEADER.lower().encode()
                ]
                headers.append(
                    (HEADER.encode(), correlation_id.encode())
                )
                mensaje["headers"] = headers

            await send(mensaje)

        try:
            await self.app(scope, receive, enviar)
        finally:
            logger_peticiones.info(
                "peticion",
                extra={
                    "metodo": scope.get("method"),
                    "ruta": scope.get("path"),
                    "estado": estado,
                    "duracion_ms": round(
                        (time.perf_counter() - inicio) * 1000,
                        1,
                    ),
                },
            )
            correlation_id_actual.reset(token)
