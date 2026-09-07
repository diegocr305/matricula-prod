# services/auth_service.py
import os
from fastapi import HTTPException
from datetime import timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from database import get_db_connection
from security import verificar_password, crear_token_acceso, ACCESS_TOKEN_EXPIRE_MINUTES

# Client ID de Google (Google Cloud Console -> Credentials). Se lee del entorno.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

# Dominio Workspace permitido. Vacío = no se valida dominio (desarrollo).
GOOGLE_HOSTED_DOMAIN = os.getenv("GOOGLE_HOSTED_DOMAIN", "slepvalparaiso.cl")

def login_tradicional_service(credenciales):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_usuario, email_institucional, nombre, rol, id_establecimiento, activo, password_hash FROM usuario WHERE email_institucional = %s", (credenciales.email,))
        usuario_db = cur.fetchone()
        
        if not usuario_db or not usuario_db[5] or not verificar_password(credenciales.password, usuario_db[6]):
            raise HTTPException(status_code=401, detail="Credenciales incorrectas o usuario inactivo")
            
        rol_db = usuario_db[3]
        rol_solicitado = credenciales.rol.upper() # Nos aseguramos de que venga en mayúsculas para comparar
        
        # LÓGICA FLEXIBLE DE ROLES: Permitimos que los visualizadores entren a sus respectivos portales
        rol_valido = False
        
        if rol_solicitado == "SLEP" and rol_db in ["SLEP", "admin_slep", "Visualizador_SLEP"]:
            rol_valido = True
        elif (rol_solicitado == "COLEGIO" or rol_solicitado == "ESTABLECIMIENTO") and rol_db in ["Colegio", "Visualizador_Colegio"]:
            rol_valido = True
        elif rol_solicitado == rol_db.upper():
            rol_valido = True

        if not rol_valido:
            raise HTTPException(status_code=403, detail="No tienes permisos para acceder a este portal con tu perfil actual.")

        token = crear_token_acceso(
            {"sub": usuario_db[1], "id_usuario": usuario_db[0], "rol": usuario_db[3], "id_establecimiento": usuario_db[4]}, 
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
        return {
            "access_token": token, 
            "token_type": "bearer", 
            "usuario": {"nombre": usuario_db[2], "rol": usuario_db[3], "id_establecimiento": usuario_db[4]}
        }
    finally:
        cur.close()
        conn.close()


def _rol_valido_para_portal(rol_solicitado, rol_db):
    """Valida que el rol almacenado permita entrar al portal solicitado."""
    rol_solicitado = (rol_solicitado or "").upper()
    if rol_solicitado == "SLEP" and rol_db in ["SLEP", "admin_slep", "Visualizador_SLEP"]:
        return True
    if rol_solicitado in ("COLEGIO", "ESTABLECIMIENTO") and rol_db in ["Colegio", "Visualizador_Colegio"]:
        return True
    if rol_solicitado == (rol_db or "").upper():
        return True
    return False


def login_google_service(credenciales):
    # 1. Validar el token con Google
    try:
        idinfo = id_token.verify_oauth2_token(
            credenciales.token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
        email_google = (idinfo.get("email") or "").lower().strip()
    except ValueError:
        raise HTTPException(status_code=401, detail="Token de Google inválido o expirado.")

    if not email_google:
        raise HTTPException(status_code=401, detail="El token de Google no contiene un correo válido.")

    # 2. Validar dominio Workspace (si está configurado)
    if GOOGLE_HOSTED_DOMAIN:
        if not email_google.endswith("@" + GOOGLE_HOSTED_DOMAIN):
            raise HTTPException(
                status_code=403,
                detail=f"Debe iniciar sesión con un correo institucional @{GOOGLE_HOSTED_DOMAIN}.",
            )

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 3a. Buscar primero en la tabla usuario (SLEP, admin, visualizadores globales)
        cur.execute(
            "SELECT id_usuario, email_institucional, nombre, rol, id_establecimiento, activo "
            "FROM usuario WHERE email_institucional = %s",
            (email_google,),
        )
        usuario_db = cur.fetchone()

        if usuario_db and usuario_db[5]:
            rol_db = usuario_db[3]
            if not _rol_valido_para_portal(credenciales.rol, rol_db):
                raise HTTPException(
                    status_code=403,
                    detail="Tu correo es válido, pero no tienes permisos para acceder a este portal.",
                )
            token = crear_token_acceso(
                {"sub": usuario_db[1], "id_usuario": usuario_db[0], "rol": rol_db, "id_establecimiento": usuario_db[4]},
                timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            )
            return {
                "access_token": token,
                "token_type": "bearer",
                "usuario": {"nombre": usuario_db[2], "rol": rol_db, "id_establecimiento": usuario_db[4]},
            }

        # 3b. Buscar en acceso_establecimiento (directores / funcionarios de colegio)
        cur.execute(
            "SELECT a.id, a.rol, a.id_establecimiento, e.nombre, e.rbd "
            "FROM acceso_establecimiento a "
            "JOIN establecimiento e ON a.id_establecimiento = e.id_establecimiento "
            "WHERE a.correo = %s AND a.activo = true",
            (email_google,),
        )
        acceso = cur.fetchone()

        if not acceso:
            raise HTTPException(
                status_code=403,
                detail="Tu correo es válido, pero no está autorizado en el sistema de matrículas.",
            )

        rol_db = acceso[1]
        id_establecimiento = acceso[2]
        nombre_estab = acceso[3]

        if not _rol_valido_para_portal(credenciales.rol, rol_db):
            raise HTTPException(
                status_code=403,
                detail="Tu correo está autorizado, pero no para este portal.",
            )

        # Aseguramos una fila en 'usuario' para tener trazabilidad y satisfacer
        # las FK de id_usuario_ejecutor al crear/editar matrículas.
        nombre_usuario = (idinfo.get("name") or email_google).strip()
        cur.execute(
            """
            INSERT INTO usuario (email_institucional, nombre, rol, id_establecimiento, activo)
            VALUES (%s, %s, %s, %s, true)
            ON CONFLICT (email_institucional) DO UPDATE
                SET rol = EXCLUDED.rol,
                    id_establecimiento = EXCLUDED.id_establecimiento,
                    activo = true
            RETURNING id_usuario, nombre;
            """,
            (email_google, nombre_usuario, rol_db, id_establecimiento),
        )
        fila = cur.fetchone()
        conn.commit()
        id_usuario = fila[0]
        nombre_final = fila[1] or nombre_usuario

        token = crear_token_acceso(
            {"sub": email_google, "id_usuario": id_usuario, "rol": rol_db, "id_establecimiento": id_establecimiento},
            timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "usuario": {"nombre": nombre_final, "rol": rol_db, "id_establecimiento": id_establecimiento, "establecimiento": nombre_estab},
        }
    finally:
        cur.close()
        conn.close()