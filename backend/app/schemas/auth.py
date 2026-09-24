from pydantic import BaseModel, Field


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

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ==========================================================
# INFORMACIÓN DEL USUARIO AUTENTICADO
# ==========================================================

class UsuarioAutenticado(BaseModel):
    id: int
    nombre: str
    email: str
    rol: str