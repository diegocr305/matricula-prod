# services/reporte_service.py
import json
from fastapi import HTTPException
from database import get_db_connection
from security import es_usuario_slep

def clasificar_evento(accion: str, datos_ant: any, datos_nuev: any) -> tuple[str, str]:
    """
    Analiza los snapshots JSON de PostgreSQL para determinar 
    el tipo exacto de movimiento y generar una descripción legible.
    """
    ant = json.loads(datos_ant) if isinstance(datos_ant, str) else (datos_ant or {})
    nuev = json.loads(datos_nuev) if isinstance(datos_nuev, str) else (datos_nuev or {})

    if accion == 'INSERT':
        return 'ALTA', 'Nueva matrícula registrada en el sistema.'

    if accion == 'UPDATE':
        # 1. Retiro de estudiante
        if nuev.get('estado') == 'Retirado' and ant.get('estado') != 'Retirado':
            motivo = nuev.get('motivo_retiro') or 'Sin motivo inicial'
            return 'RETIRO', f"Baja de estudiante procesada. Motivo: {motivo}"

        # 2. Cuestionario confidencial completado por el apoderado
        if nuev.get('motivo_retiro') == 'Respuesta Apoderado (Confidencial)' and ant.get('motivo_retiro') != 'Respuesta Apoderado (Confidencial)':
            return 'CUESTIONARIO', 'El apoderado completó el cuestionario de retiro confidencial.'

        # 3. Cambio de curso
        if nuev.get('id_curso') and ant.get('id_curso') and nuev.get('id_curso') != ant.get('id_curso'):
            return 'CAMBIO_CURSO', f"Cambio de curso realizado: Curso #{ant.get('id_curso')} ➔ Curso #{nuev.get('id_curso')}"

        # 4. Actualización general de datos
        campos_modificados = []
        for k in nuev:
            if k in ant and nuev[k] != ant[k] and k not in ['id_usuario_ejecutor', 'fecha_actualizacion']:
                campos_modificados.append(k)
        
        detalle = f"Modificación en campos: {', '.join(campos_modificados)}" if campos_modificados else "Actualización en datos de matrícula."
        return 'ACTUALIZACION', detalle

    return accion, 'Movimiento registrado en la base de datos.'


def obtener_auditoria_matriculas_db(establecimiento_id: int, tipo_movimiento: str, fecha_inicio: str, fecha_fin: str, usuario_actual: dict):
    # --- BLOQUEO DE SEGURIDAD ESTRICTO PARA COLEGIOS ---
    if not usuario_actual or not es_usuario_slep(usuario_actual):
        raise HTTPException(
            status_code=403, 
            detail="Acceso Denegado: Su perfil no tiene privilegios para visualizar la auditoría del sistema."
        )
        
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        query = """
            SELECT 
                a.id_auditoria, 
                a.id_matricula, 
                a.accion, 
                a.fecha_accion, 
                a.id_usuario,
                u.nombre AS nombre_ejecutor,
                a.datos_anteriores, 
                a.datos_nuevos,
                m.id_establecimiento,
                est.nombre AS nombre_establecimiento
            FROM auditoria_matricula a
            LEFT JOIN usuario u ON a.id_usuario = u.id_usuario
            LEFT JOIN matricula m ON a.id_matricula = m.id_matricula
            LEFT JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE 1=1
        """
        parametros = []

        if establecimiento_id is not None:
            query += " AND m.id_establecimiento = %s"
            parametros.append(establecimiento_id)

        if fecha_inicio and fecha_inicio.strip():
            query += " AND a.fecha_accion::date >= %s::date"
            parametros.append(fecha_inicio.strip())

        if fecha_fin and fecha_fin.strip():
            query += " AND a.fecha_accion::date <= %s::date"
            parametros.append(fecha_fin.strip())

        if tipo_movimiento and tipo_movimiento.strip():
            tipo = tipo_movimiento.strip()
            if tipo == 'ALTA':
                query += " AND a.accion = 'INSERT'"
            elif tipo == 'RETIRO':
                query += " AND a.accion = 'UPDATE' AND (a.datos_nuevos->>'estado' = 'Retirado') AND (a.datos_anteriores->>'estado' IS NULL OR a.datos_anteriores->>'estado' != 'Retirado')"
            elif tipo == 'CUESTIONARIO':
                query += " AND (a.datos_nuevos->>'motivo_retiro' = 'Respuesta Apoderado (Confidencial)') AND (a.datos_anteriores->>'motivo_retiro' IS NULL OR a.datos_anteriores->>'motivo_retiro' != 'Respuesta Apoderado (Confidencial)')"
            elif tipo == 'CAMBIO_CURSO':
                query += " AND a.accion = 'UPDATE' AND (a.datos_nuevos->>'id_curso' IS NOT NULL) AND (a.datos_anteriores->>'id_curso' IS NOT NULL) AND (a.datos_nuevos->>'id_curso' != a.datos_anteriores->>'id_curso')"
            elif tipo == 'ACTUALIZACION':
                query += """ AND a.accion = 'UPDATE' 
                    AND NOT (a.datos_nuevos->>'estado' = 'Retirado' AND (a.datos_anteriores->>'estado' IS NULL OR a.datos_anteriores->>'estado' != 'Retirado'))
                    AND NOT (a.datos_nuevos->>'motivo_retiro' = 'Respuesta Apoderado (Confidencial)' AND (a.datos_anteriores->>'motivo_retiro' IS NULL OR a.datos_anteriores->>'motivo_retiro' != 'Respuesta Apoderado (Confidencial)'))
                    AND NOT ((a.datos_nuevos->>'id_curso' IS NOT NULL) AND (a.datos_anteriores->>'id_curso' IS NOT NULL) AND (a.datos_nuevos->>'id_curso' != a.datos_anteriores->>'id_curso'))"""

        query += " ORDER BY a.fecha_accion DESC LIMIT 300"

        cur.execute(query, tuple(parametros))
        filas = cur.fetchall()

        registros = []
        for f in filas:
            accion_db = f[2]
            datos_ant = f[6]
            datos_nuev = f[7]
            
            # Asegurar confidencialidad estricta de las respuestas de retiro en snapshots de auditoría
            if isinstance(datos_nuev, dict) and datos_nuev.get('observaciones') and '[Motivos de Retiro]' in str(datos_nuev.get('observaciones')):
                datos_nuev = dict(datos_nuev)
                datos_nuev['observaciones'] = 'Retiro formalizado mediante cuestionario confidencial de apoderado.'
            if isinstance(datos_ant, dict) and datos_ant.get('observaciones') and '[Motivos de Retiro]' in str(datos_ant.get('observaciones')):
                datos_ant = dict(datos_ant)
                datos_ant['observaciones'] = 'Retiro formalizado mediante cuestionario confidencial de apoderado.'
            
            tipo_mov, detalle = clasificar_evento(accion_db, datos_ant, datos_nuev)

            if tipo_movimiento and tipo_movimiento.strip() != "":
                if tipo_mov != tipo_movimiento.strip():
                    continue

            registros.append({
                "id_auditoria": f[0],
                "id_matricula": f[1],
                "accion_db": accion_db,
                "tipo_movimiento": tipo_mov,
                "detalle": detalle,
                "fecha": str(f[3]),
                "id_usuario": f[4],
                "nombre_ejecutor": f[5] or "Sistema / Automático",
                "datos_anteriores": datos_ant,
                "datos_nuevos": datos_nuev,
                "id_establecimiento": f[8],
                "nombre_establecimiento": f[9] or "Desconocido"
            })

        return registros

    except Exception as e:
        print(f"Error en auditoría: {e}")
        raise HTTPException(status_code=500, detail=f"Error al consultar la bitácora: {str(e)}")
    finally:
        cur.close()
        conn.close()