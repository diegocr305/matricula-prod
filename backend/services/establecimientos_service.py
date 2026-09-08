# services/establecimiento_service.py
import pandas as pd
from fastapi import HTTPException,UploadFile
from database import get_db_connection

def obtener_establecimientos_db():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_establecimiento, rbd, nombre FROM establecimiento ORDER BY nombre ASC")
        filas = cur.fetchall()
        
        colegios = [{"id_establecimiento": f[0], "rbd": f[1], "nombre": f[2]} for f in filas]
        return colegios
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error interno de la base de datos")
    finally:
        cur.close()
        conn.close()
def cargar_capacidades_excel_service(file: UploadFile, anio_escolar: int):
    """
    Lee el archivo Excel de Declaración de Cupos (DCV) y actualiza 
    la capacidad máxima por sala en la base de datos.
    """
    try:
        # 1. Leer el Excel directamente desde la memoria
        df = pd.read_excel(file.file)
        
        # 2. Limpiar datos nulos asegurando que existan las columnas clave
        columnas_requeridas = ['RBD', 'NIVEL', 'CAPACIDAD POR SALA']
        if not all(col in df.columns for col in columnas_requeridas):
            raise HTTPException(status_code=400, detail="El Excel no contiene las columnas requeridas (RBD, NIVEL, CAPACIDAD POR SALA)")
            
        df = df.dropna(subset=columnas_requeridas)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo el archivo Excel: {str(e)}")

    conn = get_db_connection()
    cur = conn.cursor()
    
    registros_actualizados = 0
    try:
        # 3. Iterar sobre las filas e insertar/actualizar en la base de datos
        for index, row in df.iterrows():
            rbd = int(row['RBD'])
            # Limpiamos el texto del nivel (ej: '1MEDIO  ' -> '1MEDIO')
            nivel_str = str(row['NIVEL']).strip().upper() 
            capacidad = int(row['CAPACIDAD POR SALA'])
            
            # Upsert: Si ya existe, lo actualiza. Si no, lo inserta.
            cur.execute("""
                INSERT INTO capacidad_oferta (rbd, anio_escolar, nivel_str, capacidad_sala)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (rbd, anio_escolar, nivel_str) 
                DO UPDATE SET capacidad_sala = EXCLUDED.capacidad_sala;
            """, (rbd, anio_escolar, nivel_str, capacidad))
            
            registros_actualizados += 1
            
        conn.commit()
        return {"status": "success", "mensaje": f"Se procesaron {registros_actualizados} capacidades para el año {anio_escolar}."}
        
    except Exception as e:
        conn.rollback()
        print(f"Error guardando capacidades: {e}")
        raise HTTPException(status_code=500, detail="Error interno al guardar en la base de datos.")
    finally:
        cur.close()
        conn.close()

def obtener_capacidad_curso(rbd: int, anio_escolar: int, nivel_str: str) -> int:
    """
    Función de consulta rápida para que el frontend pregunte cuál es el límite.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT capacidad_sala FROM capacidad_oferta
            WHERE rbd = %s AND anio_escolar = %s AND nivel_str = %s
        """, (rbd, anio_escolar, nivel_str))
        
        resultado = cur.fetchone()
        
        # Si no hay registro específico en el Excel, devolvemos 45 como límite legal por defecto
        return resultado[0] if resultado else 45
    finally:
        cur.close()
        conn.close()