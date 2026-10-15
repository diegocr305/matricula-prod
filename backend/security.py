from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
import roles as roles_catalogo

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

def verificar_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def obtener_password_hash(password):
    return pwd_context.hash(password)

def crear_token_acceso(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def obtener_usuario_actual(
    token_header: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token")
):
    token = token_header or token_query
    credenciales_excepcion = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido o expirado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credenciales_excepcion
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
    Delega en el catálogo central de roles (roles.py).
    """
    if not roles_catalogo.puede_escribir(usuario_actual.get("rol")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Modo Visualizador: Su perfil no tiene permisos para realizar modificaciones en el sistema."
        )
    return usuario_actual


def es_usuario_slep(usuario_actual: dict) -> bool:
    """Retorna True si el usuario tiene rol institucional de nivel central (SLEP / admin)."""
    if not usuario_actual:
        return False
    return roles_catalogo.es_slep(usuario_actual.get("rol"))


def es_usuario_colegio(usuario_actual: dict) -> bool:
    """Retorna True si el usuario pertenece a un establecimiento educacional."""
    return not es_usuario_slep(usuario_actual)


def validar_acceso_colegio(id_establecimiento: Optional[int], usuario_actual: dict) -> Optional[int]:
    """
    Valida y restringe el establecimiento según el rol del usuario:
    - Para cualquier perfil de Colegio (Colegio, COLEGIO, Director, Visualizador_Colegio):
      fuerza y garantiza que solo opere en su propio colegio asignado. Si intenta solicitar otro, bloquea.
    - Para perfil SLEP / Admin: permite consultar cualquier establecimiento o None (vista global).
    """
    if not usuario_actual:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión no válida.")

    if not es_usuario_slep(usuario_actual):
        id_est_user = usuario_actual.get("id_establecimiento")
        if not id_est_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Su usuario de colegio no tiene un establecimiento asignado."
            )
        # Si solicitó un ID específico y no coincide con el asignado, bloquear
        if id_establecimiento is not None and int(id_establecimiento) != int(id_est_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso denegado: No tiene permisos para consultar o modificar datos de otro establecimiento."
            )
        return int(id_est_user)

    return id_establecimiento


def verificar_acceso_estudiante_db(rut: str, usuario_actual: dict, cur) -> bool:
    """
    Verifica si un usuario de colegio tiene derecho a acceder a la ficha o documentos de un estudiante.
    - Administradores SLEP tienen acceso irrestricto.
    - Usuarios de colegio con establecimiento asignado tienen acceso para consultar estudiantes de su establecimiento,
      postulantes nuevos sin matrícula y tramitar matrículas/traslados inter-escolares dentro del SLEP.
    """
    if es_usuario_slep(usuario_actual):
        return True

    id_est_user = usuario_actual.get("id_establecimiento")
    if not id_est_user:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario sin establecimiento asignado.")

    return True


def requiere_pestana(pestana: str):
    """
    Fábrica de dependencias FastAPI que bloquea el acceso a un endpoint si el rol
    del usuario no tiene habilitada la pestaña/panel indicada en el catálogo (roles.py).

    Uso:
        @router.get("/estadisticas")
        def ...(usuario_actual: dict = Depends(requiere_pestana(roles.TAB_PANEL))):
    """
    def _dep(usuario_actual: dict = Depends(obtener_usuario_actual)):
        if not roles_catalogo.puede_ver_pestana(usuario_actual.get("rol"), pestana):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Su perfil no tiene acceso a este módulo del sistema."
            )
        return usuario_actual
    return _dep
