# services/asistencia_service.py
"""
Servicio de ANALÍTICA DE ASISTENCIA (dominio de datos, ver steering 10).
Lee de matriculas.asistencia_mensual y entrega AGREGADOS (sin datos personales):
KPIs, semáforo de riesgo por reglas, ranking por establecimiento y tendencia mensual.

Reglas del semáforo (idénticas al análisis exploratorio, explicables):
- Umbral insuficiente < 0.85 ; grave < 0.70.
- Por alumno, sobre su trayectoria del año:
    'Revisar'  : 1 solo mes y promedio 0  (posible retiro, no inasistencia)
    'Rojo'     : promedio < 0.70  OR  >=3 meses bajo 0.70
    'Amarillo' : promedio < 0.85  (y no rojo)
    'Verde'    : resto
  (La pendiente/tendencia se calcula aparte en el panel; aquí usamos promedio y
   persistencia, que es lo robusto para agregados.)
"""
from fastapi import HTTPException
from database import get_db_connection

UMBRAL_INSUF = 0.85
UMBRAL_GRAVE = 0.70

# Solo el segmento 'escolar' entra al análisis comparable (steering 08/10).
# VTF y adultos/especial se ven aparte en el futuro.
SEGMENTO = "escolar"


def _año_filtro(cur):
    cur.execute("SELECT COALESCE(MAX(anio_academico), 0) FROM matriculas.asistencia_mensual")
    return cur.fetchone()[0]


def obtener_resumen_asistencia_db(establecimiento_id=None, anio=None):
    """Devuelve el agregado para el Panel de Asistencia. Sin nombres/RUT."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if not anio:
            anio = _año_filtro(cur)

        filtro_est = ""
        params = {"anio": anio, "seg": SEGMENTO, "insuf": UMBRAL_INSUF, "grave": UMBRAL_GRAVE}
        if establecimiento_id:
            filtro_est = "AND id_establecimiento = %(est)s"
            params["est"] = establecimiento_id

        # --- Por-alumno: promedio del año, meses, meses bajo 0.70 ---
        base_alumno = f"""
            SELECT id_estudiante,
                   AVG(pct_asist)                              AS prom,
                   COUNT(*)                                    AS n_meses,
                   COUNT(*) FILTER (WHERE pct_asist < %(grave)s) AS meses_graves
            FROM matriculas.asistencia_mensual
            WHERE anio_academico = %(anio)s AND segmento = %(seg)s {filtro_est}
            GROUP BY id_estudiante
        """

        # --- KPIs globales ---
        cur.execute(f"""
            SELECT COUNT(*) AS alumnos,
                   ROUND(AVG(prom)::numeric, 4) AS prom_global
            FROM ({base_alumno}) a
        """, params)
        row = cur.fetchone()
        total_alumnos = row[0] or 0
        prom_global = float(row[1]) if row[1] is not None else 0.0

        # --- Semáforo (clasificación por reglas, en SQL) ---
        cur.execute(f"""
            WITH a AS ({base_alumno})
            SELECT
              COUNT(*) FILTER (WHERE n_meses = 1 AND prom = 0)                           AS revisar,
              COUNT(*) FILTER (WHERE NOT (n_meses = 1 AND prom = 0)
                                 AND (prom < %(grave)s OR meses_graves >= 3))            AS rojo,
              COUNT(*) FILTER (WHERE NOT (n_meses = 1 AND prom = 0)
                                 AND NOT (prom < %(grave)s OR meses_graves >= 3)
                                 AND prom < %(insuf)s)                                   AS amarillo,
              COUNT(*) FILTER (WHERE NOT (n_meses = 1 AND prom = 0)
                                 AND NOT (prom < %(grave)s OR meses_graves >= 3)
                                 AND prom >= %(insuf)s)                                  AS verde
            FROM a
        """, params)
        r, j, am, v = cur.fetchone()
        semaforo = {"revisar": r or 0, "rojo": j or 0, "amarillo": am or 0, "verde": v or 0}

        # --- Tendencia mensual (promedio por mes) ---
        cur.execute(f"""
            SELECT mes_codigo, mes_glosa, ROUND(AVG(pct_asist)::numeric, 4) AS prom
            FROM matriculas.asistencia_mensual
            WHERE anio_academico = %(anio)s AND segmento = %(seg)s {filtro_est}
            GROUP BY mes_codigo, mes_glosa
            ORDER BY mes_codigo
        """, params)
        tendencia = [{"mes": mc, "glosa": mg, "pct": float(p)} for mc, mg, p in cur.fetchall()]

        # --- Ranking por establecimiento (solo vista SLEP; Colegio ya viene filtrado) ---
        ranking = []
        if not establecimiento_id:
            cur.execute(f"""
                SELECT am.id_establecimiento, e.nombre,
                       COUNT(DISTINCT am.id_estudiante) AS alumnos,
                       ROUND(AVG(am.pct_asist)::numeric, 4) AS prom
                FROM matriculas.asistencia_mensual am
                JOIN matriculas.establecimiento e ON e.id_establecimiento = am.id_establecimiento
                WHERE am.anio_academico = %(anio)s AND am.segmento = %(seg)s
                GROUP BY am.id_establecimiento, e.nombre
                ORDER BY prom ASC
            """, params)
            ranking = [{"id_establecimiento": idd, "nombre": nom,
                        "alumnos": al, "pct": float(p)}
                       for idd, nom, al, p in cur.fetchall()]

        # --- Cobertura (los 861 por validar): alumnos escolares con matrícula del año
        #     que NO tienen asistencia cargada todavía ---
        cur.execute("""
            SELECT COUNT(DISTINCT m.id_estudiante)
            FROM matriculas.matricula m
            WHERE m.anio_escolar = %(anio)s
              AND NOT EXISTS (
                  SELECT 1 FROM matriculas.asistencia_mensual am
                  WHERE am.id_estudiante = m.id_estudiante
                    AND am.anio_academico = %(anio)s)
        """, {"anio": anio})
        sin_asistencia = cur.fetchone()[0] or 0

        return {
            "anio": anio,
            "umbral": UMBRAL_INSUF,
            "kpis": {
                "alumnos": total_alumnos,
                "pct_promedio": prom_global,
                "por_validar": sin_asistencia,  # matrícula sin asistencia (incluye 861 nuevos)
            },
            "semaforo": semaforo,
            "tendencia": tendencia,
            "ranking": ranking,
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error en resumen de asistencia: {e}")
    finally:
        cur.close()
        conn.close()


def obtener_anios_asistencia_db():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT DISTINCT anio_academico FROM matriculas.asistencia_mensual "
                    "ORDER BY anio_academico DESC")
        return [r[0] for r in cur.fetchall()]
    finally:
        cur.close()
        conn.close()
