"""
apply_prematricula_2027.py
Pre-crea las matriculas 2027 (renovacion, Opcion A) para el colegio PILOTO
(RBD 1520 = id_establecimiento 17), a partir de los alumnos Activos 2026.

Modelo:
- Cada alumno Activo 2026 que CONTINUA recibe una fila 2027 en:
    estado            = 'Activa'
    estado_firma      = 'Pendiente'   (aun no firma en SIMPLE)
    estado_renovacion = 'Por renovar' (el funcionario aun no la envia a firma)
  con el curso PROMOVIDO al nivel siguiente (misma letra; el colegio ajusta luego).
- Los alumnos del ULTIMO nivel (4 medio) EGRESAN: no se crea fila 2027; se marca
  su fila 2026 con estado_renovacion = 'Egresado'.

Idempotente:
- No crea 2027 si el estudiante ya tiene matricula 2027 en el colegio.
- Solo marca 'Egresado' a las filas 2026 que aun no lo esten.

Uso:
    python apply_prematricula_2027.py            # DRY-RUN (no escribe)
    python apply_prematricula_2027.py --apply    # aplica

Prerequisito: correr antes apply_renovacion_migration.py (columna estado_renovacion).
"""
import sys
import os
import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import get_db_connection

# ---- Parametros del piloto ----
ID_ESTABLECIMIENTO = 17          # RBD 1520 - Liceo Bicentenario Maritimo de Valparaiso
ANIO_ORIGEN = 2026
ANIO_DESTINO = 2027
ID_USUARIO_EJECUTOR = 9          # admin SLEP (diego.cabrera) como ejecutor del sistema
FECHA_MATRICULA_2027 = datetime.date(ANIO_DESTINO, 3, 1)

# ---- Mapa de promocion ----
# Clave: (cod_grado, cod_tipo_ensenanza) del curso 2026.
# Valor: dict con el destino 2027, o None si EGRESA.
# cod_tipo: 110 = Ensenanza Basica, 310 = Ensenanza Media (Cientifico-Humanista).
PROMOCION = {
    # Basica
    (7, 110): {"cod_grado": 8, "cod_tipo_ensenanza": 110, "nivel": "Educación Básica", "label": "8° básico"},
    (8, 110): {"cod_grado": 1, "cod_tipo_ensenanza": 310, "nivel": "Educación Media", "label": "1° medio"},
    # Media
    (1, 310): {"cod_grado": 2, "cod_tipo_ensenanza": 310, "nivel": "Educación Media", "label": "2° medio"},
    (2, 310): {"cod_grado": 3, "cod_tipo_ensenanza": 310, "nivel": "Educación Media", "label": "3° medio"},
    (3, 310): {"cod_grado": 4, "cod_tipo_ensenanza": 310, "nivel": "Educación Media", "label": "4° medio"},
    (4, 310): None,  # 4 medio egresa
}


def construir_curso(label: str, letra: str) -> str:
    """'8° básico' + 'A' -> '8° básico A' (respeta el formato de la base)."""
    letra = (letra or "").strip()
    return f"{label} {letra}".strip() if letra else label


def procesar(aplicar: bool = False):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Traer alumnos Activos 2026 del colegio piloto.
        cur.execute("""
            SELECT m.id_matricula, m.id_estudiante, m.cod_grado, m.cod_tipo_ensenanza,
                   m.letra_curso, m.curso, m.estado_renovacion
            FROM matricula m
            WHERE m.anio_escolar = %s
              AND m.id_establecimiento = %s
              AND m.estado = 'Activa'
            ORDER BY m.cod_grado, m.letra_curso
        """, (ANIO_ORIGEN, ID_ESTABLECIMIENTO))
        alumnos = cur.fetchall()

        # Matriculas 2027 ya existentes en el colegio (para idempotencia).
        cur.execute("""
            SELECT id_estudiante FROM matricula
            WHERE anio_escolar = %s AND id_establecimiento = %s
        """, (ANIO_DESTINO, ID_ESTABLECIMIENTO))
        ya_2027 = {r[0] for r in cur.fetchall()}

        # Correlativos actuales por curso 2027 (para asignar el siguiente).
        cur.execute("""
            SELECT curso, COALESCE(MAX(numero_correlativo), 0)
            FROM matricula
            WHERE anio_escolar = %s AND id_establecimiento = %s
            GROUP BY curso
        """, (ANIO_DESTINO, ID_ESTABLECIMIENTO))
        correlativo_por_curso = {r[0]: r[1] for r in cur.fetchall()}

        a_crear = []       # filas 2027 a insertar
        a_egresar = []     # id_matricula 2026 a marcar 'Egresado'
        sin_mapa = []      # cursos sin regla de promocion (alerta)
        ya_procesados = 0  # 2027 ya existente

        for id_mat, id_est, cod_grado, cod_tipo, letra, curso_2026, est_renov in alumnos:
            clave = (cod_grado, cod_tipo)
            if clave not in PROMOCION:
                sin_mapa.append((curso_2026, cod_grado, cod_tipo))
                continue

            destino = PROMOCION[clave]
            if destino is None:
                # Egresa: marcar 2026 si aun no esta.
                if est_renov != "Egresado":
                    a_egresar.append(id_mat)
                continue

            if id_est in ya_2027:
                ya_procesados += 1
                continue

            curso_2027 = construir_curso(destino["label"], letra)
            correlativo_por_curso[curso_2027] = correlativo_por_curso.get(curso_2027, 0) + 1
            a_crear.append({
                "id_estudiante": id_est,
                "numero_correlativo": correlativo_por_curso[curso_2027],
                "curso": curso_2027,
                "cod_grado": destino["cod_grado"],
                "cod_tipo_ensenanza": destino["cod_tipo_ensenanza"],
                "letra_curso": (letra or "").strip() or None,
                "nivel_ensenanza": destino["nivel"],
                "curso_origen": curso_2026,
            })

        # ---- Reporte ----
        print(f"Colegio {ID_ESTABLECIMIENTO} | Activos {ANIO_ORIGEN}: {len(alumnos)}")
        print(f"  A crear en {ANIO_DESTINO} (Por renovar): {len(a_crear)}")
        print(f"  A marcar Egresado (4 medio {ANIO_ORIGEN}): {len(a_egresar)}")
        print(f"  Ya tenian matricula {ANIO_DESTINO} (omitidos): {ya_procesados}")
        if sin_mapa:
            print(f"  [!] Cursos SIN regla de promocion ({len(sin_mapa)}): {set(sin_mapa)}")

        # Resumen por curso destino
        resumen = {}
        for f in a_crear:
            resumen[f["curso"]] = resumen.get(f["curso"], 0) + 1
        if resumen:
            print("\n  Detalle por curso destino 2027:")
            for curso in sorted(resumen):
                print(f"    {curso}: {resumen[curso]}")

        if not aplicar:
            print("\nDRY-RUN. Nada escrito. Ejecuta con --apply para aplicar.")
            return

        if not a_crear and not a_egresar:
            print("\nNada que aplicar (ya estaba todo procesado).")
            return

        # ---- Escritura ----
        for f in a_crear:
            cur.execute("""
                INSERT INTO matricula (
                    numero_correlativo, anio_escolar, id_estudiante, id_establecimiento,
                    fecha_matricula, nivel_ensenanza, curso, estado,
                    cod_tipo_ensenanza, cod_grado, letra_curso, id_usuario_ejecutor,
                    estado_firma, estado_renovacion
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'Activa', %s, %s, %s, %s, 'Pendiente', 'Por renovar')
            """, (
                f["numero_correlativo"], ANIO_DESTINO, f["id_estudiante"], ID_ESTABLECIMIENTO,
                FECHA_MATRICULA_2027, f["nivel_ensenanza"], f["curso"],
                f["cod_tipo_ensenanza"], f["cod_grado"], f["letra_curso"], ID_USUARIO_EJECUTOR,
            ))

        if a_egresar:
            cur.execute(
                "UPDATE matricula SET estado_renovacion = 'Egresado' WHERE id_matricula = ANY(%s)",
                (a_egresar,),
            )

        conn.commit()
        print(f"\nOK: {len(a_crear)} matriculas {ANIO_DESTINO} creadas, {len(a_egresar)} marcadas Egresado.")
    except Exception as e:
        conn.rollback()
        print(f"Error en pre-matricula {ANIO_DESTINO}: {e}")
        raise e
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    aplicar = "--apply" in sys.argv
    procesar(aplicar=aplicar)
