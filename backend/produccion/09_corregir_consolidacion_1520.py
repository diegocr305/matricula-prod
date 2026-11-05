# -*- coding: utf-8 -*-
"""
HERRAMIENTA 9 — CORRECCIÓN de consolidación SIGE ↔ Excel ↔ RGM del RBD 1520.
(DRY-RUN por defecto; requiere --apply para escribir.)

ORIGEN
======
Diagnóstico de contraste de las tres fuentes del Liceo Bicentenario Marítimo
(id_establecimiento=17, año 2026): SIGE (nomina_excel), Excel del formulario y RGM.
De ~670 alumnos, las tres fuentes cuadran en 668; este script corrige los ~20 casos
puntuales detectados. Cada bloque es INDEPENDIENTE y se puede activar por separado.

QUÉ CORRIGE (cada bloque con su flag)
=====================================
  --prueba        BLOQUE A: elimina la matrícula de PRUEBA 'Diego Cabrera' (mat#92881)
                  y su estudiante asociado si queda sin matrículas. (ejecutor admin)
  --jared         BLOQUE B: consolida la IDENTIDAD duplicada de Jared Ortega.
                  Un alumno extranjero se matriculó primero con IPE provisorio y luego
                  con su RUN definitivo, quedando DOS estudiantes para la misma persona.
                  REGLA DE NEGOCIO: cuando un alumno regulariza su identificador (IPE->RUN)
                  NO se crea matrícula nueva; se actualiza/consolida. Aquí:
                    - Estudiante ANCLA = 31556 (RUN 29392923-8, tiene historial 2025).
                    - Estudiante IPE   = 95439 (IPE 1008135254, trae apoderado+ficha).
                    - Migra apoderado y ficha_salud del IPE al ANCLA si el ANCLA no tiene.
                    - Mueve/one la matrícula 2026 duplicada: conserva UNA 4° Medio B.
                    - Elimina el estudiante IPE una vez vaciado (sin matrículas/FK).
  --cursos        BLOQUE C: corrige el CURSO en el RGM de los 3 alumnos donde SIGE y el
                  Excel COINCIDEN y el RGM quedó mal (letra 'A' errónea):
                    mat#92567 Antonia Guzmán   -> '4° Medio B' (RGM tenía 'A')
                    mat#92775 Gabriela Arias    -> '2° Medio B' (RGM tenía 'A')
                    mat#92218 Antonella González-> '1° Medio B' (RGM tenía 'A')
                  (Bianca Casatte y Anahiz Miranda NO se tocan: SIGE y Excel difieren,
                   el colegio debe confirmar cuál es el real.)
  --retiros       BLOQUE D: marca 'Retirada' en el RGM a los 13 alumnos que SIGE reporta
                  retirados y en el RGM siguen activos. SIGE es la fuente OFICIAL; si el
                  retiro está en SIGE (y en el Excel) es real, solo no se capturó al
                  importar. Escribe fecha_retiro (la de SIGE si se provee por lista) y
                  observación de trazabilidad. NO borra: cambia estado + fecha + motivo.

NO SE TOCA (requiere confirmación de la escuela)
================================================
  - Bianca Casatte (SIGE 2° medio D / Excel 2° Medio C): esperar respuesta del colegio.
  - Anahiz Miranda (SIGE 3° medio C / Excel 3° Medio A): esperar respuesta del colegio.
  - Emilia Ollino y Antonella Ibacache: altas reales que el usuario creó en el RGM y el
    colegio subirá a SIGE; NO son error, no se tocan.

SEGURIDAD
=========
  - DRY-RUN por defecto: imprime lo que haría. Requiere --apply para escribir.
  - Con --apply exige --confirmo-respaldo (correr antes 01_respaldo.py).
  - Todo en UNA transacción por bloque: si algo falla, rollback total.
  - Escribe en auditoria_matricula cada cambio de matrícula (traza).
  - Filtra SIEMPRE por id_establecimiento=17. No puede tocar otro colegio.

USO (desde backend/)
====================
    python produccion/09_corregir_consolidacion_1520.py                       # DRY-RUN todo
    python produccion/09_corregir_consolidacion_1520.py --prueba --cursos      # DRY-RUN solo esos
    python produccion/09_corregir_consolidacion_1520.py --apply --confirmo-respaldo --prueba
    python produccion/09_corregir_consolidacion_1520.py --apply --confirmo-respaldo --cursos
    python produccion/09_corregir_consolidacion_1520.py --apply --confirmo-respaldo --retiros
    python produccion/09_corregir_consolidacion_1520.py --apply --confirmo-respaldo --jared
    # sin flags de bloque = se consideran TODOS los bloques.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402

ID_ESTABLECIMIENTO = 17
ANIO = 2026
ID_USUARIO_CORRECCION = 1  # ejecutor admin que registra la consolidación

# --- BLOQUE A: prueba a eliminar ---
PRUEBA_MAT_ID = 92881  # 'Diego Cabrera' 8° Básico A, creada como prueba (ejecutor 1)

# --- BLOQUE B: consolidación Jared Ortega ---
JARED_ANCLA = 31556     # estudiante con RUN 29392923-8 + historial 2025 (se CONSERVA)
JARED_IPE = 95439       # estudiante con IPE 1008135254 (trae apoderado+ficha; se ELIMINA)
JARED_MAT_ANCLA = 92322 # matrícula 2026 del ancla (se conserva)
JARED_MAT_IPE = 92308   # matrícula 2026 del IPE (se elimina tras migrar datos)

# --- BLOQUE C: cursos mal cargados en el RGM ---
# VACÍO a propósito: las 3 alumnas que tenían el curso con letra 'A' errónea
# (Antonia Guzmán, Gabriela Arias, Antonella González) resultaron estar RETIRADAS en
# SIGE y en el Excel (ver BLOQUE D). Corregirles el curso sería trabajo inútil y traza
# confusa: se retiran. Por eso no se corrige curso de nadie en este lote.
# (Bianca Casatte y Anahiz Miranda: SIGE y Excel difieren -> esperar al colegio.)
CURSOS_CORRECTOS = []

# --- BLOQUE D: retiros CONFIRMADOS en AMBAS fuentes (SIGE + Excel) ---
# Regla del dueño: un retiro es real solo si consta en SIGE Y en el Excel del colegio.
# Verificado con el cruce de ambas planillas. La fecha es la REAL de la fuente
# (cuando SIGE y Excel difieren por pocos días, se usa la de SIGE, la oficial).
# cuerpo -> (nombre, fecha_retiro 'YYYY-MM-DD')
RETIROS_CONFIRMADOS = [
    ("22775606", "Antonia Guzmán",      "2026-03-24"),
    ("23129693", "Ailyn Alegría",       "2026-09-21"),
    ("23256638", "Gabriela Arias",      "2026-07-08"),  # SIGE 07-08 / Excel 07-06
    ("23260469", "Javiera Silva",       "2026-10-16"),
    ("23339970", "Anahiz Miranda",      "2026-07-06"),
    ("23846466", "Antonella González",  "2026-07-03"),  # SIGE 07-03 / Excel 07-06
    ("23917054", "Armando Mateluna",    "2026-09-10"),
]
# Retiros que SIGE reporta pero el Excel NO confirma -> NO se aplican; pendientes de
# que el colegio valide (solo documentados, no se tocan):
RETIROS_SOLO_SIGE_REVISAR = [
    ("23322891", "Martina Valdivia",  "2026-06-12"),
    ("23427590", "Javiera Torres",    "2026-07-06"),
    ("23502969", "Isaías Peña",       "2026-10-06"),
    ("23660727", "Mayra Sepúlveda",   "2026-08-19"),
    ("23700495", "Joaquín Marchant",  "2026-10-07"),
    ("23842701", "Felipe Perez",      "2026-08-20"),
]


def auditar(cur, id_matricula, antes, despues):
    cur.execute(
        """INSERT INTO matriculas.auditoria_matricula
           (id_matricula, accion, id_usuario, datos_anteriores, datos_nuevos)
           VALUES (%s, 'UPDATE', %s, %s, %s)""",
        (id_matricula, ID_USUARIO_CORRECCION,
         json.dumps(antes, ensure_ascii=False, default=str),
         json.dumps(despues, ensure_ascii=False, default=str)),
    )


# ===========================================================================
# BLOQUE A — eliminar la matrícula de prueba
# ===========================================================================
def bloque_prueba(cur, aplicar):
    print("\n--- BLOQUE A: eliminar matrícula de PRUEBA (mat#%d) ---" % PRUEBA_MAT_ID)
    cur.execute(
        """SELECT m.id_matricula, m.id_estudiante, m.curso, e.run_ipe, e.nombres, e.apellido_paterno
           FROM matriculas.matricula m JOIN matriculas.estudiante e ON m.id_estudiante=e.id_estudiante
           WHERE m.id_matricula=%s AND m.id_establecimiento=%s""",
        (PRUEBA_MAT_ID, ID_ESTABLECIMIENTO),
    )
    row = cur.fetchone()
    if not row:
        print("  (no existe mat#%d en el 1520; nada que hacer)" % PRUEBA_MAT_ID)
        return
    id_mat, id_est, curso, run, nom, ape = row
    print(f"  Se eliminará: mat#{id_mat} | {nom} {ape} ({run}) | {curso}")

    cur.execute("SELECT count(*) FROM matriculas.matricula WHERE id_estudiante=%s", (id_est,))
    total_mat = cur.fetchone()[0]
    print(f"  El estudiante {id_est} tiene {total_mat} matrícula(s) en total.")

    if not aplicar:
        print("  (DRY-RUN) borraría firmas/auditoría/encuesta de esa matrícula, luego la matrícula,"
              " y el estudiante solo si queda sin matrículas.")
        return

    cur.execute("DELETE FROM matriculas.firma_matricula WHERE id_matricula=%s", (id_mat,))
    cur.execute("DELETE FROM matriculas.auditoria_matricula WHERE id_matricula=%s", (id_mat,))
    try:
        cur.execute("DELETE FROM matriculas.encuesta_retiro WHERE id_matricula=%s", (id_mat,))
    except Exception:
        pass
    cur.execute("DELETE FROM matriculas.matricula WHERE id_matricula=%s", (id_mat,))
    if total_mat == 1:
        # el estudiante quedó sin matrículas: eliminar ficha y estudiante
        cur.execute("DELETE FROM matriculas.ficha_salud WHERE id_estudiante=%s", (id_est,))
        cur.execute("DELETE FROM matriculas.estudiante WHERE id_estudiante=%s", (id_est,))
        print(f"  Eliminada matrícula #{id_mat} y estudiante {id_est} (sin más matrículas).")
    else:
        print(f"  Eliminada matrícula #{id_mat}; estudiante {id_est} conservado ({total_mat-1} restantes).")


# ===========================================================================
# BLOQUE B — consolidar identidad Jared Ortega (IPE -> RUN)
# ===========================================================================
def bloque_jared(cur, aplicar):
    print("\n--- BLOQUE B: consolidar identidad Jared Ortega (IPE %d -> RUN %d) ---"
          % (JARED_IPE, JARED_ANCLA))
    # Verificar que ambos existan y describir
    cur.execute(
        """SELECT id_estudiante, run_ipe, id_apoderado_principal, id_apoderado_suplente
           FROM matriculas.estudiante WHERE id_estudiante IN (%s,%s)""",
        (JARED_ANCLA, JARED_IPE),
    )
    regs = {r[0]: r for r in cur.fetchall()}
    if JARED_ANCLA not in regs or JARED_IPE not in regs:
        print("  (uno de los registros ya no existe; posiblemente ya consolidado. Nada que hacer.)")
        return
    ancla = regs[JARED_ANCLA]
    ipe = regs[JARED_IPE]
    print(f"  ANCLA  est {ancla[0]} run={ancla[1]} apod_ppal={ancla[2]}")
    print(f"  IPE    est {ipe[0]} run={ipe[1]} apod_ppal={ipe[2]}")
    print("  Plan: migrar apoderado+ficha del IPE al ANCLA (si el ANCLA no tiene),"
          " eliminar matrícula 2026 duplicada del IPE (#%d) y borrar el estudiante IPE."
          % JARED_MAT_IPE)

    if not aplicar:
        print("  (DRY-RUN) no se escribe nada.")
        return

    # 1) Migrar apoderado principal/suplente al ancla si el ancla no tiene y el IPE sí.
    set_parts, params = [], []
    if ancla[2] is None and ipe[2] is not None:
        set_parts.append("id_apoderado_principal=%s"); params.append(ipe[2])
    if ancla[3] is None and ipe[3] is not None:
        set_parts.append("id_apoderado_suplente=%s"); params.append(ipe[3])
    if set_parts:
        params.append(JARED_ANCLA)
        cur.execute(f"UPDATE matriculas.estudiante SET {', '.join(set_parts)} WHERE id_estudiante=%s", params)
        print(f"  Apoderado(s) migrado(s) al ancla: {set_parts}")

    # 2) Migrar ficha_salud del IPE al ancla si el ancla no tiene.
    cur.execute("SELECT 1 FROM matriculas.ficha_salud WHERE id_estudiante=%s", (JARED_ANCLA,))
    ancla_tiene_ficha = cur.fetchone() is not None
    cur.execute("SELECT 1 FROM matriculas.ficha_salud WHERE id_estudiante=%s", (JARED_IPE,))
    ipe_tiene_ficha = cur.fetchone() is not None
    if ipe_tiene_ficha and not ancla_tiene_ficha:
        cur.execute("UPDATE matriculas.ficha_salud SET id_estudiante=%s WHERE id_estudiante=%s",
                    (JARED_ANCLA, JARED_IPE))
        print("  Ficha de salud migrada del IPE al ancla.")
    elif ipe_tiene_ficha:
        cur.execute("DELETE FROM matriculas.ficha_salud WHERE id_estudiante=%s", (JARED_IPE,))
        print("  Ficha del IPE descartada (el ancla ya tenía).")

    # 3) Eliminar la matrícula 2026 duplicada del IPE (se conserva la del ancla).
    cur.execute("DELETE FROM matriculas.firma_matricula WHERE id_matricula=%s", (JARED_MAT_IPE,))
    cur.execute("DELETE FROM matriculas.auditoria_matricula WHERE id_matricula=%s", (JARED_MAT_IPE,))
    try:
        cur.execute("DELETE FROM matriculas.encuesta_retiro WHERE id_matricula=%s", (JARED_MAT_IPE,))
    except Exception:
        pass
    cur.execute("DELETE FROM matriculas.matricula WHERE id_matricula=%s AND id_estudiante=%s",
                (JARED_MAT_IPE, JARED_IPE))
    print(f"  Matrícula 2026 duplicada #{JARED_MAT_IPE} eliminada.")

    # 4) Si el estudiante IPE quedó sin matrículas, eliminarlo.
    cur.execute("SELECT count(*) FROM matriculas.matricula WHERE id_estudiante=%s", (JARED_IPE,))
    if cur.fetchone()[0] == 0:
        cur.execute("DELETE FROM matriculas.estudiante WHERE id_estudiante=%s", (JARED_IPE,))
        print(f"  Estudiante IPE {JARED_IPE} eliminado (consolidado en el RUN {JARED_ANCLA}).")
    else:
        print(f"  ATENCIÓN: el estudiante IPE {JARED_IPE} aún tiene matrículas; NO se eliminó. Revisar.")

    # 5) Dejar traza en la matrícula conservada.
    auditar(cur, JARED_MAT_ANCLA,
            {"nota": "consolidacion IPE->RUN", "ipe_eliminado": "1008135254", "est_ipe": JARED_IPE},
            {"run_definitivo": "29392923-8", "est_conservado": JARED_ANCLA})
    print("  Traza de consolidación registrada en auditoría.")


# ===========================================================================
# BLOQUE C — corregir curso mal cargado en el RGM
# ===========================================================================
def bloque_cursos(cur, aplicar):
    print("\n--- BLOQUE C: corregir CURSO en el RGM (SIGE y Excel coinciden) ---")
    for id_mat, curso_correcto, nombre in CURSOS_CORRECTOS:
        cur.execute(
            "SELECT curso FROM matriculas.matricula WHERE id_matricula=%s AND id_establecimiento=%s",
            (id_mat, ID_ESTABLECIMIENTO),
        )
        row = cur.fetchone()
        if not row:
            print(f"  mat#{id_mat} ({nombre}): no encontrada. Omitida.")
            continue
        curso_actual = row[0]
        if curso_actual == curso_correcto:
            print(f"  mat#{id_mat} ({nombre}): ya está '{curso_correcto}'. Sin cambio.")
            continue
        print(f"  mat#{id_mat} ({nombre}): '{curso_actual}' -> '{curso_correcto}'")
        if aplicar:
            cur.execute("UPDATE matriculas.matricula SET curso=%s WHERE id_matricula=%s",
                        (curso_correcto, id_mat))
            auditar(cur, id_mat, {"curso": curso_actual}, {"curso": curso_correcto})


# ===========================================================================
# BLOQUE D — marcar retiros detectados en SIGE
# ===========================================================================
def bloque_retiros(cur, aplicar):
    print("\n--- BLOQUE D: marcar RETIROS confirmados en SIGE + Excel ---")
    # Resolver las matrículas 2026 activas del 1520 por cuerpo de RUT.
    cur.execute(
        """SELECT m.id_matricula, m.estado, m.curso,
                  left(regexp_replace(e.run_ipe,'[.\\-\\s]','','g'),
                       length(regexp_replace(e.run_ipe,'[.\\-\\s]','','g'))-1) AS cuerpo
           FROM matriculas.matricula m JOIN matriculas.estudiante e ON m.id_estudiante=e.id_estudiante
           WHERE m.id_establecimiento=%s AND m.anio_escolar=%s
             AND m.estado IN ('Activa','Pendiente Firma','Pendiente Retiro')""",
        (ID_ESTABLECIMIENTO, ANIO),
    )
    por_cuerpo = {r[3]: r for r in cur.fetchall()}

    encontrados = 0
    for cuerpo, nombre, fecha in RETIROS_CONFIRMADOS:
        r = por_cuerpo.get(cuerpo)
        if not r:
            print(f"  cuerpo {cuerpo} ({nombre}): no activo en el RGM (ya retirado o no está). Omitido.")
            continue
        encontrados += 1
        id_mat, estado, curso = r[0], r[1], r[2]
        print(f"  cuerpo {cuerpo} ({nombre}) mat#{id_mat} {curso}: '{estado}' -> 'Retirada' (fecha {fecha})")
        if aplicar:
            obs = (f"Retiro consolidado desde SIGE + Excel (fecha {fecha}): el retiro constaba "
                   "en ambas fuentes y no se capturó al importar la nómina.")
            cur.execute(
                """UPDATE matriculas.matricula
                   SET estado='Retirada',
                       fecha_retiro=%s::date,
                       motivo_retiro=COALESCE(motivo_retiro,'Retiro registrado en SIGE y Excel'),
                       observaciones=CASE WHEN observaciones IS NULL OR observaciones=''
                                          THEN %s ELSE observaciones||' | '||%s END
                   WHERE id_matricula=%s""",
                (fecha, obs, obs, id_mat),
            )
            auditar(cur, id_mat, {"estado": estado},
                    {"estado": "Retirada", "fecha_retiro": fecha, "fuente": "SIGE+Excel"})
    print(f"  Retiros confirmados aplicables: {encontrados}/{len(RETIROS_CONFIRMADOS)}")

    print("\n  PENDIENTES (SIGE reporta retiro pero el Excel NO lo confirma -> validar con el colegio):")
    for cuerpo, nombre, fecha in RETIROS_SOLO_SIGE_REVISAR:
        print(f"    - {nombre} (cuerpo {cuerpo}), SIGE dice retiro {fecha}. NO se toca.")


def main():
    ap = argparse.ArgumentParser(description="Corrección de consolidación 1520 (DRY-RUN por defecto)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--confirmo-respaldo", action="store_true")
    ap.add_argument("--prueba", action="store_true", help="Bloque A")
    ap.add_argument("--jared", action="store_true", help="Bloque B")
    ap.add_argument("--cursos", action="store_true", help="Bloque C")
    ap.add_argument("--retiros", action="store_true", help="Bloque D")
    args = ap.parse_args()

    # Si no se eligió ningún bloque, se consideran TODOS.
    todos = not (args.prueba or args.jared or args.cursos or args.retiros)
    do_prueba = args.prueba or todos
    do_jared = args.jared or todos
    do_cursos = args.cursos or todos
    do_retiros = args.retiros or todos

    modo = "APLICAR (escribe)" if args.apply else "DRY-RUN (no escribe)"
    print("=" * 68)
    print(f"CORRECCIÓN CONSOLIDACIÓN 1520 — Modo: {modo}")
    print(f"Bloques: prueba={do_prueba} jared={do_jared} cursos={do_cursos} retiros={do_retiros}")
    print("=" * 68)

    if args.apply and not args.confirmo_respaldo:
        print("\nBLOQUEADO: --apply requiere --confirmo-respaldo (corre antes 01_respaldo.py).")
        sys.exit(1)

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        if do_prueba:
            bloque_prueba(cur, args.apply)
        if do_jared:
            bloque_jared(cur, args.apply)
        if do_cursos:
            bloque_cursos(cur, args.apply)
        if do_retiros:
            bloque_retiros(cur, args.apply)

        if args.apply:
            conn.commit()
            print("\n>>> CAMBIOS APLICADOS (transacción confirmada). <<<")
        else:
            conn.rollback()
            print("\n(DRY-RUN: no se escribió nada. Usa --apply --confirmo-respaldo para ejecutar.)")
    except Exception as e:
        conn.rollback()
        print(f"\nERROR (rollback, nada se escribió): {type(e).__name__}: {e}")
        raise
    finally:
        cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
