# services/dashboard_service.py
import re
from fastapi import HTTPException
from database import get_db_connection

# Comunas conocidas de la región (para detectar/normalizar en direcciones informales).
_COMUNAS_GEO = [
    "valparaiso", "viña del mar", "vina del mar", "quilpue", "quilpué",
    "villa alemana", "casablanca", "concon", "concón", "limache", "olmue", "olmué",
    "quillota", "san antonio", "placilla", "curauma", "laguna verde",
]

# Palabras de ruido típicas del formato chileno informal que confunden al geocodificador.
_RUIDO_GEO = [
    r"\bPOBL[-\. ]?SECTOR\b", r"\bPOBLACION\b", r"\bPOBLACIÓN\b",
    r"\bBLOCK\b", r"\bBLOQUE\b", r"\bDEPTO?\b", r"\bDEPARTAMENTO\b",
    r"\bCASA\b", r"\bPASAJE\b", r"\bPSJE\b", r"\bPJE\b",
    r"\bVILLA\b", r"\bCONDOMINIO\b", r"\bPARCELA\b", r"\bSITIO\b",
    r"\bSECTOR\b", r"\bLOTE\b", r"\bNRO\b", r"\bEDIFICIO\b", r"\bTORRE\b",
]


def limpiar_direccion_geo(calle, numero, sector, comuna) -> str:
    """Convierte una dirección en formato chileno informal (ej:
    'IMPARCIAL CASA 4 Cerro PLAYA ANCHA') en una query más geocodificable por
    Nominatim/OpenStreetMap: 'calle numero, comuna, Chile'.

    Clave aprendida (probado): quitar el 'Cerro X' de la query MEJORA la tasa de
    aciertos (OSM mapea mal los cerros de Valparaíso). Pasó de 3/12 a 8/12.
    """
    txt = (calle or "").strip()

    # Comuna: del campo, o detectada en el texto, o Valparaíso por defecto.
    com = (comuna or "").strip()
    if not com:
        for c in _COMUNAS_GEO:
            if c in txt.lower():
                com = c
                break
    if not com:
        com = "Valparaíso"

    # Número: del campo, o el primero que aparezca en el texto.
    num = (numero or "").strip()
    if not num:
        m = re.search(r"\b(\d{1,6})\b", txt)
        if m:
            num = m.group(1)

    # Nombre de calle: quitar 'Cerro ...', ruido, números y la comuna.
    calle_limpia = re.sub(r"CERRO\s+[A-ZÁÉÍÓÚÑ'\. ]+", "", txt, flags=re.IGNORECASE)
    # Quitar 'N°'/'Nº'/'º'/'°' sueltos (restos de la numeración).
    calle_limpia = re.sub(r"[°º]", " ", calle_limpia)
    calle_limpia = re.sub(r"\bN\b", " ", calle_limpia)
    for pat in _RUIDO_GEO:
        calle_limpia = re.sub(pat, " ", calle_limpia, flags=re.IGNORECASE)
    calle_limpia = re.sub(r"\d+", " ", calle_limpia)
    for c in _COMUNAS_GEO:
        calle_limpia = re.sub(re.escape(c), "", calle_limpia, flags=re.IGNORECASE)
    calle_limpia = re.sub(r"[.\-]", " ", calle_limpia)
    calle_limpia = re.sub(r"\s+", " ", calle_limpia).strip().title()

    partes = []
    if calle_limpia:
        partes.append(f"{calle_limpia} {num}".strip())
    partes.append(com)
    partes.append("Chile")
    return ", ".join(p for p in partes if p)


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

        # Obtener todos los años disponibles SIN filtrar por el año actual
        cur.execute(f"SELECT DISTINCT anio_escolar FROM matricula WHERE anio_escolar IS NOT NULL {filtro_global} ORDER BY anio_escolar DESC", tuple(param_global))
        anios_disponibles = [row[0] for row in cur.fetchall()]

        # --- DATA DEL AÑO SELECCIONADO ---

        # ACTIVOS:
        # - Con año seleccionado: COUNT(DISTINCT id_estudiante) → un alumno con
        #   matrícula en 2 colegios del SLEP en el MISMO año cuenta 1 vez.
        # - Histórico (sin año): COUNT(*) de filas → suma las matrículas de todos
        #   los años, para que la tarjeta cuadre con las barras del gráfico anual.
        conteo_activos = "COUNT(DISTINCT id_estudiante)" if anio is not None else "COUNT(*)"
        cur.execute(f"SELECT {conteo_activos} FROM matricula WHERE estado IN ('Activa', 'Pendiente Retiro', 'Promovido', 'Repitente') {filtros_sql}", tuple(parametros))
        total_activos = cur.fetchone()[0]

        # RETIROS NETOS: Alumnos con estado Retirado/Inactiva que NO tienen
        # ninguna matrícula Activa/Promovido/Repitente en el mismo establecimiento y año.
        # Se excluye 'Anulada' porque representa errores administrativos, no deserciones reales.
        if establecimiento_id is not None and anio is not None:
            cur.execute("""
                SELECT COUNT(DISTINCT m.id_estudiante)
                FROM matricula m
                WHERE m.estado IN ('Retirado', 'Inactiva')
                  AND m.id_establecimiento = %s
                  AND m.anio_escolar = %s
                  AND m.id_estudiante NOT IN (
                      SELECT m2.id_estudiante
                      FROM matricula m2
                      WHERE m2.id_establecimiento = %s
                        AND m2.anio_escolar = %s
                        AND m2.estado IN ('Activa', 'Promovido', 'Repitente')
                  )
            """, (establecimiento_id, anio, establecimiento_id, anio))
        elif establecimiento_id is not None:
            # Sin filtro de año (histórico): cuenta retiros netos POR AÑO
            # (DISTINCT id_estudiante, anio) para que la tarjeta cuadre con la suma
            # de retiros de las barras del gráfico anual.
            cur.execute("""
                SELECT COUNT(DISTINCT (m.id_estudiante, m.anio_escolar))
                FROM matricula m
                WHERE m.estado IN ('Retirado', 'Inactiva')
                  AND m.id_establecimiento = %s
                  AND m.id_estudiante NOT IN (
                      SELECT m2.id_estudiante
                      FROM matricula m2
                      WHERE m2.id_establecimiento = m.id_establecimiento
                        AND m2.anio_escolar = m.anio_escolar
                        AND m2.estado IN ('Activa', 'Promovido', 'Repitente')
                  )
            """, (establecimiento_id,))
        elif anio is not None:
            # Sin filtro de establecimiento: compara globalmente en el mismo año
            cur.execute("""
                SELECT COUNT(DISTINCT m.id_estudiante)
                FROM matricula m
                WHERE m.estado IN ('Retirado', 'Inactiva')
                  AND m.anio_escolar = %s
                  AND m.id_estudiante NOT IN (
                      SELECT m2.id_estudiante
                      FROM matricula m2
                      WHERE m2.anio_escolar = %s
                        AND m2.estado IN ('Activa', 'Promovido', 'Repitente')
                  )
            """, (anio, anio))
        else:
            # Sin filtros (histórico global): retiros netos POR AÑO
            # (DISTINCT id_estudiante, anio) para cuadrar con la suma del gráfico anual.
            cur.execute("""
                SELECT COUNT(DISTINCT (m.id_estudiante, m.anio_escolar))
                FROM matricula m
                WHERE m.estado IN ('Retirado', 'Inactiva')
                  AND m.id_estudiante NOT IN (
                      SELECT m2.id_estudiante
                      FROM matricula m2
                      WHERE m2.id_establecimiento = m.id_establecimiento
                        AND m2.anio_escolar = m.anio_escolar
                        AND m2.estado IN ('Activa', 'Promovido', 'Repitente')
                  )
            """)
        total_inactivos = cur.fetchone()[0]

        # Desglose por nivel y curso: usa el MISMO criterio de conteo que la tarjeta
        # de activos (COUNT(*) en histórico, DISTINCT con año) para que los desgloses
        # sumen el mismo total.
        cur.execute(f"SELECT nivel_ensenanza, {conteo_activos} FROM matricula WHERE estado IN ('Activa', 'Pendiente Retiro', 'Promovido', 'Repitente') {filtros_sql} GROUP BY nivel_ensenanza ORDER BY nivel_ensenanza", tuple(parametros))
        por_nivel = [{"nombre": row[0] or "Sin Nivel", "cantidad": row[1]} for row in cur.fetchall()]

        # Desglose de cursos para ACTIVOS
        cur.execute(f"SELECT curso, {conteo_activos} FROM matricula WHERE estado IN ('Activa', 'Pendiente Retiro', 'Promovido', 'Repitente') {filtros_sql} GROUP BY curso ORDER BY curso", tuple(parametros))
        por_curso = [{"nombre": row[0] or "Sin Curso", "cantidad": row[1]} for row in cur.fetchall()]

        # Desglose de cursos para RETIROS NETOS
        # Solo cuenta alumnos Retirado/Inactiva que NO tienen otra matricula Activa en el mismo colegio/año
        cur.execute(f"""
            SELECT m.curso, COUNT(DISTINCT m.id_estudiante)
            FROM matricula m
            WHERE m.estado IN ('Retirado', 'Inactiva')
              {filtros_sql}
              AND m.id_estudiante NOT IN (
                  SELECT m2.id_estudiante
                  FROM matricula m2
                  WHERE m2.id_establecimiento = m.id_establecimiento
                    AND m2.anio_escolar = m.anio_escolar
                    AND m2.estado IN ('Activa', 'Promovido', 'Repitente')
              )
            GROUP BY m.curso
            ORDER BY m.curso
        """, tuple(parametros))
        por_curso_retiros = [{"nombre": row[0] or "Sin Curso", "cantidad": row[1]} for row in cur.fetchall()]

        # --- CONSTRUCCION DEL HISTORICO REAL DESDE 2022 ---
        # Traemos id_estudiante para poder calcular retiros netos en Python
        cur.execute(f"""
            SELECT anio_escolar, id_estudiante, estado, curso, id_establecimiento
            FROM matricula
            WHERE anio_escolar >= 2022 {filtro_global}
        """, tuple(param_global))
        
        filas_historial = cur.fetchall()

        # Construimos un indice auxiliar: alumnos activos por (establecimiento, anio)
        # para descartar falsos positivos en el loop del historico
        activos_por_colegio_anio: dict = {}
        for anio_h, id_est_h, estado_h, curso_h, id_est_2 in filas_historial:
            if estado_h in ('Activa', 'Promovido', 'Repitente'):
                key = (id_est_2, anio_h)
                activos_por_colegio_anio.setdefault(key, set()).add(id_est_h)

        historico_dict: dict = {}
        # Conjuntos para evitar doble conteo de retiros unicos por anio
        retiros_contados: dict = {}  # anio -> set(id_estudiante)

        for anio_h, id_est_h, estado_h, curso_h, id_est_2 in filas_historial:
            if anio_h not in historico_dict:
                historico_dict[anio_h] = {"anio": anio_h, "activos": 0, "retiros": 0, "cursos": {}, "cursos_retiros": {}}
            if anio_h not in retiros_contados:
                retiros_contados[anio_h] = set()

            # Limpiamos y agrupamos el nombre del curso (Ej: "1 basico A" -> "1 Basico")
            curso_str = str(curso_h).strip() if curso_h else ""
            if curso_str:
                match = re.match(r"^(.*?)\s+[A-Za-z]$", curso_str)
                nombre_base = match.group(1).strip().capitalize() if match else curso_str.capitalize()
            else:
                nombre_base = "Sin Curso"

            if estado_h in ('Activa', 'Promovido', 'Repitente'):
                historico_dict[anio_h]["activos"] += 1
                if curso_str:
                    historico_dict[anio_h]["cursos"][nombre_base] = historico_dict[anio_h]["cursos"].get(nombre_base, 0) + 1
            elif estado_h in ('Retirado', 'Inactiva'):
                # Solo cuenta como retiro neto si el alumno NO esta activo en este colegio/anio
                key_activos = (id_est_2, anio_h)
                alumno_activo_en_este_anio = id_est_h in activos_por_colegio_anio.get(key_activos, set())
                
                if not alumno_activo_en_este_anio and id_est_h not in retiros_contados[anio_h]:
                    retiros_contados[anio_h].add(id_est_h)
                    historico_dict[anio_h]["retiros"] += 1
                    if curso_str:
                        historico_dict[anio_h]["cursos_retiros"][nombre_base] = historico_dict[anio_h]["cursos_retiros"].get(nombre_base, 0) + 1

        # Ordenar el historial de menor a mayor anio para el grafico
        historico_real = sorted(list(historico_dict.values()), key=lambda x: x["anio"])

        # --- KPIs DEL PROCESO DE RENOVACION (piloto) ---
        # Desglose por estado_renovacion para el anio/colegio seleccionado. Solo
        # considera matriculas que participan del flujo (estado_renovacion NO NULL).
        cur.execute(f"""
            SELECT estado_renovacion, COUNT(*)
            FROM matricula
            WHERE estado_renovacion IS NOT NULL {filtros_sql}
            GROUP BY estado_renovacion
        """, tuple(parametros))
        renov_raw = {row[0]: row[1] for row in cur.fetchall()}

        # Universo "a renovar" = las que siguen en el flujo (excluye Egresado y No renueva).
        por_renovar = renov_raw.get("Por renovar", 0)
        pendiente_firma = renov_raw.get("Pendiente firma", 0)
        firmada = renov_raw.get("Firmada", 0)
        no_renueva = renov_raw.get("No renueva", 0)
        egresado = renov_raw.get("Egresado", 0)
        total_a_renovar = por_renovar + pendiente_firma + firmada
        avance_pct = round((firmada / total_a_renovar) * 100, 1) if total_a_renovar > 0 else 0.0

        renovacion = {
            "activa": total_a_renovar > 0 or egresado > 0 or no_renueva > 0,
            "por_renovar": por_renovar,
            "pendiente_firma": pendiente_firma,
            "firmada": firmada,
            "no_renueva": no_renueva,
            "egresado": egresado,
            "total_a_renovar": total_a_renovar,
            "avance_pct": avance_pct,
        }

        # --- CALIDAD DEL DATO ---
        # % de estudiantes (de los activos del filtro) con apoderado principal cargado.
        cur.execute(f"""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE e.id_apoderado_principal IS NOT NULL) AS con_apoderado
            FROM matricula m
            JOIN estudiante e ON e.id_estudiante = m.id_estudiante
            WHERE m.estado IN ('Activa', 'Pendiente Retiro') {filtros_sql.replace('id_establecimiento', 'm.id_establecimiento').replace('anio_escolar', 'm.anio_escolar')}
        """, tuple(parametros))
        cal = cur.fetchone()
        total_cal = cal[0] or 0
        con_apod = cal[1] or 0
        calidad_dato = {
            "total": total_cal,
            "con_apoderado": con_apod,
            "sin_apoderado": total_cal - con_apod,
            "pct_con_apoderado": round((con_apod / total_cal) * 100, 1) if total_cal > 0 else 0.0,
        }

        return {
            "anios_disponibles": anios_disponibles,
            "total_activos": total_activos,
            "total_inactivos": total_inactivos,
            "por_nivel": por_nivel,
            "por_curso": por_curso,
            "por_curso_retiros": por_curso_retiros,
            "historico": historico_real,
            "renovacion": renovacion,
            "calidad_dato": calidad_dato
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al generar estadisticas: " + str(e))
    finally:
        cur.close()
        conn.close()


def obtener_calidad_dato_por_establecimiento_db(establecimiento_id: int = None, anio: int = None):
    """Semaforo de calidad del dato: por establecimiento, % de alumnos activos con
    direccion geolocalizable (domicilio con numero) y % con apoderado principal cargado.
    - SLEP (establecimiento_id None): devuelve todos los colegios (ranking).
    - Colegio: solo el suyo.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Si no se pasa anio, usar el mas reciente disponible.
        if anio is None:
            cur.execute("SELECT MAX(anio_escolar) FROM matricula")
            row = cur.fetchone()
            anio = row[0] if row and row[0] else None

        filtros = "m.anio_escolar = %s AND m.estado = 'Activa'"
        params = [anio]
        if establecimiento_id is not None:
            filtros += " AND m.id_establecimiento = %s"
            params.append(establecimiento_id)

        cur.execute(f"""
            SELECT est.id_establecimiento, est.rbd, est.nombre,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (
                       WHERE e.domicilio IS NOT NULL
                         AND length(trim(e.domicilio)) > 8
                         AND e.domicilio ~ '[0-9]'
                   ) AS con_direccion,
                   COUNT(*) FILTER (WHERE e.id_apoderado_principal IS NOT NULL) AS con_apoderado
            FROM matricula m
            JOIN estudiante e ON e.id_estudiante = m.id_estudiante
            JOIN establecimiento est ON est.id_establecimiento = m.id_establecimiento
            WHERE {filtros}
            GROUP BY est.id_establecimiento, est.rbd, est.nombre
            HAVING COUNT(*) >= 20
            ORDER BY
                (COUNT(*) FILTER (WHERE e.domicilio IS NOT NULL AND length(trim(e.domicilio)) > 8 AND e.domicilio ~ '[0-9]'))::float
                / COUNT(*) DESC
        """, tuple(params))

        items = []
        for r in cur.fetchall():
            idp, rbd, nombre, total, con_dir, con_apod = r
            items.append({
                "id_establecimiento": idp,
                "rbd": rbd,
                "nombre": nombre,
                "total": total,
                "con_direccion": con_dir,
                "con_apoderado": con_apod,
                "pct_direccion": round(con_dir / total * 100, 1) if total else 0.0,
                "pct_apoderado": round(con_apod / total * 100, 1) if total else 0.0,
            })

        return {"anio": anio, "establecimientos": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al calcular calidad del dato: " + str(e))
    finally:
        cur.close()
        conn.close()


def obtener_muestra_geo_db(establecimiento_id: int = None, limite: int = 15):
    """Muestra de direcciones reales (anonimizadas) de un colegio para el mapa de ejemplo.
    No expone el nombre completo del menor: devuelve iniciales + curso + direccion.
    Si no se pasa establecimiento, elige el de mayor % de direccion geolocalizable.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT MAX(anio_escolar) FROM matricula")
        row = cur.fetchone()
        anio = row[0] if row and row[0] else None

        # Elegir colegio con mayor tasa de direccion util si no viene dado.
        if establecimiento_id is None:
            cur.execute("""
                SELECT m.id_establecimiento
                FROM matricula m JOIN estudiante e ON e.id_estudiante = m.id_estudiante
                WHERE m.anio_escolar = %s AND m.estado = 'Activa'
                GROUP BY m.id_establecimiento
                HAVING COUNT(*) >= 50
                ORDER BY (COUNT(*) FILTER (WHERE e.domicilio ~ '[0-9]'))::float / COUNT(*) DESC
                LIMIT 1
            """, (anio,))
            row = cur.fetchone()
            establecimiento_id = row[0] if row else None

        cur.execute("""
            SELECT est.nombre, est.rbd,
                   e.nombres, e.apellido_paterno, m.curso,
                   e.calle, e.numero, e.sector, e.comuna, e.domicilio
            FROM matricula m
            JOIN estudiante e ON e.id_estudiante = m.id_estudiante
            JOIN establecimiento est ON est.id_establecimiento = m.id_establecimiento
            WHERE m.anio_escolar = %s AND m.estado = 'Activa'
              AND m.id_establecimiento = %s
              AND e.domicilio IS NOT NULL AND e.domicilio ~ '[0-9]'
              AND (e.comuna IS NOT NULL AND trim(e.comuna) <> '')
            ORDER BY random()
            LIMIT %s
        """, (anio, establecimiento_id, limite))

        filas = cur.fetchall()
        nombre_colegio = filas[0][0] if filas else ""
        rbd = filas[0][1] if filas else ""
        muestra = []
        for r in filas:
            nombres, ap_pat, curso, calle, numero, sector, comuna, domicilio = r[2:]
            iniciales = f"{(nombres or '?')[:1]}.{(ap_pat or '?')[:1]}."
            # Direccion limpia para geocodificar (quita ruido y 'Cerro X' -> mejor tasa en OSM).
            dir_geo = limpiar_direccion_geo(calle or domicilio, numero, sector, comuna)
            muestra.append({
                "etiqueta": iniciales,
                "curso": curso,
                "comuna": comuna,
                "direccion_geo": dir_geo,
            })

        return {
            "anio": anio,
            "id_establecimiento": establecimiento_id,
            "nombre_colegio": nombre_colegio,
            "rbd": rbd,
            "muestra": muestra,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error al obtener muestra geo: " + str(e))
    finally:
        cur.close()
        conn.close()
