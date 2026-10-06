from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    generar_hash_password,
    verificar_password
)
from app.models.usuario import Usuario


# ==========================================================
# CONFIGURACIÓN DE RECUPERACIÓN
# ==========================================================
#
# El token tendrá una duración corta.
#
# 15 minutos:
# suficiente para que el usuario pueda revisar su correo
# y restablecer la contraseña.
# ==========================================================

PASSWORD_RESET_EXPIRATION_MINUTES = 15


# ==========================================================
# LÍMITE ENTRE SOLICITUDES
# ==========================================================
#
# Evita solicitar decenas de correos de recuperación
# consecutivamente.
#
# Actualmente:
# 60 segundos entre solicitudes.
# ==========================================================

PASSWORD_RESET_COOLDOWN_SECONDS = 60


# ==========================================================
# BUSCAR USUARIO ACTIVO POR EMAIL
# ==========================================================

def obtener_usuario_por_email(
    db: Session,
    email: str
):
    consulta = select(
        Usuario
    ).where(
        Usuario.email == email,
        Usuario.activo == True
    )

    return db.scalar(
        consulta
    )


# ==========================================================
# AUTENTICAR USUARIO
# ==========================================================

def autenticar_usuario(
    db: Session,
    email: str,
    password: str
):
    usuario = obtener_usuario_por_email(
        db,
        email
    )

    # ------------------------------------------------------
    # USUARIO INEXISTENTE O INACTIVO
    # ------------------------------------------------------

    if usuario is None:
        return None

    # ------------------------------------------------------
    # VERIFICAR CONTRASEÑA
    # ------------------------------------------------------

    password_correcta = verificar_password(
        password,
        usuario.password_hash
    )

    if not password_correcta:
        return None

    return usuario


# ==========================================================
# GENERAR HASH SHA-256 DEL TOKEN
# ==========================================================
#
# El token real nunca se guarda en PostgreSQL.
#
# Ejemplo:
#
# token real:
# kY7...ABC
#
# Base de datos:
# sha256(token)
# ==========================================================

def generar_hash_token(
    token: str
) -> str:

    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


# ==========================================================
# GENERAR TOKEN DE RECUPERACIÓN
# ==========================================================
#
# Flujo:
#
# 1. Buscar usuario.
# 2. Verificar límite entre solicitudes.
# 3. Generar token aleatorio.
# 4. Crear hash SHA-256.
# 5. Guardar solamente el hash.
# 6. Guardar fecha de expiración.
# 7. Retornar el token REAL únicamente para enviarlo
#    posteriormente por correo.
#
# IMPORTANTE:
#
# El token real NO se guarda en PostgreSQL.
# ==========================================================

def crear_token_recuperacion(
    db: Session,
    email: str
):

    # ------------------------------------------------------
    # BUSCAR USUARIO
    # ------------------------------------------------------

    usuario = obtener_usuario_por_email(
        db,
        email
    )

    # ------------------------------------------------------
    # SI EL USUARIO NO EXISTE
    # ------------------------------------------------------
    #
    # Retornamos None.
    #
    # El router posteriormente devolverá el MISMO mensaje
    # tanto si el correo existe como si no existe.
    #
    # Así evitamos enumeración de usuarios.
    # ------------------------------------------------------

    if usuario is None:
        return None

    ahora = datetime.now(
        timezone.utc
    )

    # ------------------------------------------------------
    # CONTROLAR FRECUENCIA DE SOLICITUDES
    # ------------------------------------------------------

    if (
        usuario.password_reset_solicitado_en
        is not None
    ):

        ultima_solicitud = (
            usuario.password_reset_solicitado_en
        )

        # --------------------------------------------------
        # Algunos drivers pueden devolver datetime sin zona.
        # Normalizamos a UTC para evitar errores de comparación.
        # --------------------------------------------------

        if ultima_solicitud.tzinfo is None:
            ultima_solicitud = (
                ultima_solicitud.replace(
                    tzinfo=timezone.utc
                )
            )

        segundos_transcurridos = (
            ahora - ultima_solicitud
        ).total_seconds()

        if (
            segundos_transcurridos
            < PASSWORD_RESET_COOLDOWN_SECONDS
        ):
            return None

    # ------------------------------------------------------
    # GENERAR TOKEN CRIPTOGRÁFICAMENTE SEGURO
    # ------------------------------------------------------
    #
    # token_urlsafe utiliza una fuente criptográfica segura.
    #
    # El token será suficientemente largo para impedir
    # ataques de fuerza bruta.
    # ------------------------------------------------------

    token = secrets.token_urlsafe(
        32
    )

    # ------------------------------------------------------
    # GENERAR HASH DEL TOKEN
    # ------------------------------------------------------

    token_hash = generar_hash_token(
        token
    )

    # ------------------------------------------------------
    # GUARDAR TOKEN HASH
    # ------------------------------------------------------

    usuario.password_reset_token_hash = (
        token_hash
    )

    # ------------------------------------------------------
    # GUARDAR FECHA DE EXPIRACIÓN
    # ------------------------------------------------------

    usuario.password_reset_expira_en = (
        ahora
        + timedelta(
            minutes=PASSWORD_RESET_EXPIRATION_MINUTES
        )
    )

    # ------------------------------------------------------
    # GUARDAR FECHA DE SOLICITUD
    # ------------------------------------------------------

    usuario.password_reset_solicitado_en = (
        ahora
    )

    usuario.fecha_actualizacion = (
        ahora
    )

    # ------------------------------------------------------
    # GUARDAR EN BASE DE DATOS
    # ------------------------------------------------------

    try:

        db.commit()

    except Exception:

        db.rollback()

        raise

    # ------------------------------------------------------
    # RETORNAR TOKEN REAL
    # ------------------------------------------------------
    #
    # SOLO debe utilizarse posteriormente para enviarlo
    # al correo electrónico.
    #
    # Nunca debe devolverse directamente como respuesta
    # pública de la API.
    # ------------------------------------------------------

    return token


# ==========================================================
# RESTABLECER CONTRASEÑA
# ==========================================================
#
# Recibe:
#
# - token real
# - nueva contraseña
#
# El sistema:
#
# 1. genera SHA-256 del token recibido;
# 2. busca un usuario con ese hash;
# 3. comprueba que el token no haya expirado;
# 4. cambia la contraseña;
# 5. elimina inmediatamente el token;
# 6. el token deja de poder utilizarse.
# ==========================================================

def restablecer_password(
    db: Session,
    token: str,
    nueva_password: str
) -> bool:

    ahora = datetime.now(
        timezone.utc
    )

    # ------------------------------------------------------
    # GENERAR HASH DEL TOKEN RECIBIDO
    # ------------------------------------------------------

    token_hash = generar_hash_token(
        token
    )

    # ------------------------------------------------------
    # BUSCAR TOKEN VÁLIDO
    # ------------------------------------------------------
    #
    # También bloqueamos temporalmente la fila durante la
    # transacción para reducir el riesgo de que el mismo
    # token se utilice simultáneamente dos veces.
    # ------------------------------------------------------

    consulta = (
        select(Usuario)
        .where(
            Usuario.password_reset_token_hash
            == token_hash,
            Usuario.password_reset_expira_en
            > ahora,
            Usuario.activo == True
        )
        .with_for_update()
    )

    usuario = db.scalar(
        consulta
    )

    # ------------------------------------------------------
    # TOKEN INVÁLIDO O EXPIRADO
    # ------------------------------------------------------

    if usuario is None:

        db.rollback()

        return False

    # ------------------------------------------------------
    # GENERAR NUEVO HASH ARGON2
    # ------------------------------------------------------

    nuevo_hash = generar_hash_password(
        nueva_password
    )

    # ------------------------------------------------------
    # CAMBIAR CONTRASEÑA
    # ------------------------------------------------------

    usuario.version_sesion += 1
    usuario.password_hash = (
        nuevo_hash
    )

    # ------------------------------------------------------
    # INVALIDAR TOKEN INMEDIATAMENTE
    # ------------------------------------------------------
    #
    # Esto garantiza que sea de un solo uso.
    # ------------------------------------------------------

    usuario.password_reset_token_hash = None

    usuario.password_reset_expira_en = None

    # Conservamos password_reset_solicitado_en para tener
    # referencia de la última solicitud realizada.

    usuario.fecha_actualizacion = (
        ahora
    )

    # ------------------------------------------------------
    # GUARDAR CAMBIOS
    # ------------------------------------------------------

    try:

        db.commit()

    except Exception:

        db.rollback()

        raise

    return True