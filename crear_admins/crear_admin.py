# crear_admin
import psycopg2
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_CONFIG = {
    "dbname": "sistema_matriculas_sleep",
    "user": "postgres",
    "password": "admin",
    "host": "localhost",
    "port": "5432"
}

def crear_usuario_para_colegio(email, nombre, rol, rbd_establecimiento, password_plana="admin123"):
    password_encriptada = pwd_context.hash(password_plana)
    
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    
    try:
        # 1. Buscamos el id_establecimiento usando el RBD del colegio que ya existe en la BD
        cur.execute("SELECT id_establecimiento, nombre FROM establecimiento WHERE rbd = %s", (rbd_establecimiento,))
        colegio = cur.fetchone()
        
        if not colegio:
            print(f"❌ Error: No se encontró ningún establecimiento con el RBD '{rbd_establecimiento}' en la base de datos.")
            return
            
        id_establecimiento_real = colegio[0]
        nombre_colegio = colegio[1]
        
        # 2. Insertamos el usuario vinculado al ID real de ese colegio
        cur.execute("""
            INSERT INTO usuario (email_institucional, nombre, rol, id_establecimiento, activo, password_hash)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (email_institucional) DO UPDATE 
            SET password_hash = EXCLUDED.password_hash, 
                id_establecimiento = EXCLUDED.id_establecimiento;
        """, (email, nombre, rol, id_establecimiento_real, True, password_encriptada))
        
        conn.commit()
        print(f"✅ Usuario creado/actualizado con éxito.")
        print(f"🏫 Colegio: {nombre_colegio} (ID BD: {id_establecimiento_real})")
        print(f"👤 Email: {email}")
        print(f"🔑 Password: {password_plana}")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error al crear usuario: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    # --- REEMPLAZA ESTOS DATOS SEGÚN NECESITES ---
    # Asegúrate de colocar un RBD que sí exista en tu tabla 'establecimiento'
    RBD_COLEGIO_EXISTENTE = "1520" # <--- Cambia esto por el RBD real de tu base de datos
    
    crear_usuario_para_colegio(
        email="director.bicentenario@colegioslep.cl",
        nombre="CAROLINA ANDREA CONCHA PALOMINO",
        rol="COLEGIO",
        rbd_establecimiento=RBD_COLEGIO_EXISTENTE,
        password_plana="admin123"
    )