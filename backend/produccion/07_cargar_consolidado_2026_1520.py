# -*- coding: utf-8 -*-
"""
HERRAMIENTA 7 — CARGA CONSOLIDADA de la matrícula 2026 del RBD 1520 (DRY-RUN por defecto).

ENFOQUE (decidido con el dueño)
===============================
El Registro General de Matrícula (Excel del formulario del colegio) es la fuente
PRINCIPAL, porque trae TODOS los datos ricos que el colegio ya reportó (apoderado
titular/suplente con RUT, teléfono, correo; ficha de salud; dirección detallada;
curso). SIGE se usa para COMPLETAR los pocos alumnos que estén en SIGE y no en el
formulario. Así no se pierde a nadie y se conserva el máximo de datos ya cargados.

CLAVE DE MATCHING = CUERPO DEL RUT (sin dígito verificador)
===========================================================
CRÍTICO: el formulario y SIGE a veces traen el mismo alumno con identificadores
distintos (p. ej. extranjeros con IPE provisorio en una fuente y RUN en la otra),
y el DV no siempre viene confiable. Por eso TODO el cruce (entre fuentes y contra
la base) se hace por el CUERPO del RUT/IPE, no por RUN+DV. Esto evita duplicar
alumnos y evita falsos "nuevos".

Fuentes:
  - Formulario: csv pruebas/REGISTRO GENERAL DE MATRÍCULA 2026 - 1520 - ...xlsx
  - SIGE:       csv pruebas/nomina_excel (3).xls  (HTML disfrazado de .xls)

Qué escribe (todo UPSERT, no pisa datos buenos):
  - estudiante   (UNIQUE run_ipe) — crea nuevos; a existentes solo rellena dirección.
  - apoderado    (UNIQUE rut_pasaporte) — titular/suplente del formulario.
  - ficha_salud  (UNIQUE id_estudiante) — datos de salud del formulario.
  - matricula    2026 — INSERT con ON CONFLICT DO NOTHING (idempotente).
    Curso/grado/estado: del formulario; si el alumno solo está en SIGE, de SIGE.

Prerrequisito: correr antes 05b_limpiar_2026_1520.py --apply (deja 2026/1520 vacío).
Practicantes de prueba (RUN 20845517 y 21749866): NUNCA se cargan.

Rendimiento: carga a memoria (2 queries) + escritura en chunks con execute_values.

Uso (desde backend/):
    python produccion/07_cargar_consolidado_2026_1520.py            # DRY-RUN
    python produccion/07_cargar_consolidado_2026_1520.py --apply    # aplica
    python produccion/07_cargar_consolidado_2026_1520.py --id-usuario 18
"""
import argparse
import re
import sys
from pathlib import Path

import pandas as pd
import openpyxl
from lxml import html as lh

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402
from services.utils import normalizar_rut, determinar_nivel_backend  # noqa: E402
from psycopg2.extras import execute_values  # noqa: E402

# ---------------------------------------------------------------------------
ID_ESTABLECIMIENTO = 17
ANIO_ESCOLAR = 2026
CORREO_EJECUTOR_DEFAULT = "carolina.conchap@slepvalparaiso.cl"
ID_USUARIO_FALLBACK = 1
CHUNK = 500
RETIRO_NULO_SIGE = {"", "1900-01-01", "01-01-1900", "1900-1-1"}

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
SIGE_DEFAULT = RAIZ / "csv pruebas" / "nomina_excel (3).xls"
EXCEL_DEFAULT = (RAIZ / "csv pruebas" /
                 "REGISTRO GENERAL DE MATRÍCULA 2026 - 1520 - "
                 "LICEO BICENTENARIO MARITIMO DE VALPARAISO.xlsx")

# Cuerpos de RUT de los practicantes (sin DV) a excluir siempre.
PRACTICANTES_CUERPO = {"20845517", "21749866"}

XF = {
    "nro_matricula": 0, "nombres": 1, "apellido_paterno": 2, "apellido_materno": 3,
    "rut_cuerpo": 4, "rut_dv": 5, "fecha_nac": 6, "sexo": 9, "nacionalidad": 10,
    "calle": 15, "numeracion": 16, "sector": 17, "comuna": 18,
    "prevision": 26, "letra_fonasa": 27, "cesfam": 28, "centro_emergencia": 29,
    "alergias": 30, "diag_medico_flag": 31, "medico_tratante": 32, "medicamento": 33,
    "nee": 34, "nee_tipo": 36,
    "apod_tit_nombre": 37, "apod_tit_rut": 38, "apod_tit_dv": 39, "apod_tit_tel": 40,
    "apod_tit_correo": 42,
    "apod_sup_nombre": 43, "apod_sup_rut": 44, "apod_sup_dv": 45, "apod_sup_tel": 46,
    "apod_sup_correo": 48,
    "tipo_ensenanza": 49, "curso": 50, "fecha_matricula": 52,
    "se_retira": 53, "fecha_retiro": 54, "motivo_retiro": 55,
    "obs_motivo_retiro": 56, "observaciones": 58,
}
SG = {
    "cod_tipo": 2, "cod_grado": 3, "desc_grado": 4, "letra": 5,
    "run": 6, "dv": 7, "genero": 8, "nombres": 9, "apellido_paterno": 10,
    "apellido_materno": 11, "direccion": 12, "comuna": 13,
    "fecha_nac": 18, "fecha_incorp": 20, "fecha_retiro": 21,
}


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
def limpiar(v) -> str:
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


def cuerpo_rut(v) -> str:
    """CLAVE de matching: cuerpo del RUT/IPE sin DV, sin separadores, mayúscula.
    '24.301.212' -> '24301212'; '24301212' -> '24301212'; IPE largos tal cual."""
    x = re.sub(r"[.\-\s]", "", limpiar(v)).upper()
    x = x[:-2] if x.endswith(".0") else x
    return x


def run_ipe_completo(cuerpo, dv) -> str:
    """run_ipe canónico para guardar en estudiante: cuerpo+DV."""
    c = cuerpo_rut(cuerpo)
    d = re.sub(r"[.\-\s]", "", limpiar(dv)).upper()
    return c + d


def rut_apoderado(cuerpo, dv) -> str:
    c = limpiar(cuerpo)
    if not c:
        return ""
    cl = re.sub(r"[.\-\s]", "", c)
    cl = cl[:-2] if cl.endswith(".0") else cl
    if not cl.isdigit() or not (7 <= len(cl) <= 9):
        return ""
    d = re.sub(r"[.\-\s]", "", limpiar(dv)).upper()
    return normalizar_rut(f"{cl}{d}" if d else cl)[:20]


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


def nombre_valido(s) -> bool:
    s = limpiar(s)
    return len(s) >= 3 and s.upper() not in (
        "NO", "SI", "S/I", "N/A", "NN", "NO APLICA", "SIN INFORMACION", "NO TIENE")


def separar_nombre(nombre_completo: str):
    s = limpiar(nombre_completo)
    if "," in s:
        izq, der = s.split(",", 1)
        aps = [p for p in izq.split() if p]
        nombres = der.strip()
        pat = aps[0] if aps else "Titular"
        mat = aps[1] if len(aps) > 1 else None
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
    return "F" if limpiar(v).upper().startswith("F") else "M"


def a_fecha(v):
    s = limpiar(v)
    if not s:
        return None
    try:
        ts = pd.to_datetime(v, errors="coerce", dayfirst=True)
        if pd.isna(ts):
            return None
        d = ts.date()
        return None if d.year <= 1900 else d
    except Exception:
        return None


def componer_domicilio(calle, numero, sector, comuna):
    partes = [p for p in [f"{calle or ''} {numero or ''}".strip(), (sector or ""), (comuna or "")] if p]
    return ", ".join(partes) if partes else None


GRADO_BASICA = {6: 6, 7: 7, 8: 8}
GRADO_MEDIA = {1: 1, 2: 2, 3: 3, 4: 4}


def parsear_tipo_ensenanza(v):
    s = limpiar(v)
    if not s:
        return (None, None)
    m = re.match(r"\s*(\d{2,4})", s)
    return (int(m.group(1)) if m else None, s)


def parsear_curso_texto(v):
    s = limpiar(v)
    if not s:
        return (None, None, None)
    curso = re.sub(r"\s+", " ", s).strip()
    m = re.match(r"\s*(\d+)", curso)
    num = int(m.group(1)) if m else None
    low = curso.lower()
    cod = None
    if num is not None:
        if "medio" in low or "media" in low:
            cod = GRADO_MEDIA.get(num)
        elif "básico" in low or "basico" in low:
            cod = GRADO_BASICA.get(num)
    letra = None
    toks = curso.split()
    if toks and len(toks[-1]) == 1 and toks[-1].isalpha():
        letra = toks[-1].upper()
    return (curso, cod, letra)


def se_retira(v) -> bool:
    return limpiar(v).lower().startswith("s")


def resolver_id_usuario(cur, forzado):
    if forzado:
        return forzado
    try:
        cur.execute("SELECT id_usuario FROM usuario WHERE lower(email_institucional)=lower(%s) LIMIT 1",
                    (CORREO_EJECUTOR_DEFAULT,))
        row = cur.fetchone()
        if row:
            return row[0]
    except Exception:
        pass
    return ID_USUARIO_FALLBACK


# ---------------------------------------------------------------------------
# LECTURA DE FUENTES (clave = cuerpo del RUT)
# ---------------------------------------------------------------------------
def leer_formulario(ruta):
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    ws = wb["Nomina de estudiantes"]

    def cel(fila, key):
        idx = XF[key]
        return fila[idx] if idx < len(fila) else None

    out = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if len(row) < 54 or row[XF["rut_cuerpo"]] is None:
            continue
        clave = cuerpo_rut(cel(row, "rut_cuerpo"))
        if not clave or clave in out:
            continue
        curso, cod_grado, letra = parsear_curso_texto(cel(row, "curso"))
        cod_tipo, nivel_txt = parsear_tipo_ensenanza(cel(row, "tipo_ensenanza"))
        out[clave] = {
            "clave": clave,
            "run_ipe": run_ipe_completo(cel(row, "rut_cuerpo"), cel(row, "rut_dv")),
            "nombres": limpiar(cel(row, "nombres")),
            "apellido_paterno": limpiar(cel(row, "apellido_paterno")),
            "apellido_materno": limpiar(cel(row, "apellido_materno")) or None,
            "sexo": normalizar_sexo(cel(row, "sexo")),
            "fecha_nac": a_fecha(cel(row, "fecha_nac")),
            "nacionalidad": limpiar(cel(row, "nacionalidad")) or None,
            "calle": limpiar(cel(row, "calle")) or None,
            "numero": limpiar(cel(row, "numeracion")) or None,
            "sector": limpiar(cel(row, "sector")) or None,
            "comuna": limpiar(cel(row, "comuna")) or None,
            "apod_tit": (rut_apoderado(cel(row, "apod_tit_rut"), cel(row, "apod_tit_dv")),
                         limpiar(cel(row, "apod_tit_nombre")),
                         cel(row, "apod_tit_tel"), cel(row, "apod_tit_correo")),
            "apod_sup": (rut_apoderado(cel(row, "apod_sup_rut"), cel(row, "apod_sup_dv")),
                         limpiar(cel(row, "apod_sup_nombre")),
                         cel(row, "apod_sup_tel"), cel(row, "apod_sup_correo")),
            "salud": {
                "sistema_salud": limpiar(cel(row, "prevision")) or None,
                "letra_fonasa": limpiar(cel(row, "letra_fonasa")) or None,
                "cesfam": limpiar(cel(row, "cesfam")) or None,
                "centro_emergencia": limpiar(cel(row, "centro_emergencia")) or None,
                "alergias": limpiar(cel(row, "alergias")) or None,
                "diagnostico_medico": limpiar(cel(row, "diag_medico_flag")) or None,
                "medico_tratante": limpiar(cel(row, "medico_tratante")) or None,
                "medicamento": limpiar(cel(row, "medicamento")) or None,
                "nee": limpiar(cel(row, "nee")) or None,
                "nee_tipo": limpiar(cel(row, "nee_tipo")) or None,
            },
            "curso": curso, "cod_grado": cod_grado, "letra": letra,
            "cod_tipo": cod_tipo, "nivel_txt": nivel_txt,
            "fecha_matricula": a_fecha(cel(row, "fecha_matricula")),
            "retira": se_retira(cel(row, "se_retira")),
            "fecha_retiro": a_fecha(cel(row, "fecha_retiro")),
            "motivo_retiro": limpiar(cel(row, "motivo_retiro")) or None,
            "observaciones": ((limpiar(cel(row, "observaciones")) or "") + (
                (" | " + limpiar(cel(row, "obs_motivo_retiro")))
                if limpiar(cel(row, "obs_motivo_retiro")) else "")).strip(" |") or None,
        }
    wb.close()
    return out


def leer_sige(ruta):
    doc = lh.fromstring(open(ruta, "rb").read())
    filas = max(doc.xpath("//table"), key=lambda t: len(t.xpath(".//tr"))).xpath(".//tr")
    out = {}
    for tr in filas[1:]:
        c = [x.text_content().strip() for x in tr.xpath(".//td|.//th")]
        if len(c) < 22 or not c[SG["run"]]:
            continue
        clave = cuerpo_rut(c[SG["run"]])
        if not clave or clave in out:
            continue
        retiro_raw = c[SG["fecha_retiro"]].strip()
        retirado = retiro_raw not in RETIRO_NULO_SIGE
        curso = f"{c[SG['desc_grado']].strip()} {c[SG['letra']].strip()}".strip()
        try:
            cod_tipo = int(c[SG["cod_tipo"]]) if c[SG["cod_tipo"]] else None
        except ValueError:
            cod_tipo = None
        try:
            cod_grado = int(c[SG["cod_grado"]]) if c[SG["cod_grado"]] else None
        except ValueError:
            cod_grado = None
        out[clave] = {
            "clave": clave,
            "run_ipe": run_ipe_completo(c[SG["run"]], c[SG["dv"]]),
            "nombres": c[SG["nombres"]].strip() or "SIN NOMBRE",
            "apellido_paterno": c[SG["apellido_paterno"]].strip() or "SIN APELLIDO",
            "apellido_materno": c[SG["apellido_materno"]].strip() or None,
            "sexo": normalizar_sexo(c[SG["genero"]]),
            "fecha_nac": a_fecha(c[SG["fecha_nac"]]),
            "direccion": c[SG["direccion"]].strip() or None,
            "comuna": c[SG["comuna"]].strip() or None,
            "cod_tipo": cod_tipo, "cod_grado": cod_grado, "letra": c[SG["letra"]].strip() or None,
            "curso": curso,
            "fecha_matricula": a_fecha(c[SG["fecha_incorp"]]),
            "fecha_retiro": a_fecha(retiro_raw) if retirado else None,
            "retirado": retirado,
        }
    return out


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Carga consolidada 2026 RBD 1520 (DRY-RUN)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--sige", default=str(SIGE_DEFAULT))
    ap.add_argument("--excel", default=str(EXCEL_DEFAULT))
    ap.add_argument("--id-usuario", type=int, default=None)
    args = ap.parse_args()

    modo = "APLICAR (escribe)" if args.apply else "DRY-RUN (no escribe)"
    print("=" * 66)
    print(f"CARGA CONSOLIDADA 2026 — RBD 1520 — Modo: {modo}")
    print("Clave de matching: CUERPO del RUT (sin DV)")
    print("=" * 66)

    print("Leyendo formulario...", flush=True)
    form = leer_formulario(args.excel)
    print(f"  Formulario: {len(form)} alumnos", flush=True)
    print("Leyendo SIGE...", flush=True)
    sige = leer_sige(args.sige)
    print(f"  SIGE: {len(sige)} alumnos", flush=True)

    # Universo = unión por cuerpo de RUT, menos practicantes.
    universo = (set(form) | set(sige)) - PRACTICANTES_CUERPO
    solo_sige = (set(sige) - set(form)) - PRACTICANTES_CUERPO
    en_ambos = (set(form) & set(sige)) - PRACTICANTES_CUERPO
    print(f"\nUNIVERSO (unión, sin practicantes): {len(universo)}")
    print(f"  en ambas fuentes   : {len(en_ambos)}")
    print(f"  solo en formulario : {len(set(form) - set(sige) - PRACTICANTES_CUERPO)}")
    print(f"  solo en SIGE       : {len(solo_sige)}")

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

        # Mapas de la base indexados por CUERPO de RUT.
        cur.execute("SELECT run_ipe, id_estudiante FROM estudiante")
        cuerpo_to_id = {}
        for run_ipe, idest in cur.fetchall():
            x = re.sub(r"[.\-\s]", "", (run_ipe or "")).upper()
            x = x[:-2] if x.endswith(".0") else x
            # cuerpo = run sin el ultimo caracter (DV), salvo IPE largos que guardamos igual
            clave = x[:-1] if len(x) > 1 else x
            cuerpo_to_id.setdefault(clave, idest)
            cuerpo_to_id.setdefault(x, idest)   # tolerar run guardado sin DV
        cur.execute("SELECT rut_pasaporte, id_apoderado FROM apoderado")
        apod_exist = {r[0]: r[1] for r in cur.fetchall()}
        print(f"  estudiantes en base: {len({v for v in cuerpo_to_id.values()}):,} | "
              f"apoderados: {len(apod_exist):,}", flush=True)

        est_nuevos = {}
        est_update = {}
        apod_insert = {}
        vinc = {}
        fichas = {}
        matriculas = []
        st = {"est_nuevos": 0, "est_update": 0, "apod_nuevos": 0,
              "fichas": 0, "mat": 0, "mat_retiradas": 0, "sin_fnac": 0}

        def reg_apod(rut, nombre, tel, correo, relacion):
            if not rut or rut in apod_exist or rut in apod_insert or not nombre_valido(nombre):
                return
            n, p, m = separar_nombre(nombre)
            apod_insert[rut] = (rut, n, p, m, "Sin registrar",
                                limpiar_telefono(tel) or None, (limpiar(correo)[:100] or None), relacion)
            st["apod_nuevos"] += 1

        for clave in universo:
            f = form.get(clave)
            s = sige.get(clave)
            base_rec = f or s   # el formulario manda para identidad/run_ipe

            run_ipe = base_rec["run_ipe"]
            nombres = base_rec["nombres"]
            ap_pat = base_rec["apellido_paterno"]
            ap_mat = base_rec.get("apellido_materno")
            sexo = base_rec["sexo"]
            fnac = (f["fecha_nac"] if f and f["fecha_nac"] else (s["fecha_nac"] if s else None))

            calle = f["calle"] if f else None
            numero = f["numero"] if f else None
            sector = f["sector"] if f else None
            comuna = (f["comuna"] if f and f["comuna"] else (s["comuna"] if s else None))
            dom = componer_domicilio(calle, numero, sector, comuna) or (s["direccion"] if s else None)

            id_est = cuerpo_to_id.get(clave)
            if id_est is None:
                est_nuevos[clave] = {
                    "run_ipe": run_ipe, "nombres": nombres or "SIN NOMBRE",
                    "apellido_paterno": ap_pat or "SIN APELLIDO", "apellido_materno": ap_mat,
                    "sexo": sexo, "fecha_nacimiento": fnac, "domicilio": dom or "Sin registrar",
                    "calle": calle, "numero": numero, "sector": sector, "comuna": comuna,
                    "pais_origen": (f.get("nacionalidad") if f else None),
                }
                st["est_nuevos"] += 1
                if fnac is None:
                    st["sin_fnac"] += 1
            elif any([calle, numero, sector, comuna, dom]):
                est_update[clave] = (id_est, calle, numero, sector, comuna, dom)
                st["est_update"] += 1

            # Apoderados + salud (solo formulario)
            if f:
                rt, nt, tt, ct = f["apod_tit"]
                if rt and nombre_valido(nt):
                    reg_apod(rt, nt, tt, ct, "Apoderado Titular")
                    vinc.setdefault(clave, {}).setdefault("ppal", rt)
                rs, ns, ts_, cs = f["apod_sup"]
                if rs and nombre_valido(ns):
                    reg_apod(rs, ns, ts_, cs, "Apoderado Suplente")
                    vinc.setdefault(clave, {}).setdefault("supl", rs)
                if any(f["salud"].values()):
                    fichas[clave] = f["salud"]
                    st["fichas"] += 1

            # Matrícula: formulario manda; si solo está en SIGE, SIGE.
            if f:
                curso = f["curso"] or (s["curso"] if s else "SIN CURSO")
                cod_grado = f["cod_grado"] if f["cod_grado"] is not None else (s["cod_grado"] if s else None)
                cod_tipo = f["cod_tipo"] if f["cod_tipo"] is not None else (s["cod_tipo"] if s else None)
                letra = f["letra"] or (s["letra"] if s else None)
                retirado = f["retira"]
                fecha_mat = f["fecha_matricula"] or (s["fecha_matricula"] if s else None)
                fecha_ret = f["fecha_retiro"] if retirado else None
                motivo = f["motivo_retiro"] if retirado else None
                obs = f["observaciones"]
                nivel = f["nivel_txt"]
            else:
                curso = s["curso"] or "SIN CURSO"
                cod_grado = s["cod_grado"]; cod_tipo = s["cod_tipo"]; letra = s["letra"]
                retirado = s["retirado"]
                fecha_mat = s["fecha_matricula"]; fecha_ret = s["fecha_retiro"]
                motivo = None; obs = None; nivel = None
            if not nivel:
                nivel = determinar_nivel_backend(curso, cod_tipo)

            matriculas.append({
                "clave": clave, "curso": curso, "cod_grado": cod_grado, "cod_tipo": cod_tipo,
                "letra": letra, "estado": "Retirada" if retirado else "Activa",
                "fecha_matricula": fecha_mat, "fecha_retiro": fecha_ret,
                "motivo_retiro": motivo, "observaciones": obs, "nivel": nivel,
            })
            st["mat"] += 1
            if retirado:
                st["mat_retiradas"] += 1

        contador = {}
        for m in matriculas:
            k = (m["cod_tipo"], m["curso"])
            contador[k] = contador.get(k, 0) + 1
            m["correlativo"] = contador[k]

        print("\n=== IMPACTO ===", flush=True)
        print(f"  Estudiantes NUEVOS a crear   : {st['est_nuevos']:,} ({st['sin_fnac']} sin fecha_nac -> omitir)")
        print(f"  Estudiantes a actualizar dir.: {st['est_update']:,}")
        print(f"  Apoderados NUEVOS a insertar : {st['apod_nuevos']:,}")
        print(f"  Fichas de salud (UPSERT)     : {st['fichas']:,}")
        print(f"  Matrículas 2026 a insertar   : {st['mat']:,} (retiradas: {st['mat_retiradas']:,})")

        if not args.apply:
            conn.rollback()
            print("\n(DRY-RUN: no se escribió nada. Usa --apply para aplicar.)")
            cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()
            return

        def en_chunks(l):
            for i in range(0, len(l), CHUNK):
                yield l[i:i + CHUNK]

        # a) apoderados
        if apod_insert:
            filas = list(apod_insert.values()); tot = len(filas); hecho = 0
            print(f"\nInsertando {tot:,} apoderados...", flush=True)
            for ch in en_chunks(filas):
                execute_values(cur, """
                    INSERT INTO apoderado (rut_pasaporte, nombres, apellido_paterno, apellido_materno,
                        domicilio, telefono, correo_electronico, relacion_estudiante)
                    VALUES %s
                    ON CONFLICT (rut_pasaporte) DO UPDATE SET
                        telefono=COALESCE(apoderado.telefono, EXCLUDED.telefono),
                        correo_electronico=COALESCE(apoderado.correo_electronico, EXCLUDED.correo_electronico)
                """, ch, page_size=CHUNK)
                conn.commit(); hecho += len(ch); print(f"  {hecho:,}/{tot:,}", flush=True)
            cur.execute("SELECT rut_pasaporte, id_apoderado FROM apoderado")
            apod_exist = {r[0]: r[1] for r in cur.fetchall()}

        # b) estudiantes nuevos
        nuevos = [v for v in est_nuevos.values() if v["fecha_nacimiento"] is not None]
        omit = len(est_nuevos) - len(nuevos)
        if nuevos:
            tot = len(nuevos); hecho = 0
            print(f"\nInsertando {tot:,} estudiantes nuevos ({omit} omitidos sin fecha_nac)...", flush=True)
            for ch in en_chunks(nuevos):
                vals = [(v["run_ipe"], v["nombres"], v["apellido_paterno"], v["apellido_materno"],
                         v["sexo"], v["fecha_nacimiento"], v["domicilio"],
                         v["calle"], v["numero"], v["sector"], v["comuna"], v["pais_origen"]) for v in ch]
                execute_values(cur, """
                    INSERT INTO estudiante (run_ipe, nombres, apellido_paterno, apellido_materno,
                        sexo, fecha_nacimiento, domicilio, calle, numero, sector, comuna,
                        pais_origen, fecha_actualizacion)
                    VALUES %s
                    ON CONFLICT (run_ipe) DO UPDATE SET
                        domicilio=COALESCE(NULLIF(EXCLUDED.domicilio,'Sin registrar'),estudiante.domicilio),
                        calle=COALESCE(EXCLUDED.calle,estudiante.calle),
                        numero=COALESCE(EXCLUDED.numero,estudiante.numero),
                        sector=COALESCE(EXCLUDED.sector,estudiante.sector),
                        comuna=COALESCE(EXCLUDED.comuna,estudiante.comuna),
                        fecha_actualizacion=now()
                """, vals, template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())", page_size=CHUNK)
                conn.commit(); hecho += len(ch); print(f"  {hecho:,}/{tot:,}", flush=True)

        # c) actualizar direcciones
        if est_update:
            filas = list(est_update.values())
            print(f"\nActualizando dirección de {len(filas):,} estudiantes...", flush=True)
            for ch in en_chunks(filas):
                execute_values(cur, """
                    UPDATE estudiante AS e SET
                        calle=COALESCE(d.calle,e.calle), numero=COALESCE(d.num,e.numero),
                        sector=COALESCE(d.sec,e.sector), comuna=COALESCE(d.com,e.comuna),
                        domicilio=COALESCE(NULLIF(d.dom,''),e.domicilio), fecha_actualizacion=now()
                    FROM (VALUES %s) AS d(id_est,calle,num,sec,com,dom)
                    WHERE e.id_estudiante=d.id_est
                """, ch, page_size=CHUNK)
                conn.commit()

        # refrescar mapa de ids por cuerpo
        cur.execute("SELECT run_ipe, id_estudiante FROM estudiante")
        cuerpo_to_id = {}
        for run_ipe, idest in cur.fetchall():
            x = re.sub(r"[.\-\s]", "", (run_ipe or "")).upper()
            x = x[:-2] if x.endswith(".0") else x
            cuerpo_to_id.setdefault(x[:-1] if len(x) > 1 else x, idest)
            cuerpo_to_id.setdefault(x, idest)

        # d) vincular apoderados
        pares_p, pares_s = [], []
        for clave, v in vinc.items():
            idest = cuerpo_to_id.get(clave)
            if not idest:
                continue
            if v.get("ppal") in apod_exist:
                pares_p.append((apod_exist[v["ppal"]], idest))
            if v.get("supl") in apod_exist:
                pares_s.append((apod_exist[v["supl"]], idest))
        for pares, campo, label in ((pares_p, "id_apoderado_principal", "titulares"),
                                     (pares_s, "id_apoderado_suplente", "suplentes")):
            if pares:
                print(f"Vinculando {len(pares):,} {label}...", flush=True)
                for ch in en_chunks(pares):
                    execute_values(cur, f"""
                        UPDATE estudiante AS e SET {campo}=v.id_apod
                        FROM (VALUES %s) AS v(id_apod,id_est)
                        WHERE e.id_estudiante=v.id_est AND e.{campo} IS NULL
                    """, ch, page_size=CHUNK)
                    conn.commit()

        # e) fichas de salud
        fichas_filas = []
        for clave, s in fichas.items():
            idest = cuerpo_to_id.get(clave)
            if idest and any(s.values()):
                fichas_filas.append((idest, s["sistema_salud"], s["letra_fonasa"], s["cesfam"],
                                     s["centro_emergencia"], s["alergias"], s["diagnostico_medico"],
                                     s["medico_tratante"], s["medicamento"], s["nee"], s["nee_tipo"]))
        if fichas_filas:
            print(f"\nUpsert {len(fichas_filas):,} fichas de salud...", flush=True)
            for ch in en_chunks(fichas_filas):
                execute_values(cur, """
                    INSERT INTO ficha_salud (id_estudiante, sistema_salud, letra_fonasa, cesfam,
                        centro_emergencia, alergias, diagnostico_medico, medico_tratante,
                        medicamento, nee, nee_tipo, fecha_actualizacion)
                    VALUES %s
                    ON CONFLICT (id_estudiante) DO UPDATE SET
                        sistema_salud=COALESCE(EXCLUDED.sistema_salud,ficha_salud.sistema_salud),
                        letra_fonasa=COALESCE(EXCLUDED.letra_fonasa,ficha_salud.letra_fonasa),
                        cesfam=COALESCE(EXCLUDED.cesfam,ficha_salud.cesfam),
                        centro_emergencia=COALESCE(EXCLUDED.centro_emergencia,ficha_salud.centro_emergencia),
                        alergias=COALESCE(EXCLUDED.alergias,ficha_salud.alergias),
                        diagnostico_medico=COALESCE(EXCLUDED.diagnostico_medico,ficha_salud.diagnostico_medico),
                        medico_tratante=COALESCE(EXCLUDED.medico_tratante,ficha_salud.medico_tratante),
                        medicamento=COALESCE(EXCLUDED.medicamento,ficha_salud.medicamento),
                        nee=COALESCE(EXCLUDED.nee,ficha_salud.nee),
                        nee_tipo=COALESCE(EXCLUDED.nee_tipo,ficha_salud.nee_tipo),
                        fecha_actualizacion=now()
                """, ch, template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())", page_size=CHUNK)
                conn.commit()

        # f) matrículas
        mat_filas = []; sin_est = 0
        for m in matriculas:
            idest = cuerpo_to_id.get(m["clave"])
            if not idest:
                sin_est += 1
                continue
            mat_filas.append((m["correlativo"], ANIO_ESCOLAR, idest, ID_ESTABLECIMIENTO,
                              m["fecha_matricula"], m["nivel"], m["curso"], m["estado"],
                              m["fecha_retiro"], m["motivo_retiro"], m["observaciones"],
                              id_usuario, m["cod_tipo"], m["cod_grado"], m["letra"]))
        if mat_filas:
            tot = len(mat_filas); hecho = 0
            print(f"\nInsertando {tot:,} matrículas ({sin_est} sin estudiante, omitidas)...", flush=True)
            for ch in en_chunks(mat_filas):
                execute_values(cur, """
                    INSERT INTO matricula (numero_correlativo, anio_escolar, id_estudiante,
                        id_establecimiento, fecha_matricula, nivel_ensenanza, curso, estado,
                        fecha_retiro, motivo_retiro, observaciones, id_usuario_ejecutor,
                        cod_tipo_ensenanza, cod_grado, letra_curso)
                    VALUES %s
                    ON CONFLICT (id_establecimiento, anio_escolar, cod_tipo_ensenanza, curso, numero_correlativo)
                    DO NOTHING
                """, ch, page_size=CHUNK)
                conn.commit(); hecho += len(ch); print(f"  {hecho:,}/{tot:,}", flush=True)

        print("\n>>> CARGA CONSOLIDADA APLICADA. <<<", flush=True)
        print(f"  Estudiantes nuevos : {len(nuevos):,} (omitidos {omit})")
        print(f"  Direcciones actual.: {len(est_update):,}")
        print(f"  Apoderados nuevos  : {len(apod_insert):,}")
        print(f"  Fichas salud       : {len(fichas_filas):,}")
        print(f"  Matrículas 2026    : {len(mat_filas):,} (omitidas sin estudiante: {sin_est})")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR (rollback): {type(e).__name__}: {e}", flush=True)
        raise
    finally:
        cur.close(); conn.close(); close_db_pool(); sys.stdout.flush()


if __name__ == "__main__":
    main()
    sys.exit(0)
