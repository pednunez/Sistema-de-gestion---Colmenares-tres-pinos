from pydantic import (
    BaseModel,
    Field,
    model_validator
)


# ==========================================================
# DATOS PARA INICIAR SESIÓN
# ==========================================================

class LoginRequest(BaseModel):

    email: str = Field(
        min_length=5,
        max_length=150
    )

    password: str = Field(
        min_length=8,
        max_length=128
    )


# ==========================================================
# RESPUESTA DEL LOGIN
# ==========================================================

# ==========================================================
# INFORMACIÓN DEL USUARIO AUTENTICADO
# ==========================================================

class UsuarioAutenticado(BaseModel):

    id: int

    nombre: str

    email: str

    rol: str


# ==========================================================
# RF-03 - SOLICITAR RECUPERACIÓN DE CONTRASEÑA
# ==========================================================
#
# El usuario solamente debe indicar su correo.
#
# IMPORTANTE:
#
# El endpoint posteriormente devolverá exactamente la misma
# respuesta exista o no exista la cuenta.
#
# Esto evita revelar qué correos están registrados.
# ==========================================================

class SolicitarRecuperacionPasswordRequest(BaseModel):

    email: str = Field(
        min_length=5,
        max_length=150
    )


# ==========================================================
# RF-03 - RESTABLECER CONTRASEÑA
# ==========================================================
#
# El usuario recibirá un token por correo.
#
# Para establecer una contraseña nueva tendrá que enviar:
#
# - token
# - nueva_password
# - confirmar_password
#
# Nunca se enviará ni almacenará la contraseña anterior.
# ==========================================================

class RestablecerPasswordRequest(BaseModel):

    token: str = Field(
        min_length=20,
        max_length=256
    )

    nueva_password: str = Field(
        min_length=8,
        max_length=128
    )

    confirmar_password: str = Field(
        min_length=8,
        max_length=128
    )

    # ------------------------------------------------------
    # VALIDAR QUE LAS DOS CONTRASEÑAS COINCIDAN
    # ------------------------------------------------------

    @model_validator(
        mode="after"
    )
    def validar_passwords(
        self
    ):
        if (
            self.nueva_password
            != self.confirmar_password
        ):
            raise ValueError(
                "Las contraseñas no coinciden"
            )

        return self


# ==========================================================
# RESPUESTA GENÉRICA
# ==========================================================
#
# Se utilizará, entre otros casos, para la solicitud de
# recuperación de contraseña.
#
# Ejemplo:
#
# {
#     "mensaje":
#     "Si el correo está registrado, recibirás instrucciones."
# }
#
# No revela si el correo existe.
# ==========================================================

class MensajeResponse(BaseModel):

    mensaje: str

class LoginResponse(BaseModel):
    usuario: UsuarioAutenticado
    csrf_token: str
