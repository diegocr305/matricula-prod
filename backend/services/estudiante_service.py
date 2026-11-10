# services/estudiante_service.py
import os
import uuid
from fastapi import HTTPException
from database import get_db_connection
import json
from services import storage_service
from services.utils import normalizar_rut
from parentescos import validar_parentesco
from reglas_estudiante import correo_personal_es_obligatorio, validar_formato_correo
import re


def normalizar_numero_domicilio(numero):
    """Limpia espacios del número de domicilio y unifica 'sin número' como 'S/N'
    (acepta 's/n', 'sn', 'S / N', 'sin numero'). Devuelve None si queda vacío."""
    if numero is None:
        return None
    n = " ".join(str(numero).split())
    if not n:
        return None
    if re.fullmatch(r"(?i)s\s*/?\s*n\.?|sin\s+n[uú]mero", n):
        return "S/N"
    return n


def _domicilio_guardado(cur, id_apoderado):
    """Domicilio ya guardado de un apoderado, o None si no hay uno útil.
    Se usa para NO pisar con el del estudiante un domicilio que ya estaba bien."""
    if not id_apoderado:
        return None
    cur.execute("SELECT domicilio FROM apoderado WHERE id_apoderado = %s", (id_apoderado,))
    fila = cur.fetchone()
    valor = (fila[0] or "").strip() if fila else ""
    if not valor or valor.lower() in ("sin registrar", "sin registro"):
        return None
    return valor


_COLUMNAS_CORREO_OK = False


def _tiene_columnas_correo(cur) -> bool:
    """True si ya se aplicó apply_correo_estudiante_migration.py.
    Permite desplegar el código antes que la migración sin romper la ficha:
    mientras no existan las columnas, el correo simplemente no se lee ni se exige.
    Solo se cachea el resultado positivo (para detectar la migración sin reiniciar)."""
    global _COLUMNAS_CORREO_OK
    if _COLUMNAS_CORREO_OK:
        return True
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'estudiante'
          AND column_name IN ('correo_personal', 'correo_institucional')
    """)
    _COLUMNAS_CORREO_OK = cur.fetchone()[0] == 2
    return _COLUMNAS_CORREO_OK


def _guardar_correo_estudiante(cur, id_estudiante, nuevo_personal, nuevo_institucional):
    """Aplica la obligatoriedad por nivel y guarda el correo del estudiante.
    La obligatoriedad se evalúa sobre el valor final: el enviado o, si no se envía
    (None), el ya guardado. Requiere las columnas de la migración de correo."""
    cur.execute("SELECT correo_personal FROM estudiante WHERE id_estudiante = %s", (id_estudiante,))
    fila = cur.fetchone()
    guardado = (fila[0] if fila else None) or ""
    personal_final = nuevo_personal.strip() if nuevo_personal is not None else guardado

    cur.execute("""
        SELECT curso FROM matricula
        WHERE id_estudiante = %s AND estado <> 'Anulada'
        ORDER BY anio_escolar DESC, id_matricula DESC LIMIT 1
    """, (id_estudiante,))
    fila_curso = cur.fetchone()
    if correo_personal_es_obligatorio(fila_curso[0] if fila_curso else None) and not personal_final:
        raise HTTPException(status_code=422, detail="El correo personal del estudiante es obligatorio en 4° medio.")

    if nuevo_personal is not None:
        cur.execute("UPDATE estudiante SET correo_personal = %s WHERE id_estudiante = %s",
                    (nuevo_personal.strip() or None, id_estudiante))
    if nuevo_institucional is not None:
        cur.execute("UPDATE estudiante SET correo_institucional = %s WHERE id_estudiante = %s",
                    (nuevo_institucional.strip() or None, id_estudiante))


def _relaciones_guardadas(cur, id_apoderado=None, rut=None):
    """Valores de parentesco ya guardados para un apoderado (por id y/o por RUT).
    Sirven para aceptar sin reescribir los valores históricos que no están en el catálogo."""
    vistos = []
    if id_apoderado:
        cur.execute("SELECT relacion_estudiante FROM apoderado WHERE id_apoderado = %s", (id_apoderado,))
        fila = cur.fetchone()
        if fila and fila[0]:
            vistos.append(fila[0])
    if rut:
        cur.execute("SELECT relacion_estudiante FROM apoderado WHERE rut_pasaporte = %s", (rut,))
        fila = cur.fetchone()
        if fila and fila[0]:
            vistos.append(fila[0])
    return vistos

def componer_domicilio(calle, numero, sector, comuna):
    """Compone una dirección en un solo texto a partir de sus componentes."""
    partes = []
    if calle:
        via = str(calle).strip()
        if numero and str(numero).strip():
            via = f"{via} {str(numero).strip()}"
        partes.append(via)
    if sector and str(sector).strip():
        partes.append(str(sector).strip())
    if comuna and str(comuna).strip():
        partes.append(str(comuna).strip())
    return ", ".join(partes) if partes else None

def verificar_acceso_estudiante_db(rut: str, usuario_actual: dict, cur):
    if not usuario_actual:
        return
    rol = str(usuario_actual.get("rol", "")).strip()
    es_global = rol.lower() in ["slep", "admin_slep", "visualizador_slep", "admin"]
    if es_global:
        return
    id_est = usuario_actual.get("id_establecimiento")
    if not id_est:
        raise HTTPException(status_code=403, detail="No tiene un establecimiento asociado.")
    
    # En la red SLEP, los funcionarios autenticados con un colegio asignado
    # tienen autorización para consultar la ficha, actualizar antecedentes de contacto
    # e iniciar matrícula/traslado de postulantes sin matrícula o transferencias de otros colegios.
    return True

def obtener_estudiantes_db(
    establecimiento_id: int = None,
    q: str = None,
    page: int = 1,
    page_size: int = 50,
    anio: int = None,
    codigo: int = None,
    curso: str = None,
    estado: str = None
):
    page = max(1, int(page or 1))
    page_size = min(max(1, int(page_size or 50)), 200)
    offset = (page - 1) * page_size

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        where_clauses = ["1=1"]
        params = []

        if establecimiento_id is not None:
            where_clauses.append("m.id_establecimiento = %s")
            params.append(establecimiento_id)

        if anio is not None:
            where_clauses.append("m.anio_escolar = %s")
            params.append(anio)

        if codigo is not None:
            where_clauses.append("m.cod_tipo_ensenanza = %s")
            params.append(codigo)

        if curso:
            where_clauses.append("m.curso = %s")
            params.append(curso)

        if estado:
            where_clauses.append("m.estado = %s")
            params.append(estado)

        if q and q.strip():
            termino = q.strip()
            t_clean = termino.replace(".", "").replace("-", "").replace(" ", "").upper()
            palabras = [p for p in termino.split() if len(p) > 1]
            if palabras:
                name_conditions = []
                for p in palabras:
                    name_conditions.append("UPPER(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', COALESCE(e.apellido_materno, ''))) LIKE UPPER(%s)")
                    params.append(f"%{p}%")
                where_clauses.append(f"""(
                    REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') LIKE %s
                    OR e.run_ipe ILIKE %s
                    OR ({' AND '.join(name_conditions)})
                )""")
                params.insert(len(params) - len(palabras), f"%{t_clean}%")
                params.insert(len(params) - len(palabras), f"%{termino}%")
            else:
                where_clauses.append("(REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') LIKE %s OR e.run_ipe ILIKE %s)")
                params.append(f"%{t_clean}%")
                params.append(f"%{termino}%")

        where_sql = " AND ".join(where_clauses)

        # Conteo total para paginación
        count_sql = f"""
            WITH ultimas_matriculas AS (
                SELECT DISTINCT ON (m.id_estudiante)
                    m.id_estudiante, m.id_establecimiento, m.estado, m.anio_escolar, m.cod_tipo_ensenanza, m.curso
                FROM matricula m
                ORDER BY m.id_estudiante, m.anio_escolar DESC NULLS LAST, m.id_matricula DESC
            )
            SELECT COUNT(DISTINCT e.id_estudiante)
            FROM estudiante e
            LEFT JOIN ultimas_matriculas m ON e.id_estudiante = m.id_estudiante
            WHERE {where_sql}
        """
        cur.execute(count_sql, tuple(params))
        total = cur.fetchone()[0]

        # Consulta paginada con LIMIT y OFFSET
        data_sql = f"""
            WITH ultimas_matriculas AS (
                SELECT DISTINCT ON (m.id_estudiante)
                    m.id_estudiante, m.id_establecimiento, m.estado, m.anio_escolar, m.cod_tipo_ensenanza, m.curso
                FROM matricula m
                ORDER BY m.id_estudiante, m.anio_escolar DESC NULLS LAST, m.id_matricula DESC
            )
            SELECT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno,
                   m.estado, m.anio_escolar, m.cod_tipo_ensenanza, m.curso,
                   est.nombre as nombre_colegio
            FROM estudiante e
            LEFT JOIN ultimas_matriculas m ON e.id_estudiante = m.id_estudiante
            LEFT JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE {where_sql}
            ORDER BY e.apellido_paterno ASC, e.nombres ASC
            LIMIT %s OFFSET %s
        """
        params_paged = list(params) + [page_size, offset]
        cur.execute(data_sql, tuple(params_paged))
        filas = cur.fetchall()

        estudiantes = [{
            "id": f[0],
            "id_estudiante": f[0],
            "run": f[1],
            "nombres": f[2],
            "apellido_paterno": f[3],
            "apellido_materno": f[4] or "",
            "nombre_completo": f"{f[2]} {f[3]} {f[4] or ''}".strip(),
            "estado": f[5] or "Sin Matrícula",
            "anio_escolar": f[6],
            "anio": f[6],
            "cod_tipo_ensenanza": f[7],
            "curso": f[8] or "Sin Curso",
            "nombre_colegio": f[9] or "Sin establecimiento"
        } for f in filas]

        total_pages = (total + page_size - 1) // page_size if total > 0 else 1
        return {
            "estudiantes": estudiantes,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        }
    except Exception as e:
        print(f"Error BD en obtener_estudiantes_db: {e}")
        raise HTTPException(status_code=500, detail="Error interno de la base de datos")
    finally:
        cur.close()
        conn.close()

def buscar_estudiantes_db(termino: str, establecimiento_id: int = None, limite: int = 20):
    if not termino or len(termino.strip()) < 2:
        return []

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        t_limpio = termino.replace('.', '').replace('-', '').strip()
        t_clean_pattern = f"%{t_limpio}%" if len(t_limpio) >= 2 else "%___NO_RUT___%"
        t_pattern = f"%{termino.strip()}%"

        palabras = [p.strip() for p in termino.strip().split() if p.strip()]

        # 1. Búsqueda por palabras (tokenized search) con unaccent
        params_unaccent = [t_clean_pattern, t_pattern]
        name_conds_unaccent = []
        for p in palabras:
            name_conds_unaccent.append("unaccent(LOWER(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', coalesce(e.apellido_materno, '')))) LIKE unaccent(LOWER(%s))")
            params_unaccent.append(f"%{p}%")

        name_clause_unaccent = " AND ".join(name_conds_unaccent) if name_conds_unaccent else "1=0"

        est_filter = ""
        if establecimiento_id is not None:
            est_filter = " AND (m.id_establecimiento = %s OR m.id_matricula IS NULL)"
            params_unaccent.append(establecimiento_id)

        # Priorizar coincidencias directas en el nombre
        primera_palabra = palabras[0] if palabras else termino.strip()
        params_unaccent.append(f"%{primera_palabra}%")
        params_unaccent.append(limite)

        try:
            query = f"""
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id_estudiante)
                        e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno,
                        m.estado, m.anio_escolar, m.curso, est.nombre as colegio_actual
                    FROM estudiante e
                    LEFT JOIN matricula m ON e.id_estudiante = m.id_estudiante
                    LEFT JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
                    WHERE (
                        REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') LIKE %s
                        OR e.run_ipe ILIKE %s
                        OR ({name_clause_unaccent})
                    ){est_filter}
                    ORDER BY e.id_estudiante, m.anio_escolar DESC NULLS LAST
                ) sub
                ORDER BY 
                    CASE 
                        WHEN unaccent(LOWER(sub.nombres)) LIKE unaccent(LOWER(%s)) THEN 0 
                        ELSE 1 
                    END,
                    sub.apellido_paterno ASC, sub.nombres ASC
                LIMIT %s
            """
            cur.execute(query, tuple(params_unaccent))
            filas = cur.fetchall()
        except Exception:
            conn.rollback()
            params_fallback = [t_clean_pattern, t_pattern]
            name_conds_fb = []
            for p in palabras:
                name_conds_fb.append("UPPER(CONCAT(e.nombres, ' ', e.apellido_paterno, ' ', coalesce(e.apellido_materno, ''))) LIKE UPPER(%s)")
                params_fallback.append(f"%{p}%")

            name_clause_fb = " AND ".join(name_conds_fb) if name_conds_fb else "1=0"

            if establecimiento_id is not None:
                est_filter_fb = " AND (m.id_establecimiento = %s OR m.id_matricula IS NULL)"
                params_fallback.append(establecimiento_id)
            else:
                est_filter_fb = ""

            params_fallback.append(f"%{primera_palabra}%")
            params_fallback.append(limite)

            query_fallback = f"""
                SELECT * FROM (
                    SELECT DISTINCT ON (e.id_estudiante)
                        e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno,
                        m.estado, m.anio_escolar, m.curso, est.nombre as colegio_actual
                    FROM estudiante e
                    LEFT JOIN matricula m ON e.id_estudiante = m.id_estudiante
                    LEFT JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
                    WHERE (
                        REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') LIKE %s
                        OR e.run_ipe ILIKE %s
                        OR ({name_clause_fb})
                    ){est_filter_fb}
                    ORDER BY e.id_estudiante, m.anio_escolar DESC NULLS LAST
                ) sub
                ORDER BY 
                    CASE 
                        WHEN UPPER(sub.nombres) LIKE UPPER(%s) THEN 0 
                        ELSE 1 
                    END,
                    sub.apellido_paterno ASC, sub.nombres ASC
                LIMIT %s
            """
            cur.execute(query_fallback, tuple(params_fallback))
            filas = cur.fetchall()

        return [{
            "id": f[0],
            "id_estudiante": f[0],
            "run": f[1],
            "run_ipe": f[1],
            "nombres": f[2],
            "apellido_paterno": f[3],
            "apellido_materno": f[4] or "",
            "nombre_completo": f"{f[2]} {f[3]} {f[4] or ''}".strip(),
            "estado": f[5] or "Sin Matrícula",
            "anio_escolar": f[6],
            "curso": f[7] or "Sin Curso",
            "colegio": f[8] or "Sin Colegio"
        } for f in filas]
    except Exception as e:
        print(f"Error en buscar_estudiantes_db: {e}")
        return []
    finally:
        cur.close()
        conn.close()

def obtener_ficha_estudiante_db(rut: str, usuario_actual: dict = None):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if usuario_actual:
            verificar_acceso_estudiante_db(rut, usuario_actual, cur)

        # Columnas de correo solo si la migración ya se aplicó (si no, NULL en su lugar
        # para no mover los índices posicionales 44 y 45).
        cols_correo = (
            "e.correo_personal, e.correo_institucional"
            if _tiene_columnas_correo(cur) else "NULL, NULL"
        )
        cur.execute(f"""
            SELECT e.id_estudiante, e.run_ipe, e.nombres, e.apellido_paterno, e.apellido_materno, e.fecha_nacimiento, e.domicilio,
                   a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno, a.telefono, a.correo_electronico, a.domicilio, a.relacion_estudiante, a.ruta_documento_tutor,
                   asup.rut_pasaporte, asup.nombres, asup.apellido_paterno, asup.apellido_materno, asup.telefono, asup.correo_electronico, asup.domicilio, asup.relacion_estudiante,
                   fs.id_ficha, fs.sistema_salud, fs.letra_fonasa, fs.cesfam, fs.centro_emergencia, 
                    fs.alergias, fs.diagnostico_medico, fs.medico_tratante, fs.medicamento, fs.nee, fs.nee_tipo,
                    e.fecha_actualizacion,
                    e.pais_origen, e.documento_extranjero,
                    a.pais_origen, a.documento_extranjero,
                    e.calle, e.numero, e.sector, e.comuna,
                    {cols_correo}
            FROM estudiante e
            LEFT JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado
            LEFT JOIN apoderado asup ON e.id_apoderado_suplente = asup.id_apoderado
            LEFT JOIN ficha_salud fs ON e.id_estudiante = fs.id_estudiante
            WHERE REPLACE(REPLACE(REPLACE(UPPER(e.run_ipe), '.', ''), '-', ''), ' ', '') = REPLACE(REPLACE(REPLACE(UPPER(%s), '.', ''), '-', ''), ' ', '')
               OR e.run_ipe = %s
        """, (rut, rut))
        estudiante_db = cur.fetchone()
        
        if not estudiante_db:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado en el sistema RGM.")
            
        cur.execute("""
            SELECT m.id_matricula, m.anio_escolar, m.nivel_ensenanza, m.curso, m.estado, m.fecha_matricula, m.observaciones,
                   est.rbd, est.nombre, m.motivo_retiro, m.fecha_retiro, m.ruta_documento_traslado, m.motivo_cambio_curso,
                   m.estado_renovacion, m.cod_tipo_ensenanza, m.id_establecimiento
            FROM matricula m
            INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
            WHERE m.id_estudiante = %s 
            ORDER BY m.anio_escolar DESC, m.fecha_matricula DESC NULLS LAST, m.id_matricula DESC
        """, (estudiante_db[0],))
        
        historial_db = cur.fetchall()
        
        mat_activa = next((h for h in historial_db if h[4] in ('Activa', 'Promovido', 'Repitente')), historial_db[0] if historial_db else None)
        ultimo_rbd = mat_activa[7] if mat_activa else "Sin Registro"
        ultimo_colegio = mat_activa[8] if mat_activa else "Sin Registro"

        respuesta = {
            "personal": {
                "id": estudiante_db[0], 
                "run": estudiante_db[1], 
                "nombres": estudiante_db[2],
                "apellidos": f"{estudiante_db[3]} {estudiante_db[4] or ''}".strip(),
                "fecha_nacimiento": str(estudiante_db[5]) if estudiante_db[5] else "No registrada",
                "domicilio": estudiante_db[6] if estudiante_db[6] else "Sin registrar",
                # Dirección estructurada
                "calle": estudiante_db[40] or "",
                "numero": estudiante_db[41] or "",
                "sector": estudiante_db[42] or "",
                "comuna": estudiante_db[43] or "",
                "rbd_actual": ultimo_rbd,
                "colegio_actual": ultimo_colegio,
                "fecha_actualizacion": str(estudiante_db[35]) if len(estudiante_db) > 35 and estudiante_db[35] else None,
                "pais_origen": estudiante_db[36] if len(estudiante_db) > 36 and estudiante_db[36] else "Chile",
                "documento_extranjero": estudiante_db[37] if len(estudiante_db) > 37 else None,
                # Correo del estudiante (columnas agregadas al FINAL del SELECT: 44, 45).
                "correo_personal": estudiante_db[44] or "",
                "correo_institucional": estudiante_db[45] or "",
                # Regla parametrizada (reglas_estudiante.py) según el curso más reciente.
                "correo_personal_obligatorio": _COLUMNAS_CORREO_OK and correo_personal_es_obligatorio(
                    next((h[3] for h in historial_db if h[4] != "Anulada"), None)
                ),
            },
            "apoderado": {
                "rut": estudiante_db[7] if estudiante_db[7] else "Sin registrar",
                "rut_raw": estudiante_db[7] or "",
                "nombres": estudiante_db[8] or "",
                "apellido_paterno": estudiante_db[9] or "",
                "apellido_materno": estudiante_db[10] or "",
                "telefono_raw": estudiante_db[11] or "",
                "correo_raw": estudiante_db[12] or "",
                "nombre": f"{estudiante_db[8] or ''} {estudiante_db[9] or ''} {estudiante_db[10] or ''}".strip() if estudiante_db[8] else "Pendiente",
                "telefono": estudiante_db[11] if estudiante_db[11] else "-",
                "correo": estudiante_db[12] if estudiante_db[12] else "-",
                "domicilio": estudiante_db[13] if estudiante_db[13] else "",
                "relacion": estudiante_db[14] or "Titular",
                "ruta_documento_tutor": estudiante_db[15],
                "pais_origen": estudiante_db[38] if len(estudiante_db) > 38 and estudiante_db[38] else "Chile",
                "documento_extranjero": estudiante_db[39] if len(estudiante_db) > 39 else None
            },
            "apoderado_suplente": {
                "rut": estudiante_db[16],
                "nombres": estudiante_db[17] or "",
                "apellido_paterno": estudiante_db[18] or "",
                "apellido_materno": estudiante_db[19] or "",
                "nombre": f"{estudiante_db[17] or ''} {estudiante_db[18] or ''} {estudiante_db[19] or ''}".strip(),
                "telefono": estudiante_db[20] if estudiante_db[20] else "-",
                "correo": estudiante_db[21] if estudiante_db[21] else "-",
                "domicilio": estudiante_db[22] if estudiante_db[22] else "",
                "relacion": estudiante_db[23] or ""
            } if estudiante_db[16] else None,
            "salud": {
                "sistema_salud": estudiante_db[25] or "No informado",
                "letra_fonasa": estudiante_db[26] or "-",
                "cesfam": estudiante_db[27] or "No informado",
                "centro_emergencia": estudiante_db[28] or "No informado",
                "alergias": estudiante_db[29] or "",
                "diagnostico_medico": estudiante_db[30] or "No",
                "medico_tratante": estudiante_db[31] or "No informado",
                "medicamento": estudiante_db[32] or "",
                "nee": estudiante_db[33] or "No",
                "nee_tipo": estudiante_db[34] or "No aplica"
            } if estudiante_db[24] is not None else None,
            "historial": [
                {
                    "id": f[0], "anio": f[1], 
                    "establecimiento": f[8], "rbd": f[7], 
                    "curso": f[3], "estado": f[4], 
                    "tipo_movimiento": "Matrícula", "observaciones": f[6] or "Sin observaciones.",
                    "fecha_matricula": str(f[5]) if f[5] else None,
                    "motivo_retiro": f[9],
                    "fecha_retiro": str(f[10]) if f[10] else None,
                    "ruta_documento_traslado": f[11],
                    "motivo_cambio_curso": f[12],
                    "nivel_ensenanza": f[2],
                    "estado_renovacion": f[13],
                    "cod_tipo_ensenanza": f[14],
                    "id_establecimiento": f[15]
                } 
                for f in historial_db
            ]
        }
        return respuesta
    finally:
        cur.close()
        conn.close()

def guardar_documento_tutor_db(rut: str, archivo_bytes: bytes, filename: str, usuario_actual: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id_estudiante, id_apoderado_principal FROM estudiante WHERE run_ipe = %s", (rut,))
        est = cur.fetchone()
        if not est:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado.")

        id_estudiante, id_apoderado = est
        if not id_apoderado:
            raise HTTPException(status_code=400, detail="El estudiante no tiene un apoderado registrado para adjuntar la tutoría.")

        ext = os.path.splitext(filename)[1].lower() if filename else ".pdf"
        if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
            ext = ".pdf"

        rut_limpio = rut.replace(".", "").replace("-", "")
        clave = f"tutores/tutor_{rut_limpio}_{uuid.uuid4().hex[:8]}{ext}"
        storage_service.guardar_archivo(archivo_bytes, clave, content_type="application/pdf")

        cur.execute("UPDATE apoderado SET ruta_documento_tutor = %s WHERE id_apoderado = %s", (clave, id_apoderado))
        conn.commit()
        return {"mensaje": "Documento de tutoría legal guardado exitosamente.", "ruta": clave}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar documento de tutoría: {e}")
    finally:
        cur.close()
        conn.close()

def obtener_ruta_documento_tutor_db(rut: str, usuario_actual: dict) -> str:
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT a.ruta_documento_tutor 
            FROM estudiante e 
            INNER JOIN apoderado a ON e.id_apoderado_principal = a.id_apoderado 
            WHERE e.run_ipe = %s
        """, (rut,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Estudiante o apoderado no encontrado.")

        if not row[0]:
            raise HTTPException(status_code=404, detail="Este apoderado no tiene un documento de tutoría legal adjunto.")

        return row[0]
    finally:
        cur.close()
        conn.close()


def crear_estudiante_db(payload: dict):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # 1. Procesar Apoderado Principal
        run_apod = normalizar_rut(payload.get("run_apoderado"))

        # Validación de parentesco (catálogo único) ANTES de escribir nada.
        validar_parentesco(
            payload.get("relacion_estudiante"),
            _relaciones_guardadas(cur, rut=run_apod),
            "Parentesco del apoderado titular",
        )
        if payload.get("tiene_suplente") and payload.get("run_suplente"):
            validar_parentesco(
                payload.get("relacion_suplente"),
                _relaciones_guardadas(cur, rut=normalizar_rut(payload.get("run_suplente"))),
                "Parentesco del apoderado suplente",
            )

        cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (run_apod,))
        apod_db = cur.fetchone()
        
        if apod_db:
            id_apoderado = apod_db[0]
            cur.execute("""
                UPDATE apoderado SET
                    nombres = COALESCE(NULLIF(%s, ''), nombres),
                    apellido_paterno = COALESCE(NULLIF(%s, ''), apellido_paterno),
                    apellido_materno = COALESCE(NULLIF(%s, ''), apellido_materno),
                    domicilio = COALESCE(NULLIF(%s, ''), domicilio),
                    telefono = COALESCE(NULLIF(%s, ''), telefono),
                    correo_electronico = COALESCE(NULLIF(%s, ''), correo_electronico),
                    relacion_estudiante = COALESCE(NULLIF(%s, ''), relacion_estudiante),
                    pais_origen = COALESCE(NULLIF(%s, ''), pais_origen),
                    documento_extranjero = COALESCE(NULLIF(%s, ''), documento_extranjero)
                WHERE id_apoderado = %s
            """, (payload.get("nombres_apoderado"), payload.get("apellido_paterno_apoderado"), 
                  payload.get("apellido_materno_apoderado"), payload.get("domicilio_apoderado"), 
                  payload.get("telefono_apoderado"), payload.get("correo_apoderado"),
                  payload.get("relacion_estudiante"), payload.get("pais_origen_apoderado"),
                  payload.get("doc_extranjero_apoderado"), id_apoderado))
        else:
            cur.execute("""
                INSERT INTO apoderado (
                    rut_pasaporte, nombres, apellido_paterno, apellido_materno, 
                    domicilio, telefono, correo_electronico, pais_origen, 
                    documento_extranjero, relacion_estudiante, ruta_documento_tutor
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
            """, (run_apod, payload.get("nombres_apoderado"), payload.get("apellido_paterno_apoderado"), 
                  payload.get("apellido_materno_apoderado"), payload.get("domicilio_apoderado"), 
                  payload.get("telefono_apoderado"), payload.get("correo_apoderado"),
                  payload.get("pais_origen_apoderado", "Chile"), payload.get("doc_extranjero_apoderado", None),
                  payload.get("relacion_estudiante", "No Informado"), payload.get("ruta_documento_tutor", None)))
            id_apoderado = cur.fetchone()[0]

        # 2. Procesar Apoderado Suplente (si aplica)
        id_suplente = None
        if payload.get("tiene_suplente") and payload.get("run_suplente"):
            run_sup = normalizar_rut(payload.get("run_suplente"))
            cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (run_sup,))
            sup_db = cur.fetchone()
            if sup_db:
                id_suplente = sup_db[0]
                cur.execute("""
                    UPDATE apoderado SET
                        nombres = COALESCE(NULLIF(%s, ''), nombres),
                        apellido_paterno = COALESCE(NULLIF(%s, ''), apellido_paterno),
                        apellido_materno = COALESCE(NULLIF(%s, ''), apellido_materno),
                        domicilio = COALESCE(NULLIF(%s, ''), domicilio),
                        telefono = COALESCE(NULLIF(%s, ''), telefono),
                        correo_electronico = COALESCE(NULLIF(%s, ''), correo_electronico),
                        relacion_estudiante = COALESCE(NULLIF(%s, ''), relacion_estudiante)
                    WHERE id_apoderado = %s
                """, (payload.get("nombres_suplente"), payload.get("apellido_paterno_suplente"),
                      payload.get("apellido_materno_suplente"), payload.get("domicilio_suplente") or payload.get("domicilio_apoderado"),
                      payload.get("telefono_suplente"), payload.get("correo_suplente"),
                      payload.get("relacion_suplente"), id_suplente))
            else:
                cur.execute("""
                    INSERT INTO apoderado (
                        rut_pasaporte, nombres, apellido_paterno, apellido_materno, 
                        domicilio, telefono, correo_electronico, relacion_estudiante
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                """, (run_sup, payload.get("nombres_suplente"), payload.get("apellido_paterno_suplente"),
                      payload.get("apellido_materno_suplente"), payload.get("domicilio_suplente") or payload.get("domicilio_apoderado"),
                      payload.get("telefono_suplente"), payload.get("correo_suplente"),
                      payload.get("relacion_suplente") or "Suplente"))
                id_suplente = cur.fetchone()[0]

        # 3. Insertar Estudiante con ambas referencias y fecha de actualización vigente
        cur.execute("""
            INSERT INTO estudiante (
                run_ipe, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, 
                domicilio, latitud, longitud, id_apoderado_principal, id_apoderado_suplente, 
                pais_origen, documento_extranjero, fecha_actualizacion
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP) RETURNING id_estudiante
        """, (payload.get("run"), payload.get("nombres"), payload.get("apellido_paterno"), payload.get("apellido_materno"), 
              payload.get("fecha_nacimiento"), payload.get("sexo"), payload.get("domicilio"), 
              payload.get("latitud"), payload.get("longitud"), id_apoderado, id_suplente,
              payload.get("pais_origen_estudiante", "Chile"), payload.get("doc_extranjero_estudiante", None)))
        
        nuevo_id_est = cur.fetchone()[0]

        # 4. Insertar Ficha de Salud asociada
        cur.execute("""
            INSERT INTO ficha_salud (
                id_estudiante, sistema_salud, letra_fonasa, cesfam, centro_emergencia,
                alergias, diagnostico_medico, medico_tratante, medicamento, nee, nee_tipo,
                fecha_actualizacion
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (id_estudiante) DO UPDATE SET
                sistema_salud = EXCLUDED.sistema_salud,
                letra_fonasa = EXCLUDED.letra_fonasa,
                cesfam = EXCLUDED.cesfam,
                centro_emergencia = EXCLUDED.centro_emergencia,
                alergias = EXCLUDED.alergias,
                diagnostico_medico = EXCLUDED.diagnostico_medico,
                medico_tratante = EXCLUDED.medico_tratante,
                medicamento = EXCLUDED.medicamento,
                nee = EXCLUDED.nee,
                nee_tipo = EXCLUDED.nee_tipo,
                fecha_actualizacion = CURRENT_TIMESTAMP;
        """, (
            nuevo_id_est,
            payload.get("sistema_salud") or "No informado",
            payload.get("letra_fonasa") or "-",
            payload.get("cesfam") or "No informado",
            payload.get("centro_emergencia") or "No informado",
            payload.get("alergias") or "",
            payload.get("diagnostico_medico") or "No",
            payload.get("medico_tratante") or "No informado",
            payload.get("medicamento") or "",
            payload.get("nee") or "No",
            payload.get("nee_tipo") or "No aplica"
        ))

        conn.commit()
        return {"mensaje": "Estudiante guardado exitosamente", "id_estudiante": nuevo_id_est, "run": payload.get("run")}
    except HTTPException:
        # Errores de validación (422, etc.) se devuelven tal cual, no como 500.
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar: {e}")
    finally:
        cur.close()
        conn.close()

def buscar_apoderado_por_rut_db(rut_apoderado: str):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT a.id_apoderado, a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno,
                   a.domicilio, a.telefono, a.correo_electronico,
                   COUNT(e.id_estudiante) AS n_estudiantes
            FROM apoderado a
            LEFT JOIN estudiante e ON e.id_apoderado_principal = a.id_apoderado
            WHERE a.rut_pasaporte = %s
            GROUP BY a.id_apoderado, a.rut_pasaporte, a.nombres, a.apellido_paterno, a.apellido_materno,
                     a.domicilio, a.telefono, a.correo_electronico
            """,
            (normalizar_rut(rut_apoderado),),
        )
        fila = cur.fetchone()
        if not fila:
            return {"existe": False}
        return {
            "existe": True,
            "id_apoderado": fila[0],
            "rut_apoderado": fila[1],
            "nombres_apoderado": fila[2] or "",
            "apellido_paterno_apoderado": fila[3] or "",
            "apellido_materno_apoderado": fila[4] or "",
            "domicilio_apoderado": fila[5] or "",
            "telefono_apoderado": fila[6] or "",
            "correo_apoderado": fila[7] or "",
            "n_estudiantes": fila[8],
        }
    finally:
        cur.close()
        conn.close()


def _snapshot_ficha(cur, id_estudiante, id_apod_princ, id_apod_supl):
    """Toma una foto de los datos de apoderado titular, suplente y ficha de salud,
    para comparar antes/después y auditar TODA la ficha, no solo el domicilio.
    No incluye el domicilio del alumno (ese se audita con detalle aparte)."""
    def datos_apoderado(id_apod):
        if not id_apod:
            return None
        cur.execute(
            "SELECT rut_pasaporte, nombres, apellido_paterno, apellido_materno, "
            "domicilio, telefono, correo_electronico, relacion_estudiante "
            "FROM apoderado WHERE id_apoderado = %s",
            (id_apod,),
        )
        r = cur.fetchone()
        if not r:
            return None
        return {
            "rut": r[0], "nombres": r[1], "apellido_paterno": r[2], "apellido_materno": r[3],
            "domicilio": r[4], "telefono": r[5], "correo_electronico": r[6], "relacion": r[7],
        }

    cur.execute(
        "SELECT sistema_salud, letra_fonasa, cesfam, centro_emergencia, alergias, "
        "diagnostico_medico, medico_tratante, medicamento, nee, nee_tipo "
        "FROM ficha_salud WHERE id_estudiante = %s",
        (id_estudiante,),
    )
    s = cur.fetchone()
    salud = None
    if s:
        salud = {
            "sistema_salud": s[0], "letra_fonasa": s[1], "cesfam": s[2],
            "centro_emergencia": s[3], "alergias": s[4], "diagnostico_medico": s[5],
            "medico_tratante": s[6], "medicamento": s[7], "nee": s[8], "nee_tipo": s[9],
        }

    c = None
    if _tiene_columnas_correo(cur):
        cur.execute(
            "SELECT correo_personal, correo_institucional FROM estudiante WHERE id_estudiante = %s",
            (id_estudiante,),
        )
        c = cur.fetchone()
    contacto_estudiante = {
        "correo_personal": c[0] if c else None,
        "correo_institucional": c[1] if c else None,
    }

    return {
        "apoderado_titular": datos_apoderado(id_apod_princ),
        "apoderado_suplente": datos_apoderado(id_apod_supl),
        "salud": salud,
        "contacto_estudiante": contacto_estudiante,
    }


# Etiquetas legibles por sección (qué campos cambiaron; sin exponer valores sensibles).
_ETIQUETA_SECCION = {
    "apoderado_titular": "Apoderado titular",
    "apoderado_suplente": "Apoderado suplente",
    "salud": "Ficha de salud",
    "contacto_estudiante": "Correo del estudiante",
}


def _comparar_seccion(antes, despues):
    """Devuelve la lista de campos que cambiaron entre dos dicts (o None)."""
    if antes is None and despues is None:
        return []
    if antes is None:
        return ["(agregado)"]
    if despues is None:
        return ["(eliminado)"]
    campos = []
    for k in despues:
        if (antes.get(k) or "") != (despues.get(k) or ""):
            campos.append(k)
    return campos


def _registrar_auditoria_estudiante(cur, rut, id_usuario, dir_anterior, dir_nueva,
                                    snapshot_antes=None, snapshot_despues=None):
    """Registra en auditoria_matricula los cambios de la ficha del estudiante
    (domicilio del alumno + apoderado titular/suplente + ficha de salud).

    REGLA: solo registra si hubo un cambio REAL. Si nada cambió, no crea evento
    (evita el ruido de "sin cambios" al guardar sin modificar nada).

    PRIVACIDAD: el domicilio del alumno sí se guarda con sus valores (es dato
    georreferenciable del registro). Para apoderado y salud se guarda SOLO qué
    campos cambiaron (nombres de campo), sin exponer teléfonos/correos/valores.
    """
    # 1. ¿Cambió el domicilio del alumno?
    dir_cambio = any((dir_anterior.get(k) or "") != (dir_nueva.get(k) or "")
                     for k in ("calle", "numero", "sector", "comuna", "domicilio"))

    # 2. ¿Cambió apoderado/salud? (detalle de campos por sección)
    secciones_cambiadas = {}
    if snapshot_antes is not None and snapshot_despues is not None:
        for sec in ("apoderado_titular", "apoderado_suplente", "salud", "contacto_estudiante"):
            campos = _comparar_seccion(snapshot_antes.get(sec), snapshot_despues.get(sec))
            if campos:
                secciones_cambiadas[sec] = campos

    # Si no cambió NADA, no registramos auditoría.
    if not dir_cambio and not secciones_cambiadas:
        return

    # 3. Armar resumen legible de lo que cambió.
    partes = []
    if dir_cambio:
        partes.append("Domicilio del estudiante")
    for sec, campos in secciones_cambiadas.items():
        partes.append(f"{_ETIQUETA_SECCION[sec]} ({', '.join(campos)})")
    resumen = "Actualización de ficha: " + " · ".join(partes)

    # 4. Buscar la matrícula a la que colgar el evento (modelo actual de auditoría).
    cur.execute(
        """
        SELECT id_matricula FROM matricula
        WHERE id_estudiante = (SELECT id_estudiante FROM estudiante WHERE run_ipe = %s)
        ORDER BY id_matricula DESC LIMIT 1
        """,
        (rut,),
    )
    mat_result = cur.fetchone()
    if not mat_result:
        return
    id_matricula = mat_result[0]

    # 5. Snapshots: domicilio con valores; apoderado/salud solo campos cambiados.
    datos_ant = json.dumps({
        "tipo": "actualizacion_ficha",
        "resumen": resumen,
        "direccion": dir_anterior if dir_cambio else None,
        "secciones_modificadas": list(secciones_cambiadas.keys()),
    }, ensure_ascii=False, default=str)
    datos_nuev = json.dumps({
        "tipo": "actualizacion_ficha",
        "resumen": resumen,
        "direccion": dir_nueva if dir_cambio else None,
        "campos_modificados": secciones_cambiadas,
    }, ensure_ascii=False, default=str)
    cur.execute(
        """
        INSERT INTO auditoria_matricula (id_matricula, accion, id_usuario, datos_anteriores, datos_nuevos)
        VALUES (%s, 'UPDATE', %s, %s, %s)
        """,
        (id_matricula, id_usuario, datos_ant, datos_nuev),
    )


def actualizar_datos_estudiante_db(rut: str, req, id_usuario: int, usuario_actual: dict = None): 
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if usuario_actual:
            verificar_acceso_estudiante_db(rut, usuario_actual, cur)

        # 1. Obtener estudiante existente y valores anteriores para auditoría
        cur.execute("""
            SELECT id_estudiante, id_apoderado_principal, id_apoderado_suplente,
                   calle, numero, sector, comuna, domicilio 
            FROM estudiante WHERE run_ipe = %s
        """, (rut,))
        est_db = cur.fetchone()
        if not est_db:
            raise HTTPException(status_code=404, detail="Estudiante no encontrado")
            
        id_estudiante, id_apod_princ, id_apod_supl, prev_calle, prev_num, prev_sec, prev_com, prev_dom = est_db
        dir_anterior = {
            "calle": prev_calle, "numero": prev_num, "sector": prev_sec,
            "comuna": prev_com, "domicilio": prev_dom
        }

        # Snapshot ANTES de apoderado(s) y salud, para auditar TODA la ficha (no solo
        # el domicilio del alumno). Se compara con el snapshot DESPUÉS al final.
        snapshot_antes = _snapshot_ficha(cur, id_estudiante, id_apod_princ, id_apod_supl)

        # 2. Dirección del estudiante: estructurada o campo único
        usa_estructurado = any(
            getattr(req, campo, None) is not None
            for campo in ("calle", "numero", "sector", "comuna")
        )

        # ¿Cambió realmente la dirección? Si sí, limpiamos lat/lon para que el alumno
        # entre a la "cola" de geocodificación (worker manual la resuelve 1/seg, por
        # detrás, sin llamar a OpenStreetMap al guardar ni saturar su límite).
        def _dir_cambio_para_geo(nuevos: dict) -> bool:
            return any((dir_anterior.get(k) or "") != (nuevos.get(k) or "")
                       for k in ("calle", "numero", "sector", "comuna", "domicilio"))

        if usa_estructurado:
            calle = " ".join((req.calle or "").split()) or None
            numero = normalizar_numero_domicilio(req.numero)
            sector = " ".join((req.sector or "").split()) or None
            comuna = " ".join((req.comuna or "").split()) or None
            # Misma regla que el frontend: calle, número y comuna son obligatorios
            # (el sector/cerro es opcional; sin número se indica 'S/N').
            if not (calle and numero and comuna):
                raise HTTPException(
                    status_code=422,
                    detail="Domicilio del estudiante incompleto: calle, número y comuna son obligatorios "
                           "(use 'S/N' si el domicilio no tiene número).",
                )
            domicilio_final = componer_domicilio(calle, numero, sector, comuna)
            cambio_geo = _dir_cambio_para_geo({
                "calle": calle, "numero": numero, "sector": sector,
                "comuna": comuna, "domicilio": domicilio_final,
            })
            if cambio_geo:
                # Marcar pendiente de geocodificar: lat/lon a NULL.
                cur.execute(
                    "UPDATE estudiante SET calle = %s, numero = %s, sector = %s, comuna = %s, "
                    "domicilio = %s, latitud = NULL, longitud = NULL, geo_precision = NULL "
                    "WHERE id_estudiante = %s",
                    (calle, numero, sector, comuna, domicilio_final, id_estudiante),
                )
            else:
                cur.execute(
                    "UPDATE estudiante SET calle = %s, numero = %s, sector = %s, comuna = %s, "
                    "domicilio = %s WHERE id_estudiante = %s",
                    (calle, numero, sector, comuna, domicilio_final, id_estudiante),
                )
        elif req.domicilio_estudiante is not None:
            domicilio_final = req.domicilio_estudiante
            if _dir_cambio_para_geo({"domicilio": domicilio_final}):
                cur.execute(
                    "UPDATE estudiante SET domicilio = %s, latitud = NULL, longitud = NULL, "
                    "geo_precision = NULL WHERE id_estudiante = %s",
                    (domicilio_final, id_estudiante),
                )
            else:
                cur.execute(
                    "UPDATE estudiante SET domicilio = %s WHERE id_estudiante = %s",
                    (domicilio_final, id_estudiante),
                )
        else:
            domicilio_final = prev_dom

        dir_nueva = {
            "calle": calle if usa_estructurado else dir_anterior["calle"],
            "numero": numero if usa_estructurado else dir_anterior["numero"],
            "sector": sector if usa_estructurado else dir_anterior["sector"],
            "comuna": comuna if usa_estructurado else dir_anterior["comuna"],
            "domicilio": domicilio_final,
        }

        # 2b. Correo del estudiante (personal / institucional).
        #     Formato: se valida siempre que se informe. Obligatoriedad: regla
        #     parametrizada por nivel (reglas_estudiante.py), evaluada sobre el valor
        #     final (el enviado o, si no se envía, el ya guardado).
        nuevo_personal = getattr(req, "correo_personal", None)
        nuevo_institucional = getattr(req, "correo_institucional", None)
        validar_formato_correo(nuevo_personal, "El correo personal del estudiante")
        validar_formato_correo(nuevo_institucional, "El correo institucional del estudiante")

        # Sin la migración aplicada no hay dónde guardar el correo: se omite el bloque
        # (no se exige ni se escribe) para no bloquear el guardado del resto de la ficha.
        if _tiene_columnas_correo(cur):
            _guardar_correo_estudiante(cur, id_estudiante, nuevo_personal, nuevo_institucional)

        try:
            cur.execute("UPDATE estudiante SET fecha_actualizacion = CURRENT_TIMESTAMP WHERE id_estudiante = %s", (id_estudiante,))
        except Exception:
            pass

        # 3. Procesar Apoderado Principal
        if req.rut_apoderado:
            rut_nuevo = normalizar_rut(req.rut_apoderado)
            nom_a = req.nombres_apoderado or "Apoderado"
            pat_a = req.apellido_paterno_apoderado or "Titular"
            mat_a = req.apellido_materno_apoderado or ""
            # Prioridad: domicilio desglosado enviado > texto enviado > el que ya tenía el
            # apoderado > el del estudiante > 'Sin registrar'. Antes los campos desglosados se
            # ignoraban y el domicilio del apoderado se pisaba con el del estudiante.
            dom_a = (
                componer_domicilio(
                    getattr(req, "calle_apoderado", None), normalizar_numero_domicilio(getattr(req, "numero_apoderado", None)),
                    getattr(req, "sector_apoderado", None), getattr(req, "comuna_apoderado", None),
                )
                or req.domicilio_apoderado
                or _domicilio_guardado(cur, id_apod_princ)
                or domicilio_final
                or "Sin registrar"
            )
            tel_a = req.telefono_apoderado or ""
            cor_a = req.correo_apoderado or ""

            # Validación de parentesco (catálogo único; acepta el valor histórico ya guardado).
            validar_parentesco(
                getattr(req, "relacion_apoderado", None),
                _relaciones_guardadas(cur, id_apoderado=id_apod_princ, rut=rut_nuevo),
                "Parentesco del apoderado titular",
            )

            rel_a = getattr(req, "relacion_apoderado", None)
            if not rel_a and id_apod_princ:
                cur.execute("SELECT relacion_estudiante FROM apoderado WHERE id_apoderado = %s", (id_apod_princ,))
                row_rel = cur.fetchone()
                if row_rel and row_rel[0]:
                    rel_a = row_rel[0]
            if not rel_a:
                rel_a = "Madre"

            cur.execute("SELECT id_apoderado FROM apoderado WHERE rut_pasaporte = %s", (rut_nuevo,))
            apod_exist = cur.fetchone()

            if apod_exist:
                id_apod_existente = apod_exist[0]
                if id_apod_princ == id_apod_existente:
                    # Mismo apoderado ya vinculado -> edición normal
                    cur.execute("""
                        UPDATE apoderado 
                        SET nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                            domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                        WHERE id_apoderado = %s
                    """, (nom_a, pat_a, mat_a, dom_a, tel_a, cor_a, rel_a, id_apod_princ))
                else:
                    # Opción 1: el RUT pertenece a otro apoderado -> solo vinculamos sin pisar datos
                    cur.execute("UPDATE estudiante SET id_apoderado_principal = %s WHERE id_estudiante = %s", (id_apod_existente, id_estudiante))
            else:
                if id_apod_princ:
                    cur.execute("""
                        UPDATE apoderado 
                        SET rut_pasaporte = %s, nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                            domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                        WHERE id_apoderado = %s
                    """, (rut_nuevo, nom_a, pat_a, mat_a, dom_a, tel_a, cor_a, rel_a, id_apod_princ))
                else:
                    cur.execute("""
                        INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno, domicilio, telefono, correo_electronico, relacion_estudiante)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                    """, (rut_nuevo, nom_a, pat_a, mat_a, dom_a, tel_a, cor_a, rel_a))
                    nuevo_id = cur.fetchone()[0]
                    cur.execute("UPDATE estudiante SET id_apoderado_principal = %s WHERE id_estudiante = %s", (nuevo_id, id_estudiante))

        # 4. Procesar Apoderado Suplente
        modificar_supl = getattr(req, "modificar_suplente", False)
        if getattr(req, "tiene_suplente", False) and getattr(req, "rut_suplente", None):
            rut_supl_norm = normalizar_rut(req.rut_suplente)
            nom_s = req.nombres_suplente or "Apoderado"
            pat_s = req.apellido_paterno_suplente or "Suplente"
            mat_s = req.apellido_materno_suplente or ""
            dom_s = (
                componer_domicilio(
                    getattr(req, "calle_suplente", None), normalizar_numero_domicilio(getattr(req, "numero_suplente", None)),
                    getattr(req, "sector_suplente", None), getattr(req, "comuna_suplente", None),
                )
                or req.domicilio_suplente
                or _domicilio_guardado(cur, id_apod_supl)
                or req.domicilio_apoderado
                or domicilio_final
                or "Sin registrar"
            )
            tel_s = req.telefono_suplente or ""
            cor_s = req.correo_suplente or ""

            # Mismo catálogo y misma regla que el titular.
            validar_parentesco(
                getattr(req, "relacion_suplente", None),
                _relaciones_guardadas(cur, id_apoderado=id_apod_supl, rut=rut_supl_norm),
                "Parentesco del apoderado suplente",
            )

            rel_s = getattr(req, "relacion_suplente", None)
            if not rel_s and id_apod_supl:
                cur.execute("SELECT relacion_estudiante FROM apoderado WHERE id_apoderado = %s", (id_apod_supl,))
                row_rel_s = cur.fetchone()
                if row_rel_s and row_rel_s[0]:
                    rel_s = row_rel_s[0]
            if not rel_s:
                rel_s = "Suplente"

            if id_apod_supl:
                cur.execute("""
                    UPDATE apoderado 
                    SET rut_pasaporte = %s, nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                        domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                    WHERE id_apoderado = %s
                """, (rut_supl_norm, nom_s, pat_s, mat_s, dom_s, tel_s, cor_s, rel_s, id_apod_supl))
            else:
                cur.execute("SELECT id_apoderado, relacion_estudiante FROM apoderado WHERE rut_pasaporte = %s", (rut_supl_norm,))
                sup_exist = cur.fetchone()
                if sup_exist:
                    id_apod_supl = sup_exist[0]
                    if not getattr(req, "relacion_suplente", None) and sup_exist[1]:
                        rel_s = sup_exist[1]
                    cur.execute("""
                        UPDATE apoderado 
                        SET nombres = %s, apellido_paterno = %s, apellido_materno = %s, 
                            domicilio = %s, telefono = %s, correo_electronico = %s, relacion_estudiante = %s
                        WHERE id_apoderado = %s
                    """, (nom_s, pat_s, mat_s, dom_s, tel_s, cor_s, rel_s, id_apod_supl))
                else:
                    cur.execute("""
                        INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno, domicilio, telefono, correo_electronico, relacion_estudiante)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_apoderado
                    """, (rut_supl_norm, nom_s, pat_s, mat_s, dom_s, tel_s, cor_s, rel_s))
                    id_apod_supl = cur.fetchone()[0]

                cur.execute("UPDATE estudiante SET id_apoderado_suplente = %s WHERE id_estudiante = %s", (id_apod_supl, id_estudiante))
        elif modificar_supl and (getattr(req, "tiene_suplente", None) is False):
            cur.execute("UPDATE estudiante SET id_apoderado_suplente = NULL WHERE id_estudiante = %s", (id_estudiante,))

        # 5. Procesar Ficha Médica / Salud
        if getattr(req, "actualizar_salud", False) or getattr(req, "sistema_salud", None):
            sis_salud = req.sistema_salud or "No informado"
            let_fon = req.letra_fonasa or "-"
            cesfam = req.cesfam or "No informado"
            emergencia = req.centro_emergencia or "No informado"
            alergias = req.alergias or ""
            diag_med = req.diagnostico_medico or "No"
            med_trat = req.medico_tratante or "No informado"
            meds = req.medicamento or ""
            nee = req.nee or "No"
            nee_tipo = req.nee_tipo or "No aplica"

            cur.execute("""
                INSERT INTO ficha_salud (
                    id_estudiante, sistema_salud, letra_fonasa, cesfam, centro_emergencia,
                    alergias, diagnostico_medico, medico_tratante, medicamento, nee, nee_tipo,
                    fecha_actualizacion
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id_estudiante) DO UPDATE SET
                    sistema_salud = EXCLUDED.sistema_salud,
                    letra_fonasa = EXCLUDED.letra_fonasa,
                    cesfam = EXCLUDED.cesfam,
                    centro_emergencia = EXCLUDED.centro_emergencia,
                    alergias = EXCLUDED.alergias,
                    diagnostico_medico = EXCLUDED.diagnostico_medico,
                    medico_tratante = EXCLUDED.medico_tratante,
                    medicamento = EXCLUDED.medicamento,
                    nee = EXCLUDED.nee,
                    nee_tipo = EXCLUDED.nee_tipo,
                    fecha_actualizacion = CURRENT_TIMESTAMP;
            """, (id_estudiante, sis_salud, let_fon, cesfam, emergencia, alergias, diag_med, med_trat, meds, nee, nee_tipo))

        # 6. Trazabilidad: snapshot DESPUÉS y registro de auditoría SOLO si hubo cambio real.
        # Reobtenemos los ids de apoderado por si se vincularon/crearon en este guardado.
        cur.execute(
            "SELECT id_apoderado_principal, id_apoderado_suplente FROM estudiante WHERE id_estudiante = %s",
            (id_estudiante,),
        )
        _ap_p, _ap_s = cur.fetchone()
        snapshot_despues = _snapshot_ficha(cur, id_estudiante, _ap_p, _ap_s)
        _registrar_auditoria_estudiante(
            cur, rut, id_usuario, dir_anterior, dir_nueva, snapshot_antes, snapshot_despues
        )

        conn.commit()
        return {"mensaje": "Datos y ficha médica actualizados exitosamente"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"Error BD: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()