import logging
import secrets
from fastapi import Request, Response
from sqlalchemy import update

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status
)
from sqlalchemy.orm import Session

from app.core.auth import crear_access_token
from app.core.dependencies import obtener_usuario_actual, validar_origen
from app.database import get_db, settings
from app.models.usuario import Usuario

from app.schemas.auth import (
    LoginRequest,
    MensajeResponse,
    RestablecerPasswordRequest,
    SolicitarRecuperacionPasswordRequest,
    LoginResponse,
    UsuarioAutenticado
)

from app.services import auth as auth_service
from app.services import correo as correo_service


# ==========================================================
# LOGGER
# ==========================================================

logger = logging.getLogger(__name__)


# ==========================================================
# ROUTER
# ==========================================================

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"]
)


# ==========================================================
# LOGIN
# ==========================================================

@router.post(
    "/login",
    response_model=LoginResponse
)
def login(
    datos: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    validar_origen(request)
    usuario = auth_service.autenticar_usuario(
        db,
        datos.email,
        datos.password
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos"
        )

    csrf = secrets.token_urlsafe(32)
    token = crear_access_token(
        usuario_id=usuario.id,
        email=usuario.email,
        rol=usuario.rol,
        version_sesion=usuario.version_sesion,
        csrf_token=csrf
    )
    response.headers["Cache-Control"] = "no-store"
    response.set_cookie(settings.SESSION_COOKIE_NAME, token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
        secure=settings.SESSION_COOKIE_SECURE, httponly=True,
        samesite=settings.SESSION_COOKIE_SAMESITE)
    return LoginResponse(usuario=UsuarioAutenticado(id=usuario.id, nombre=usuario.nombre,
        email=usuario.email, rol=usuario.rol), csrf_token=csrf)


@router.get("/csrf")
def obtener_csrf(request: Request, response: Response,
                 usuario: Usuario = Depends(obtener_usuario_actual)):
    response.headers["Cache-Control"] = "no-store"
    return {"csrf_token": request.state.csrf_token}


@router.post("/logout", response_model=MensajeResponse)
def logout(response: Response, usuario: Usuario = Depends(obtener_usuario_actual),
           db: Session = Depends(get_db)):
    # Revoca todas las sesiones de esta cuenta, incluso copias de la cookie.
    db.execute(update(Usuario).where(Usuario.id == usuario.id).values(
        version_sesion=Usuario.version_sesion + 1))
    db.commit()
    response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/",
        secure=settings.SESSION_COOKIE_SECURE, httponly=True,
        samesite=settings.SESSION_COOKIE_SAMESITE)
    response.headers["Cache-Control"] = "no-store"
    return MensajeResponse(mensaje="Todas las sesiones de la cuenta fueron cerradas.")


# ==========================================================
# USUARIO ACTUAL
# ==========================================================

@router.get(
    "/me",
    response_model=UsuarioAutenticado
)
def obtener_mi_usuario(
    usuario: Usuario = Depends(
        obtener_usuario_actual
    )
):
    return UsuarioAutenticado(
        id=usuario.id,
        nombre=usuario.nombre,
        email=usuario.email,
        rol=usuario.rol
    )


# ==========================================================
# RF-03 - SOLICITAR RECUPERACIÓN DE CONTRASEÑA
# ==========================================================
#
# Endpoint:
#
# POST /auth/recuperar-password
#
# Flujo:
#
# 1. Usuario ingresa su correo.
# 2. Se busca la cuenta.
# 3. Si existe, se genera un token seguro.
# 4. PostgreSQL guarda solamente el hash del token.
# 5. El token real se envía por correo.
# 6. La API siempre devuelve el mismo mensaje.
#
# IMPORTANTE:
#
# No se informa si el correo existe o no.
#
# Esto evita enumeración de usuarios.
# ==========================================================

@router.post(
    "/recuperar-password",
    response_model=MensajeResponse,
    status_code=status.HTTP_200_OK
)
def solicitar_recuperacion_password(
    datos: SolicitarRecuperacionPasswordRequest,
    db: Session = Depends(get_db)
):
    # ------------------------------------------------------
    # MENSAJE GENÉRICO
    # ------------------------------------------------------
    #
    # Este mensaje se devuelve siempre:
    #
    # - correo existente
    # - correo inexistente
    # - solicitud dentro del cooldown
    #
    # De esta manera no revelamos qué usuarios existen.
    # ------------------------------------------------------

    mensaje_generico = (
        "Si el correo está registrado, recibirás "
        "instrucciones para restablecer tu contraseña."
    )

    # ------------------------------------------------------
    # NORMALIZAR CORREO
    # ------------------------------------------------------

    email = datos.email.strip().lower()

    # ------------------------------------------------------
    # CREAR TOKEN DE RECUPERACIÓN
    # ------------------------------------------------------

    token = auth_service.crear_token_recuperacion(
        db,
        email
    )

    # ------------------------------------------------------
    # SI NO SE GENERÓ TOKEN
    # ------------------------------------------------------
    #
    # Puede significar:
    #
    # - el correo no existe;
    # - el usuario está inactivo;
    # - todavía está dentro del límite de 60 segundos.
    #
    # Nunca diferenciamos esos casos públicamente.
    # ------------------------------------------------------

    if token is None:

        return MensajeResponse(
            mensaje=mensaje_generico
        )

    # ------------------------------------------------------
    # ENVIAR CORREO
    # ------------------------------------------------------
    #
    # El token real solamente se utiliza en este punto.
    #
    # Nunca se devuelve al cliente.
    # ------------------------------------------------------

    try:

        enviado = correo_service.enviar_correo_recuperacion(
            destinatario=email,
            token=token
        )

        # --------------------------------------------------
        # SMTP TODAVÍA NO CONFIGURADO
        # --------------------------------------------------
        #
        # Durante desarrollo puede ocurrir que todavía no
        # tengamos configuradas las variables SMTP.
        #
        # No revelamos esta información al usuario.
        # --------------------------------------------------

        if not enviado:

            logger.warning(
                "No se envió correo de recuperación: "
                "SMTP no configurado."
            )

    except Exception:

        # --------------------------------------------------
        # NO EXPONER ERRORES SMTP AL CLIENTE
        # --------------------------------------------------
        #
        # Un fallo del servidor de correo no debe revelar
        # información sobre la existencia de la cuenta.
        #
        # El detalle queda solamente en logs del backend.
        # --------------------------------------------------

        logger.exception(
            "Error al enviar correo de recuperación."
        )

    # ------------------------------------------------------
    # RESPUESTA SIEMPRE GENÉRICA
    # ------------------------------------------------------

    return MensajeResponse(
        mensaje=mensaje_generico
    )


# ==========================================================
# RF-03 - RESTABLECER CONTRASEÑA
# ==========================================================
#
# Endpoint:
#
# POST /auth/restablecer-password
#
# Recibe:
#
# - token
# - nueva_password
# - confirmar_password
#
# El schema ya valida que las dos contraseñas coincidan.
#
# El service:
#
# - genera SHA-256(token);
# - encuentra el usuario;
# - valida expiración;
# - genera el nuevo hash Argon2;
# - elimina el token;
# - lo deja inutilizable.
# ==========================================================

@router.post(
    "/restablecer-password",
    response_model=MensajeResponse,
    status_code=status.HTTP_200_OK
)
def restablecer_password(
    datos: RestablecerPasswordRequest,
    db: Session = Depends(get_db)
):
    resultado = auth_service.restablecer_password(
        db=db,
        token=datos.token,
        nueva_password=datos.nueva_password
    )

    # ------------------------------------------------------
    # TOKEN INVÁLIDO O EXPIRADO
    # ------------------------------------------------------

    if not resultado:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El enlace de recuperación es inválido "
                "o ha expirado"
            )
        )

    # ------------------------------------------------------
    # CONTRASEÑA ACTUALIZADA
    # ------------------------------------------------------

    return MensajeResponse(
        mensaje=(
            "La contraseña fue actualizada correctamente."
        )
    )