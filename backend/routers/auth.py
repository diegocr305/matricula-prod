# routers/auth.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from schemas import LoginRequest

# Importamos la capa de servicio
from services import auth_service

router = APIRouter(tags=["Autenticación"])

# Conservamos el esquema aquí ya que es específico de la ruta
class GoogleLoginRequest(BaseModel):
    token: str
    # El rol ya NO se usa: el login con Google determina el rol por el correo.
    # Se mantiene opcional por retrocompatibilidad con clientes antiguos.
    rol: Optional[str] = None

@router.post("/login")
def login(credenciales: LoginRequest):
    return auth_service.login_tradicional_service(credenciales)

@router.post("/login/google")
def login_google(credenciales: GoogleLoginRequest):
    return auth_service.login_google_service(credenciales)