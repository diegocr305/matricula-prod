import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

# La clave secreta del JWT se lee desde el entorno; el valor por defecto
# solo aplica en desarrollo. En producción DEBE definirse JWT_SECRET_KEY.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "slep_valparaiso_clave_secreta_super_segura")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

def verificar_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def obtener_password_hash(password):
    return pwd_context.hash(password)

def crear_token_acceso(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def obtener_usuario_actual(token: str = Depends(oauth2_scheme)):
    credenciales_excepcion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub") is None:
            raise credenciales_excepcion
        return payload
    except JWTError:
        raise credenciales_excepcion


def verificar_escritura(usuario_actual: dict = Depends(obtener_usuario_actual)):
    """
    Guardián que bloquea peticiones POST, PUT y DELETE para perfiles visualizadores.
    """
    roles_solo_lectura = ["Visualizador_SLEP", "Visualizador_Colegio"]
    
    if usuario_actual.get("rol") in roles_solo_lectura:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Modo Visualizador: Su perfil no tiene permisos para realizar modificaciones en el sistema."
        )
    return usuario_actual