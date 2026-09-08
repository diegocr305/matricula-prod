# services/dashboard_service.py
import re
from fastapi import HTTPException
from database import get_db_connection

def obtener_estadisticas_dashboard_db(establecimiento_id: int = None, anio: int = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 1. Filtros para la data específica del año (Tarjetas y Acordeón)
        filtros_sql = ""
        parametros = []
        
        # 2. Filtros para el historial global (Solo colegio, ignora el año seleccionado)
        filtro_global = ""
        param_global = []
        
        if establecimiento_id is not None:
            filtros_sql += " AND id_establecimiento = %s"
            filtro_global += " AND id_establecimiento = %s"
            parametros.append(establecimiento_id)
            param_global.append(establecimiento_id)
            
        if anio is not None:
            filtros_sql += " AND anio_escolar = %s"
            parametros.append(anio)

        # 🌟 CORRECCIÓN 1: Obtener todos los años disponibles SIN filtrar por el año actual
        cur.execute(f"SELECT DISTINCT anio_escolar FROM matricula WHERE anio_escolar IS NOT NULL {filtro_global} ORDER BY anio_escolar DESC", tuple(param_global))
        anios_disponibles = [row[0] for row in cur.fetchall()]

        # --- DATA DEL AÑO SELECCIONADO ---
        cur.execute(f"SELECT COUNT(*) FROM matricula WHERE estado = 'Activa' {filtros_sql}", tuple(parametros))
        total_activos = cur.fetchone()[0]

        cur.execute(f"SELECT COUNT(*) FROM matricula WHERE estado != 'Activa' {filtros_sql}", tuple(parametros))
        total_inactivos = cur.fetchone()[0]

        cur.execute(f"SELECT nivel_ensenanza, COUNT(*) FROM matricula WHERE estado = 'Activa' {filtros_sql} GROUP BY nivel_ensenanza ORDER BY nivel_ensenanza", tuple(parametros))
        por_nivel = [{"nombre": row[0] or "Sin Nivel", "cantidad": row[1]} for row in cur.fetchall()]

        cur.execute(f"SELECT curso, COUNT(*) FROM matricula WHERE estado = 'Activa' {filtros_sql} GROUP BY curso ORDER BY curso", tuple(parametros))
        por_curso = [{"nombre": row[0] or "Sin Curso", "cantidad": row[1]} for row in cur.fetchall()]

        # 🌟 CORRECCIÓN 2: Construir el Histórico Real desde 2022
        cur.execute(f"""
            SELECT anio_escolar, estado, curso
            FROM matricula
            WHERE anio_escolar >= 2022 {filtro_global}
        """, tuple(param_global))
        
        filas_historial = cur.fetchall()
        historico_dict = {}

        for anio_h, estado, curso in filas_historial:
            if anio_h not in historico_dict:
                historico_dict[anio_h] = {"anio": anio_h, "activos": 0, "retiros": 0, "cursos": {}}

            if estado == 'Activa':
                historico_dict[anio_h]["activos"] += 1
                
                if curso:
                    # Agrupar curso (Ej: "1° básico A" -> "1° Básico") para el gráfico
                    curso_str = str(curso).strip()
                    match = re.match(r"^(.*?)\s+[A-Za-z]$", curso_str)
                    
                    if match:
                        nombre_base = match.group(1).strip().capitalize()
                    else:
                        nombre_base = curso_str.capitalize()
                    
                    historico_dict[anio_h]["cursos"][nombre_base] = historico_dict[anio_h]["cursos"].get(nombre_base, 0) + 1
            else:
                historico_dict[anio_h]["retiros"] += 1

        # Ordenar el historial de menor a mayor año para el gráfico
        historico_real = sorted(list(historico_dict.values()), key=lambda x: x["anio"])

        return {
            "anios_disponibles": anios_disponibles,
            "total_activos": total_activos,
            "total_inactivos": total_inactivos,
            "por_nivel": por_nivel,
            "por_curso": por_curso,
            "historico": historico_real # Enviamos la nueva data a React
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al generar estadísticas: " + str(e))
    finally:
        cur.close()
        conn.close()