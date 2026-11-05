# -*- coding: utf-8 -*-
"""
HERRAMIENTA 6 — CARGA de la nómina 2026 del RBD 1520 (DRY-RUN por defecto).

Qué hace
========
Carga la nómina completa de estudiantes 2026 del Liceo Bicentenario Marítimo de
Valparaíso (RBD 1520, id_establecimiento=17) desde el Excel oficial del formulario
("Nomina de estudiantes") hacia el schema `matriculas`:

  1) estudiante   — UPSERT por run_ipe (no pisa nombres/fecha_nac con vacío; sí
                    actualiza domicilio/dirección estructurada si vienen).
  2) apoderado    — UPSERT por rut_pasaporte (titular y suplente), descartando RUT
                    basura (no numérico, cuerpo <7 u >9 dígitos). Se vincula al
                    estudiante como id_apoderado_principal / id_apoderado_suplente.
  3) ficha_salud  — UPSERT por id_estudiante (previsión, FONASA, CESFAM, alergias,
                    diagnóstico, medicamento, NEE, etc.).
  4) matricula    — INSERTA la matrícula 2026 (ON CONFLICT en la constraint única
                    DO NOTHING, para que re-ejecutar no duplique).

SUPUESTO IMPORTANTE (ORDEN DE EJECUCIÓN)
========================================
Este script asume que las matrículas 2026 de PRUEBA del 1520 YA FUERON BORRADAS
por un script hermano de limpieza. Por eso solo INSERTA matrículas 2026 (no hace
UPSERT complejo de la matrícula); el ON CONFLICT ... DO NOTHING lo hace idempotente
frente a una re-ejecución accidental.

Reglas de "NO PISAR DATOS BUENOS"
=================================
  - Estudiante existente: se actualiza SOLO la dirección (COALESCE/NULLIF para no
    pisar con vacío) y fecha_actualizacion. NO se reescriben nombres ni fecha_nac.
  - Estudiante nuevo: se crea con la fecha_nacimiento del Excel (col 6, NOT NULL).
  - Apoderado: ON CONFLICT (rut_pasaporte) DO UPDATE rellena datos de contacto solo
    si llegan no vacíos (COALESCE), sin duplicar por RUT ya existente.

ESTRATEGIA DE RENDIMIENTO (clave)
=================================
La base está en Supabase (EE.UU.), ~140 ms por round-trip. Hacer una query por fila
choca con la latencia y el statement_timeout del pooler. Por eso:
  1. Se cargan en memoria TODOS los estudiantes y apoderados existentes (2 queries).
  2. Se procesa el Excel en memoria.
  3. Se escribe en BLOQUE con execute_values en chunks, con commit entre cada chunk
     y progreso visible (print flush=True).

Uso (desde backend/)
====================
    python produccion/06_cargar_nomina_2026_1520.py                 # DRY-RUN (no escribe)
    python produccion/06_cargar_nomina_2026_1520.py --apply         # aplica la carga
    python produccion/06_cargar_nomina_2026_1520.py --id-usuario 42  # fuerza el ejecutor
    python produccion/06_cargar_nomina_2026_1520.py --excel "ruta.xlsx"

Requiere: pandas, openpyxl.
"""
import argparse
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402
from services.utils import normalizar_rut  # noqa: E402
from psycopg2.extras import execute_values  # noqa: E402

# ----------------------------------------------------------------------------
# CONSTANTES CONFIGURABLES
# ----------------------------------------------------------------------------
ID_ESTABLECIMIENTO = 17          # RBD 1520 — Liceo Bicentenario Marítimo de Valparaíso
ANIO_ESCOLAR = 2026
HOJA_EXCEL = "Nomina de estudiantes"
CORREO_EJECUTOR_DEFAULT = "carolina.conchap@slepvalparaiso.cl"
ID_USUARIO_FALLBACK = 1          # si no se encuentra el correo del ejecutor
CHUNK = 500

AQUI = Path(__file__).resolve().parent
EXCEL_DEFAULT = (AQUI.parent.parent / "csv pruebas" /
                 "REGISTRO GENERAL DE MATRÍCULA 2026 - 1520 - "
                 "LICEO BICENTENARIO MARITIMO DE VALPARAISO.xlsx")

# Índices de columna (0-based) en la hoja "Nomina de estudiantes".
C = {
    "nro_matricula": 0,
    "nombres": 1,
    "apellido_paterno": 2,
    "apellido_materno": 3,
    "rut_cuerpo": 4,
    "rut_dv": 5,
    "fecha_nac": 6,
    "identidad_genero": 8,
    "sexo": 9,
    "nacionalidad": 10,
    "calle": 15,
    "numeracion": 16,
    "sector": 17,
    "comuna": 18,
    "prevision": 26,
    "letra_fonasa": 27,
    "cesfam": 28,
    "centro_emergencia": 29,
    "alergias": 30,
    "diag_medico_flag": 31,
    "medico_tratante": 32,
    "medicamento": 33,
    "nee": 34,
    "doc_nee": 35,
    "nee_tipo": 36,
    "apod_tit_nombre": 37,
    "apod_tit_rut": 38,
    "apod_tit_dv": 39,
    "apod_tit_tel": 40,
    "apod_tit_nivel": 41,
    "apod_tit_correo": 42,
    "apod_sup_nombre": 43,
    "apod_sup_rut": 44,
    "apod_sup_dv": 45,
    "apod_sup_tel": 46,
    "apod_sup_nivel": 47,
    "apod_sup_correo": 48,
    "tipo_ensenanza": 49,
    "curso": 50,
    "sede": 51,
    "fecha_matricula": 52,
    "se_retira": 53,
    "fecha_retiro": 54,
    "motivo_retiro": 55,
    "obs_motivo_retiro": 56,
    "nombre_quien_retira": 57,
    "observaciones": 58,
}


# ----------------------------------------------------------------------------
# HELPERS DE LIMPIEZA / NORMALIZACIÓN
# ----------------------------------------------------------------------------
def limpiar(v) -> str:
    """Celda -> str limpio, '' para vacíos/basura habitual."""
    if v is None:
        return ""
    try:
        if isinstance(v, float) and pd.isna(v):
            return ""
    except Exception:
        pass
    s = str(v).strip()
    if s.lower() in ("nan", "none", "null", "nat", "<na>", "s/i",
                     "sin informacion", "sin información"):
        return ""
    return s


def rut_estudiante(cuerpo, dv) -> str:
    """run_ipe: cuerpo + DV sin separadores, mayúscula. IPE largos quedan tal cual."""
    c = re.sub(r"[.\-\s]", "", limpiar(cuerpo)).upper()
    c = c[:-2] if c.endswith(".0") else c
    d = re.sub(r"[.\-\s]", "", limpiar(dv)).upper()
    return (c + d)


def rut_apoderado(cuerpo, dv) -> str:
    """RUT canónico '12345678-9' o '' si es basura (no numérico, cuerpo 7-9 díg.)."""
    c = limpiar(cuerpo)
    if not c:
        return ""
    cuerpo_limpio = re.sub(r"[.\-\s]", "", c)
    cuerpo_limpio = cuerpo_limpio[:-2] if cuerpo_limpio.endswith(".0") else cuerpo_limpio
    if not cuerpo_limpio.isdigit() or not (7 <= len(cuerpo_limpio) <= 9):
        return ""
    d = re.sub(r"[.\-\s]", "", limpiar(dv)).upper()
    return normalizar_rut(f"{cuerpo_limpio}{d}" if d else cuerpo_limpio)[:20]


def limpiar_telefono(v) -> str:
    s = limpiar(v)
    if not s:
        return ""
    if ("e" in s.lower() or "." in s) and re.match(r"^-?\d+(\.\d+)?([eE][+-]?\d+)?$", s):
        try:
            s = str(int(float(s)))
        except (ValueError, OverflowError):
            pass
    return re.sub(r"\D", "", s)[:20]


def nombre_valido(nombre_completo: str) -> bool:
    s = limpiar(nombre_completo)
    if len(s) < 3:
        return False
    if s.upper() in ("NO", "SI", "S/I", "N/A", "NN", "NO APLICA", "SIN INFORMACION"):
        return False
    return True


def separar_nombre(nombre_completo: str):
    """"APELLIDO APELLIDO, NOMBRES" -> (nombres, pat, mat). También soporta
    el formato normal "NOMBRES APELLIDO APELLIDO" como fallback."""
    s = limpiar(nombre_completo)
    if "," in s:
        izq, der = s.split(",", 1)
        apellidos = [p for p in izq.split() if p]
        nombres = der.strip()
        pat = apellidos[0] if apellidos else "Titular"
        mat = apellidos[1] if len(apellidos) > 1 else None
        return (nombres[:100] or "Apoderado", pat[:100], (mat[:100] if mat else None))
    partes = [p for p in s.split() if p]
    if not partes:
        return ("Apoderado", "Titular", None)
    if len(partes) == 1:
        return (partes[0][:100], "Titular", None)
    if len(partes) == 2:
        return (partes[0][:100], partes[1][:100], None)
    return (" ".join(partes[:-2])[:100], partes[-2][:100], partes[-1][:100])


def normalizar_sexo(v) -> str:
    """M/F robusto; default 'M' solo para no violar el NOT NULL (dato a revisar)."""
    s = limpiar(v).upper()
    if s.startswith("F") or s in ("MUJER", "FEMENINO"):
        return "F"
    if s.startswith("M") or s in ("HOMBRE", "MASCULINO"):
        return "M"
    return "M"


def a_fecha(v):
    """Celda datetime/texto -> date (o None). El Excel trae col 6/52/54 como datetime."""
    s = limpiar(v)
    if not s:
        return None
    try:
        ts = pd.to_datetime(v, errors="coerce", dayfirst=True)
        if pd.isna(ts):
            return None
        return ts.date()
    except Exception:
        return None


def componer_domicilio(calle, numero, sector, comuna):
    partes = [p for p in [f"{calle or ''} {numero or ''}".strip(),
                          (sector or ""), (comuna or "")] if p]
    return ", ".join(partes) if partes else None


# ----------------------------------------------------------------------------
# PARSEO DE CURSO Y TIPO DE ENSEÑANZA
# ----------------------------------------------------------------------------
# Mapeo "Básico/Medio + número" -> cod_grado (catalogo_grado del 1520).
GRADO_BASICA = {6: 6, 7: 7, 8: 8}          # 6°/7°/8° básico
GRADO_MEDIA = {1: 1, 2: 2, 3: 3, 4: 4}     # 1°-4° medio


def parsear_tipo_ensenanza(v):
    """'110 - Ens. Básica' -> (110, '110 - Ens. Básica'). Devuelve (cod|None, texto)."""
    s = limpiar(v)
    if not s:
        return (None, None)
    m = re.match(r"\s*(\d{2,4})", s)
    cod = int(m.group(1)) if m else None
    return (cod, s)


def parsear_curso(v):
    """'7° Básico A' -> ('7° Básico A', cod_grado=7, letra='A').
    '1° Medio B'  -> ('1° Medio B', cod_grado=1, letra='B').
    Devuelve (curso_norm|None, cod_grado|None, letra|None)."""
    s = limpiar(v)
    if not s:
        return (None, None, None)
    curso_norm = re.sub(r"\s+", " ", s).strip()

    m_num = re.match(r"\s*(\d+)", curso_norm)
    num = int(m_num.group(1)) if m_num else None

    low = curso_norm.lower()
    es_media = ("medio" in low or "media" in low)
    es_basica = ("básico" in low or "basico" in low)

    cod_grado = None
    if num is not None:
        if es_media:
            cod_grado = GRADO_MEDIA.get(num)
        elif es_basica:
            cod_grado = GRADO_BASICA.get(num)

    # letra: último token si es una sola letra A-E (o A-Z por tolerancia).
    letra = None
    tokens = curso_norm.split()
    if tokens:
        ult = tokens[-1].upper()
        if len(ult) == 1 and ult.isalpha():
            letra = ult
    return (curso_norm, cod_grado, letra)


def se_retira(v) -> bool:
    s = limpiar(v).lower()
    return s.startswith("s") or s in ("si", "sí", "true", "1")


# ----------------------------------------------------------------------------
# RESOLUCIÓN DEL id_usuario_ejecutor
# ----------------------------------------------------------------------------
def resolver_id_usuario(cur, forzado):
    if forzado:
        return forzado
    try:
        cur.execute(
            "SELECT id_usuario FROM usuario WHERE lower(email_institucional)=lower(%s) LIMIT 1",
            (CORREO_EJECUTOR_DEFAULT,),
        )
        row = cur.fetchone()
        if row:
            return row[0]
    except Exception:
        pass
    return ID_USUARIO_FALLBACK


# ----------------------------------------------------------------------------
# MAIN
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Carga nómina 2026 del RBD 1520 (DRY-RUN por defecto)")
    ap.add_argument("--apply", action="store_true", help="Aplica la carga (si no, DRY-RUN)")
    ap.add_argument("--excel", default=str(EXCEL_DEFAULT))
    ap.add_argument("--id-usuario", type=int, default=None,
                    help="Fuerza el id_usuario_ejecutor (si no, busca el correo por defecto)")
    args = ap.parse_args()

    modo = "APLICAR (escribe en la base)" if args.apply else "DRY-RUN (no escribe nada)"
    print("=" * 64)
    print(f"CARGA NÓMINA 2026 — RBD 1520 (id_establecimiento={ID_ESTABLECIMIENTO})")
    print(f"Modo: {modo}")
    print("=" * 64)

    ruta = Path(args.excel)
    print(f"Leyendo Excel: {ruta}", flush=True)
    df = pd.read_excel(ruta, sheet_name=HOJA_EXCEL, header=0)
    print(f"Filas de datos: {len(df)}", flush=True)
    print(f"Columnas detectadas: {len(df.columns)}", flush=True)

    cols = list(df.columns)

    def celda(row, key):
        idx = C[key]
        if idx >= len(cols):
            return None
        return row.iloc[idx]

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SET statement_timeout = 0;")
        conn.commit()
    except Exception:
        conn.rollback()

    try:
        id_usuario = resolver_id_usuario(cur, args.id_usuario)
        print(f"id_usuario_ejecutor: {id_usuario}", flush=True)

        # --- Cargar estudiantes y apoderados existentes a memoria (2 queries) ---
        print("Cargando estudiantes y apoderados existentes...", flush=True)
        cur.execute("""
            SELECT upper(regexp_replace(run_ipe,'[.\\-\\s]','','g')), id_estudiante
            FROM estudiante
        """)
        run_to_id = {r[0]: r[1] for r in cur.fetchall()}
        print(f"  estudiantes en base: {len(run_to_id):,}", flush=True)

        cur.execute("SELECT rut_pasaporte, id_apoderado FROM apoderado")
        apod_existentes = {r[0]: r[1] for r in cur.fetchall()}
        print(f"  apoderados en base : {len(apod_existentes):,}", flush=True)

        # Acumuladores -----------------------------------------------------
        stats = {
            "filas": 0, "sin_run": 0,
            "est_nuevos": 0, "est_actualizar": 0,
            "apod_nuevos": 0, "apod_rut_basura": 0,
            "fichas": 0,
            "mat_insertar": 0, "mat_retiradas": 0,
            "sin_curso": 0, "sin_cod_grado": 0,
        }

        apod_a_insertar = {}   # rut -> (rut, nombres, pat, mat, dom, tel, correo, relacion)
        # estudiantes nuevos: run -> dict de datos
        est_nuevos = {}
        # estudiantes a actualizar dirección: run -> (calle, num, sector, comuna, dom)
        est_update_dir = {}
        # vínculos de apoderado por run: run -> {"ppal": rut, "supl": rut}
        vinc_apod = {}
        # fichas de salud por run
        fichas = {}
        # matrículas: lista de dicts (se resuelve id_estudiante tras crear/ubicar)
        matriculas = []

        vistos_run = set()

        def registrar_apod(rut, nom_completo, tel_col, cor_col, relacion):
            if not rut:
                return
            if rut in apod_existentes or rut in apod_a_insertar:
                return
            n, p, m = separar_nombre(nom_completo)
            tel = limpiar_telefono(tel_col) or None
            cor = (limpiar(cor_col)[:100] or None)
            apod_a_insertar[rut] = (rut, n, p, m, "Sin registrar", tel, cor, relacion)
            stats["apod_nuevos"] += 1

        for _, row in df.iterrows():
            stats["filas"] += 1

            run = rut_estudiante(celda(row, "rut_cuerpo"), celda(row, "rut_dv"))
            if not run or len(run) < 2:
                stats["sin_run"] += 1
                continue

            # --- dirección ---
            calle = limpiar(celda(row, "calle")) or None
            numero = limpiar(celda(row, "numeracion")) or None
            sector = limpiar(celda(row, "sector")) or None
            comuna = limpiar(celda(row, "comuna")) or None
            dom = componer_domicilio(calle, numero, sector, comuna)

            # --- estudiante nuevo vs existente ---
            id_est = run_to_id.get(run)
            if id_est is None and run not in est_nuevos:
                fnac = a_fecha(celda(row, "fecha_nac"))
                est_nuevos[run] = {
                    "run_ipe": run,
                    "nombres": limpiar(celda(row, "nombres")) or "SIN NOMBRE",
                    "apellido_paterno": limpiar(celda(row, "apellido_paterno")) or "SIN APELLIDO",
                    "apellido_materno": limpiar(celda(row, "apellido_materno")) or None,
                    "sexo": normalizar_sexo(celda(row, "sexo")),
                    "fecha_nacimiento": fnac,
                    "domicilio": dom or "Sin registrar",
                    "calle": calle, "numero": numero, "sector": sector, "comuna": comuna,
                    "pais_origen": limpiar(celda(row, "nacionalidad")) or None,
                }
                stats["est_nuevos"] += 1
            elif id_est is not None and run not in vistos_run:
                if any([calle, numero, sector, comuna, dom]):
                    est_update_dir[run] = (calle, numero, sector, comuna, dom)
                    stats["est_actualizar"] += 1

            vistos_run.add(run)

            # --- apoderados ---
            vinc = vinc_apod.setdefault(run, {})
            rut_t = rut_apoderado(celda(row, "apod_tit_rut"), celda(row, "apod_tit_dv"))
            nom_t = limpiar(celda(row, "apod_tit_nombre"))
            if limpiar(celda(row, "apod_tit_rut")) and not rut_t:
                stats["apod_rut_basura"] += 1
            if rut_t and nombre_valido(nom_t):
                registrar_apod(rut_t, nom_t, celda(row, "apod_tit_tel"),
                               celda(row, "apod_tit_correo"), "Apoderado Titular")
                vinc.setdefault("ppal", rut_t)

            rut_s = rut_apoderado(celda(row, "apod_sup_rut"), celda(row, "apod_sup_dv"))
            nom_s = limpiar(celda(row, "apod_sup_nombre"))
            if limpiar(celda(row, "apod_sup_rut")) and not rut_s:
                stats["apod_rut_basura"] += 1
            if rut_s and nombre_valido(nom_s):
                registrar_apod(rut_s, nom_s, celda(row, "apod_sup_tel"),
                               celda(row, "apod_sup_correo"), "Apoderado Suplente")
                vinc.setdefault("supl", rut_s)

            # --- ficha de salud (una por estudiante; primera fila gana) ---
            if run not in fichas:
                diag_flag = limpiar(celda(row, "diag_medico_flag"))
                fichas[run] = {
                    "sistema_salud": limpiar(celda(row, "prevision")) or None,
                    "letra_fonasa": limpiar(celda(row, "letra_fonasa")) or None,
                    "cesfam": limpiar(celda(row, "cesfam")) or None,
                    "centro_emergencia": limpiar(celda(row, "centro_emergencia")) or None,
                    "alergias": limpiar(celda(row, "alergias")) or None,
                    "diagnostico_medico": diag_flag or None,
                    "medico_tratante": limpiar(celda(row, "medico_tratante")) or None,
                    "medicamento": limpiar(celda(row, "medicamento")) or None,
                    "nee": limpiar(celda(row, "nee")) or None,
                    "nee_tipo": limpiar(celda(row, "nee_tipo")) or None,
                }
                stats["fichas"] += 1

            # --- matrícula ---
            curso_norm, cod_grado, letra = parsear_curso(celda(row, "curso"))
            cod_tipo, nivel_texto = parsear_tipo_ensenanza(celda(row, "tipo_ensenanza"))
            if not curso_norm:
                stats["sin_curso"] += 1
            if curso_norm and cod_grado is None:
                stats["sin_cod_grado"] += 1

            nro = limpiar(celda(row, "nro_matricula"))
            try:
                correlativo = int(float(nro)) if nro else None
            except (ValueError, OverflowError):
                correlativo = None

            retirada = se_retira(celda(row, "se_retira"))
            obs = limpiar(celda(row, "observaciones")) or ""
            obs_mot = limpiar(celda(row, "obs_motivo_retiro"))
            if obs_mot:
                obs = (obs + " | " + obs_mot).strip(" |")

            matriculas.append({
                "run": run,
                "numero_correlativo": correlativo,  # se completa si queda None
                "fecha_matricula": a_fecha(celda(row, "fecha_matricula")),
                "nivel_ensenanza": nivel_texto or "Educación Básica",
                "curso": curso_norm or "SIN CURSO",
                "estado": "Retirada" if retirada else "Activa",
                "fecha_retiro": a_fecha(celda(row, "fecha_retiro")) if retirada else None,
                "motivo_retiro": (limpiar(celda(row, "motivo_retiro")) or None) if retirada else None,
                "observaciones": obs or None,
                "cod_tipo_ensenanza": cod_tipo,
                "cod_grado": cod_grado,
                "letra_curso": letra,
            })
            if retirada:
                stats["mat_retiradas"] += 1

        stats["mat_insertar"] = len(matriculas)

        # Rellenar correlativos faltantes por (cod_tipo, curso), incremental.
        contador = {}
        for m in matriculas:
            if m["numero_correlativo"] is None:
                clave = (m["cod_tipo_ensenanza"], m["curso"])
                contador[clave] = contador.get(clave, 0) + 1
                m["numero_correlativo"] = contador[clave]

        # --- Reporte DRY-RUN ---
        print("\n=== IMPACTO (lo que haría la carga) ===", flush=True)
        print(f"  Filas procesadas             : {stats['filas']:,}")
        print(f"  Filas sin RUN válido (omitidas): {stats['sin_run']:,}")
        print(f"  Estudiantes NUEVOS a crear   : {stats['est_nuevos']:,}")
        print(f"  Estudiantes a actualizar dir.: {stats['est_actualizar']:,}")
        print(f"  Apoderados NUEVOS a insertar : {stats['apod_nuevos']:,}")
        print(f"  Filas con RUT apoderado basura: {stats['apod_rut_basura']:,}")
        print(f"  Fichas de salud (UPSERT)     : {stats['fichas']:,}")
        print(f"  Matrículas 2026 a insertar   : {stats['mat_insertar']:,}")
        print(f"    de ellas, retiradas        : {stats['mat_retiradas']:,}")
        print(f"  Cursos sin cod_grado mapeado : {stats['sin_cod_grado']:,}")
        print(f"  Filas sin curso              : {stats['sin_curso']:,}")

        # Avisos de calidad
        nuevos_sin_fnac = sum(1 for v in est_nuevos.values() if v["fecha_nacimiento"] is None)
        if nuevos_sin_fnac:
            print(f"\n  ⚠ {nuevos_sin_fnac} estudiantes NUEVOS sin fecha_nacimiento "
                  f"(NOT NULL): esas filas se OMITIRÁN al crear.", flush=True)

        if not args.apply:
            conn.rollback()
            print("\n(DRY-RUN: no se escribió nada. Agrega --apply para aplicar la carga.)")
            cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()
            return

        # ====================================================================
        # ESCRITURA REAL — en chunks, commit entre cada bloque
        # ====================================================================
        def en_chunks(lista):
            for i in range(0, len(lista), CHUNK):
                yield lista[i:i + CHUNK]

        # a) INSERTAR apoderados nuevos ------------------------------------
        if apod_a_insertar:
            filas = list(apod_a_insertar.values())
            total = len(filas)
            print(f"\nInsertando {total:,} apoderados nuevos en chunks de {CHUNK}...", flush=True)
            hecho = 0
            for ch in en_chunks(filas):
                execute_values(cur, """
                    INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno,
                        apellido_materno, domicilio, telefono, correo_electronico,
                        relacion_estudiante)
                    VALUES %s
                    ON CONFLICT (rut_pasaporte) DO UPDATE SET
                        telefono = COALESCE(apoderado.telefono, EXCLUDED.telefono),
                        correo_electronico = COALESCE(apoderado.correo_electronico, EXCLUDED.correo_electronico)
                """, ch, page_size=CHUNK)
                conn.commit()
                hecho += len(ch)
                print(f"  apoderados: {hecho:,}/{total:,}", flush=True)

        # Refrescar mapa de apoderados (nuevos ids).
        cur.execute("SELECT rut_pasaporte, id_apoderado FROM apoderado")
        apod_existentes = {r[0]: r[1] for r in cur.fetchall()}

        # b) INSERTAR estudiantes nuevos (requieren fecha_nacimiento) ------
        nuevos_filas = [v for v in est_nuevos.values() if v["fecha_nacimiento"] is not None]
        omitidos = len(est_nuevos) - len(nuevos_filas)
        if nuevos_filas:
            total = len(nuevos_filas)
            print(f"\nInsertando {total:,} estudiantes nuevos "
                  f"({omitidos} omitidos por falta de fecha_nac)...", flush=True)
            hecho = 0
            for ch in en_chunks(nuevos_filas):
                vals = [(
                    v["run_ipe"], v["nombres"], v["apellido_paterno"], v["apellido_materno"],
                    v["sexo"], v["fecha_nacimiento"], v["domicilio"],
                    v["calle"], v["numero"], v["sector"], v["comuna"], v["pais_origen"],
                ) for v in ch]
                execute_values(cur, """
                    INSERT INTO estudiante (run_ipe, nombres, apellido_paterno,
                        apellido_materno, sexo, fecha_nacimiento, domicilio,
                        calle, numero, sector, comuna, pais_origen, fecha_actualizacion)
                    VALUES %s
                    ON CONFLICT (run_ipe) DO UPDATE SET
                        domicilio = COALESCE(NULLIF(EXCLUDED.domicilio,'Sin registrar'), estudiante.domicilio),
                        calle  = COALESCE(EXCLUDED.calle,  estudiante.calle),
                        numero = COALESCE(EXCLUDED.numero, estudiante.numero),
                        sector = COALESCE(EXCLUDED.sector, estudiante.sector),
                        comuna = COALESCE(EXCLUDED.comuna, estudiante.comuna),
                        fecha_actualizacion = now()
                """, vals, template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())",
                    page_size=CHUNK)
                conn.commit()
                hecho += len(ch)
                print(f"  estudiantes: {hecho:,}/{total:,}", flush=True)

        # c) ACTUALIZAR dirección de estudiantes existentes ----------------
        if est_update_dir:
            filas = [(run, *vals) for run, vals in est_update_dir.items()]
            total = len(filas)
            print(f"\nActualizando dirección de {total:,} estudiantes existentes...", flush=True)
            for ch in en_chunks(filas):
                vals = [(
                    run_to_id.get(run), calle, numero, sector, comuna, dom
                ) for (run, calle, numero, sector, comuna, dom) in ch
                    if run_to_id.get(run) is not None]
                if not vals:
                    continue
                execute_values(cur, """
                    UPDATE estudiante AS e SET
                        calle     = COALESCE(d.calle,  e.calle),
                        numero    = COALESCE(d.numero, e.numero),
                        sector    = COALESCE(d.sector, e.sector),
                        comuna    = COALESCE(d.comuna, e.comuna),
                        domicilio = COALESCE(NULLIF(d.dom,''), e.domicilio),
                        fecha_actualizacion = now()
                    FROM (VALUES %s) AS d(id_est, calle, numero, sector, comuna, dom)
                    WHERE e.id_estudiante = d.id_est
                """, vals, page_size=CHUNK)
                conn.commit()

        # Refrescar mapa de estudiantes (nuevos ids).
        cur.execute("""
            SELECT upper(regexp_replace(run_ipe,'[.\\-\\s]','','g')), id_estudiante
            FROM estudiante
        """)
        run_to_id = {r[0]: r[1] for r in cur.fetchall()}

        # d) VINCULAR apoderados al estudiante -----------------------------
        pares_ppal, pares_supl = [], []
        for run, v in vinc_apod.items():
            id_est = run_to_id.get(run)
            if id_est is None:
                continue
            if v.get("ppal") and v["ppal"] in apod_existentes:
                pares_ppal.append((apod_existentes[v["ppal"]], id_est))
            if v.get("supl") and v["supl"] in apod_existentes:
                pares_supl.append((apod_existentes[v["supl"]], id_est))

        if pares_ppal:
            total = len(pares_ppal)
            print(f"\nVinculando {total:,} apoderados titulares...", flush=True)
            for ch in en_chunks(pares_ppal):
                execute_values(cur, """
                    UPDATE estudiante AS e SET id_apoderado_principal = v.id_apod
                    FROM (VALUES %s) AS v(id_apod, id_est)
                    WHERE e.id_estudiante = v.id_est
                      AND e.id_apoderado_principal IS NULL
                """, ch, page_size=CHUNK)
                conn.commit()

        if pares_supl:
            total = len(pares_supl)
            print(f"Vinculando {total:,} apoderados suplentes...", flush=True)
            for ch in en_chunks(pares_supl):
                execute_values(cur, """
                    UPDATE estudiante AS e SET id_apoderado_suplente = v.id_apod
                    FROM (VALUES %s) AS v(id_apod, id_est)
                    WHERE e.id_estudiante = v.id_est
                      AND e.id_apoderado_suplente IS NULL
                """, ch, page_size=CHUNK)
                conn.commit()

        # e) UPSERT ficha_salud por id_estudiante --------------------------
        fichas_filas = []
        for run, f in fichas.items():
            id_est = run_to_id.get(run)
            if id_est is None:
                continue
            # Solo crear ficha si hay al menos un dato útil.
            if not any(f.values()):
                continue
            fichas_filas.append((
                id_est, f["sistema_salud"], f["letra_fonasa"], f["cesfam"],
                f["centro_emergencia"], f["alergias"], f["diagnostico_medico"],
                f["medico_tratante"], f["medicamento"], f["nee"], f["nee_tipo"],
            ))
        if fichas_filas:
            total = len(fichas_filas)
            print(f"\nUpsert de {total:,} fichas de salud...", flush=True)
            for ch in en_chunks(fichas_filas):
                execute_values(cur, """
                    INSERT INTO ficha_salud (id_estudiante, sistema_salud, letra_fonasa,
                        cesfam, centro_emergencia, alergias, diagnostico_medico,
                        medico_tratante, medicamento, nee, nee_tipo, fecha_actualizacion)
                    VALUES %s
                    ON CONFLICT (id_estudiante) DO UPDATE SET
                        sistema_salud      = COALESCE(EXCLUDED.sistema_salud, ficha_salud.sistema_salud),
                        letra_fonasa       = COALESCE(EXCLUDED.letra_fonasa, ficha_salud.letra_fonasa),
                        cesfam             = COALESCE(EXCLUDED.cesfam, ficha_salud.cesfam),
                        centro_emergencia  = COALESCE(EXCLUDED.centro_emergencia, ficha_salud.centro_emergencia),
                        alergias           = COALESCE(EXCLUDED.alergias, ficha_salud.alergias),
                        diagnostico_medico = COALESCE(EXCLUDED.diagnostico_medico, ficha_salud.diagnostico_medico),
                        medico_tratante    = COALESCE(EXCLUDED.medico_tratante, ficha_salud.medico_tratante),
                        medicamento        = COALESCE(EXCLUDED.medicamento, ficha_salud.medicamento),
                        nee                = COALESCE(EXCLUDED.nee, ficha_salud.nee),
                        nee_tipo           = COALESCE(EXCLUDED.nee_tipo, ficha_salud.nee_tipo),
                        fecha_actualizacion = now()
                """, ch, template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())",
                    page_size=CHUNK)
                conn.commit()

        # f) INSERTAR matrículas 2026 --------------------------------------
        mat_filas = []
        mat_sin_est = 0
        for m in matriculas:
            id_est = run_to_id.get(m["run"])
            if id_est is None:
                mat_sin_est += 1
                continue
            mat_filas.append((
                m["numero_correlativo"], ANIO_ESCOLAR, id_est, ID_ESTABLECIMIENTO,
                m["fecha_matricula"], m["nivel_ensenanza"], m["curso"], m["estado"],
                m["fecha_retiro"], m["motivo_retiro"], m["observaciones"],
                id_usuario, m["cod_tipo_ensenanza"], m["cod_grado"], m["letra_curso"],
            ))
        if mat_filas:
            total = len(mat_filas)
            print(f"\nInsertando {total:,} matrículas 2026 "
                  f"({mat_sin_est} sin estudiante, omitidas)...", flush=True)
            hecho = 0
            for ch in en_chunks(mat_filas):
                execute_values(cur, """
                    INSERT INTO matricula (numero_correlativo, anio_escolar, id_estudiante,
                        id_establecimiento, fecha_matricula, nivel_ensenanza, curso, estado,
                        fecha_retiro, motivo_retiro, observaciones, id_usuario_ejecutor,
                        cod_tipo_ensenanza, cod_grado, letra_curso)
                    VALUES %s
                    ON CONFLICT (id_establecimiento, anio_escolar, cod_tipo_ensenanza,
                        curso, numero_correlativo) DO NOTHING
                """, ch, page_size=CHUNK)
                conn.commit()
                hecho += len(ch)
                print(f"  matrículas: {hecho:,}/{total:,}", flush=True)

        print("\n>>> CARGA APLICADA (commits por chunk). <<<", flush=True)
        print("=== RESUMEN FINAL ===", flush=True)
        print(f"  Apoderados nuevos insertados : {len(apod_a_insertar):,}")
        print(f"  Estudiantes nuevos creados   : {len(nuevos_filas):,} "
              f"(omitidos sin fecha_nac: {omitidos})")
        print(f"  Direcciones actualizadas     : {len(est_update_dir):,}")
        print(f"  Vínculos titular/suplente    : {len(pares_ppal):,}/{len(pares_supl):,}")
        print(f"  Fichas de salud upsert       : {len(fichas_filas):,}")
        print(f"  Matrículas 2026 insertadas   : {len(mat_filas):,} "
              f"(omitidas sin estudiante: {mat_sin_est})")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR (rollback): {type(e).__name__}: {e}", flush=True)
        raise
    finally:
        cur.close()
        conn.close()
        close_db_pool()
        sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
