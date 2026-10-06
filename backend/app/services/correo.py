from email.message import EmailMessage
from pathlib import Path
import smtplib
from urllib.parse import quote

from pydantic_settings import BaseSettings, SettingsConfigDict


# ==========================================================
# UBICACIÓN DEL ARCHIVO .ENV
# ==========================================================

BACKEND_DIR = Path(__file__).resolve().parents[2]


# ==========================================================
# CONFIGURACIÓN SMTP
# ==========================================================
#
# Estos valores posteriormente estarán en backend/.env.
#
# Se dejan opcionales para que el backend pueda iniciar
# aunque todavía no configuremos el correo.
# ==========================================================

class EmailSettings(BaseSettings):

    SMTP_HOST: str | None = None

    SMTP_PORT: int = 587

    SMTP_USER: str | None = None

    SMTP_PASSWORD: str | None = None

    SMTP_FROM_EMAIL: str | None = None

    SMTP_FROM_NAME: str = (
        "Colmenares Tres Pinos"
    )

    SMTP_USE_TLS: bool = True

    SMTP_USE_SSL: bool = False

    PASSWORD_RESET_FRONTEND_URL: str = (
        "http://localhost:5173/restablecer-password"
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = EmailSettings()


# ==========================================================
# VALIDAR CONFIGURACIÓN SMTP
# ==========================================================

def configuracion_correo_disponible() -> bool:

    return all(
        [
            settings.SMTP_HOST,
            settings.SMTP_USER,
            settings.SMTP_PASSWORD,
            settings.SMTP_FROM_EMAIL
        ]
    )


# ==========================================================
# ENVIAR CORREO DE RECUPERACIÓN
# ==========================================================
#
# Recibe:
#
# - correo del usuario
# - token REAL
#
# El token solamente se utiliza para construir el enlace.
# El token real NO se guarda aquí ni se escribe en archivos.
# ==========================================================

def enviar_correo_recuperacion(
    destinatario: str,
    token: str
) -> bool:

    # ------------------------------------------------------
    # VALIDAR QUE SMTP ESTÉ CONFIGURADO
    # ------------------------------------------------------

    if not configuracion_correo_disponible():
        return False

    # ------------------------------------------------------
    # CONSTRUIR ENLACE DE RECUPERACIÓN
    # ------------------------------------------------------
    #
    # quote() protege caracteres especiales que pueda
    # contener el token.
    # ------------------------------------------------------

    token_url = quote(
        token,
        safe=""
    )

    enlace = (
        f"{settings.PASSWORD_RESET_FRONTEND_URL}"
        f"?token={token_url}"
    )

    # ------------------------------------------------------
    # CREAR MENSAJE
    # ------------------------------------------------------

    mensaje = EmailMessage()

    mensaje["Subject"] = (
        "Recuperación de contraseña - "
        "Colmenares Tres Pinos"
    )

    mensaje["From"] = (
        f"{settings.SMTP_FROM_NAME} "
        f"<{settings.SMTP_FROM_EMAIL}>"
    )

    mensaje["To"] = destinatario

    mensaje.set_content(
        f"""
Hola:

Se solicitó restablecer la contraseña de tu cuenta en
Colmenares Tres Pinos.

Puedes establecer una nueva contraseña utilizando el
siguiente enlace:

{enlace}

Este enlace tendrá una vigencia limitada de 15 minutos
y podrá utilizarse una sola vez.

Si tú no solicitaste este cambio, puedes ignorar este
correo.

Colmenares Tres Pinos
Sistema de Control de Colmenas
""".strip()
    )

    # ------------------------------------------------------
    # ENVIAR UTILIZANDO SSL
    # ------------------------------------------------------

    if settings.SMTP_USE_SSL:

        with smtplib.SMTP_SSL(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=15
        ) as servidor:

            servidor.login(
                settings.SMTP_USER,
                settings.SMTP_PASSWORD
            )

            servidor.send_message(
                mensaje
            )

        return True

    # ------------------------------------------------------
    # ENVIAR UTILIZANDO SMTP / STARTTLS
    # ------------------------------------------------------

    with smtplib.SMTP(
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        timeout=15
    ) as servidor:

        servidor.ehlo()

        if settings.SMTP_USE_TLS:

            servidor.starttls()

            servidor.ehlo()

        servidor.login(
            settings.SMTP_USER,
            settings.SMTP_PASSWORD
        )

        servidor.send_message(
            mensaje
        )

    return True