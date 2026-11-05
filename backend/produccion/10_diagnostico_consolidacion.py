# -*- coding: utf-8 -*-
"""
HERRAMIENTA 10 — DIAGNÓSTICO de consolidación SIGE ↔ Excel ↔ RGM, por RBD.
(SOLO LECTURA: no modifica la base ni los archivos. Genera un informe.)

Generaliza el trabajo manual del piloto 1520 (ver steering 18) para cualquier
establecimiento. Cruza las tres fuentes por CUERPO de RUT y clasifica las diferencias.

TOLERANTE A CAMBIOS DE COLUMNAS DEL FORMULARIO
==============================================
El formulario del colegio puede agregar/quitar/renombrar columnas. Por eso este
script NO usa posiciones fijas: resuelve cada campo buscando su ENCABEZADO por
substring normalizado (ver contrato en
`.kiro/specs/integracion-sige/contrato-campos-rgm.md`). SIGE es estable (formato
Mineduc) y se resuelve por nombre igualmente.

QUÉ HACE
========
1. Lee el SIGE (.xls-HTML) y el formulario (.xlsx) de la carpeta del RBD.
2. Lee del RGM (BD) las matrículas del año/establecimiento (solo lectura).
3. Cruza por cuerpo de RUT y clasifica:
     CUADRADO, SOLO_EN_RGM, SOLO_EN_SIGE, SOLO_EN_FORMULARIO,
     CURSO_DISTINTO (SIGE vs RGM), RETIRO_SIGE_NO_EN_RGM, IDENTIDAD_IPE_RUN.
4. Imprime conteos y detalle; opcionalmente exporta CSVs a produccion/salida/diag_<rbd>/.

NO decide ni aplica nada: es el paso previo a una corrección (script tipo 09).

USO (desde backend/)
====================
    python produccion/10_diagnostico_consolidacion.py --rbd 1502
    python produccion/10_diagnostico_consolidacion.py --rbd 1520 --anio 2026
    python produccion/10_diagnostico_consolidacion.py --rbd 14678 --csv
    # rutas por defecto: csv pruebas/matricula_<anio>/<rbd>/  (SIGE .xls y formulario .xlsx)
    # se pueden forzar con --sige y --form.

Requiere: pandas, openpyxl, lxml.
"""
import argparse
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
from lxml import html as lh

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import get_db_connection, close_db_pool  # noqa: E402

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent

# Cuerpos de practicantes u otros a excluir siempre (ampliar si aplica).
EXCLUIR_CUERPOS = {"20845517", "21749866"}

# ------- Alias de encabezados del FORMULARIO (substring normalizado) -------
ALIAS_FORM = {
    "run": ["rut estudiante"],
    "dv": ["digito verificador estudiante"],
    "nombres": ["nombres"],
    "ap_pat": ["apellido paterno"],
    "ap_mat": ["apellido materno"],
    "sexo": ["sexo"],
    "curso": ["curso"],           # se filtra para excluir 'repite'/'cursar'
    "se_retira": ["se retira"],
    "fecha_retiro": ["fecha de retiro"],
}
# Encabezados a EXCLUIR al resolver un alias (evita falsos positivos).
EXCLUIR_FORM = {
    "nombres": ["nombre social", "nombre completo"],
    "curso": ["repite", "cursar", "ultimo nivel"],
}


def normtxt(s):
    s = str(s or "").strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s)


def cuerpo(v):
    if v is None:
        return ""
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return re.sub(r"[.\-\s]", "", s).upper()


def cuerpo_sin_dv(run):
    x = cuerpo(run)
    return x[:-1] if len(x) > 1 else x


def norm_curso(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def resolver_columnas(headers):
    """Mapea alias de campo -> índice de columna, por substring normalizado."""
    hn = [normtxt(h) for h in headers]
    idx = {}
    for campo, alias in ALIAS_FORM.items():
        excl = EXCLUIR_FORM.get(campo, [])
        for i, h in enumerate(hn):
            if any(a in h for a in alias) and not any(e in h for e in excl):
                idx[campo] = i
                break
    return idx


def leer_formulario(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Nomina de estudiantes"] if "Nomina de estudiantes" in wb.sheetnames else wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if len(rows) < 3:
        return {}, {}
    headers = rows[1]  # fila 2 = encabezados reales
    idx = resolver_columnas(headers)
    faltan = [c for c in ("run", "nombres", "curso") if c not in idx]
    if faltan:
        print(f"  ADVERTENCIA formulario: no se resolvieron columnas {faltan}. Revisar encabezados.")
    out = {}
    for r in rows[2:]:
        if "run" not in idx:
            break
        run_v = r[idx["run"]] if idx["run"] < len(r) else None
        k = cuerpo(run_v)
        if not k or k in out:
            continue
        def val(campo):
            i = idx.get(campo)
            return r[i] if (i is not None and i < len(r)) else None
        se_ret = normtxt(val("se_retira")).startswith("s")
        out[k] = {
            "nombre": f"{val('nombres') or ''} {val('ap_pat') or ''} {val('ap_mat') or ''}".strip(),
            "curso": str(val("curso")).strip() if val("curso") else "",
            "retirado": se_ret,
        }
    return out, idx


def leer_sige(path):
    doc = lh.fromstring(open(path, "rb").read())
    t = max(doc.xpath("//table"), key=lambda x: len(x.xpath(".//tr")))
    filas = t.xpath(".//tr")
    hdr = [normtxt(c.text_content()) for c in filas[0].xpath(".//td|.//th")]

    def col(nombre):
        for i, h in enumerate(hdr):
            if normtxt(nombre) in h:
                return i
        return None
    i_run = col("run"); i_desc = col("desc grado"); i_letra = col("letra curso")
    i_ret = col("fecha retiro"); i_nom = col("nombres")
    i_pat = col("apellido paterno"); i_mat = col("apellido materno")
    out = {}
    for tr in filas[1:]:
        c = [x.text_content().strip() for x in tr.xpath(".//td|.//th")]
        if i_run is None or i_run >= len(c) or not c[i_run]:
            continue
        k = cuerpo(c[i_run])
        if not k or k in out:
            continue
        retiro = c[i_ret].strip() if i_ret is not None and i_ret < len(c) else ""
        activo = retiro in ("", "1900-01-01", "01-01-1900", "1900-1-1")
        curso = f"{c[i_desc].strip() if i_desc is not None else ''} {c[i_letra].strip() if i_letra is not None else ''}".strip()
        out[k] = {
            "nombre": f"{c[i_nom] if i_nom is not None else ''} {c[i_pat] if i_pat is not None else ''} {c[i_mat] if i_mat is not None else ''}".strip(),
            "curso": curso,
            "retirado": not activo,
            "fecha_retiro": "" if activo else retiro,
        }
    return out


def leer_rgm(cur, id_establecimiento, anio):
    cur.execute(
        """SELECT e.run_ipe, e.nombres, e.apellido_paterno, m.curso, m.estado, m.id_matricula
           FROM matriculas.matricula m
           JOIN matriculas.estudiante e ON m.id_estudiante = e.id_estudiante
           WHERE m.id_establecimiento = %s AND m.anio_escolar = %s AND m.estado <> 'Anulada'""",
        (id_establecimiento, anio),
    )
    out = {}
    for run_ipe, nom, pat, curso, estado, id_mat in cur.fetchall():
        k = cuerpo_sin_dv(run_ipe)
        out.setdefault(k, {"nombre": f"{nom} {pat}".strip(), "curso": curso,
                           "estado": estado, "id_mat": id_mat})
    return out


def id_establecimiento_de_rbd(cur, rbd):
    cur.execute("SELECT id_establecimiento FROM matriculas.establecimiento WHERE rbd = %s", (str(rbd),))
    row = cur.fetchone()
    return row[0] if row else None


def main():
    ap = argparse.ArgumentParser(description="Diagnóstico de consolidación por RBD (solo lectura)")
    ap.add_argument("--rbd", required=True)
    ap.add_argument("--anio", type=int, default=2026)
    ap.add_argument("--sige", default=None)
    ap.add_argument("--form", default=None)
    ap.add_argument("--csv", action="store_true", help="Exporta CSVs de cada categoría")
    args = ap.parse_args()

    carpeta = RAIZ / "csv pruebas" / f"matricula_{args.anio}" / str(args.rbd)
    sige_path = Path(args.sige) if args.sige else next(iter(sorted(carpeta.glob("*.xls"))), None)
    form_path = Path(args.form) if args.form else next(iter(sorted(carpeta.glob("*.xlsx"))), None)

    print("=" * 68)
    print(f"DIAGNÓSTICO CONSOLIDACIÓN — RBD {args.rbd} — año {args.anio}")
    print("=" * 68)
    if not sige_path or not sige_path.exists():
        print(f"ERROR: no se encontró el .xls de SIGE en {carpeta}"); sys.exit(1)
    if not form_path or not form_path.exists():
        print(f"ERROR: no se encontró el .xlsx del formulario en {carpeta}"); sys.exit(1)
    print(f"SIGE : {sige_path.name}")
    print(f"Form : {form_path.name}\n")

    sige = leer_sige(str(sige_path))
    form, idx = leer_formulario(str(form_path))

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        id_est = id_establecimiento_de_rbd(cur, args.rbd)
        if id_est is None:
            print(f"ERROR: RBD {args.rbd} no existe en matriculas.establecimiento."); sys.exit(1)
        rgm = leer_rgm(cur, id_est, args.anio)
    finally:
        cur.close(); conn.close(); close_db_pool()

    S = set(sige) - EXCLUIR_CUERPOS
    F = set(form) - EXCLUIR_CUERPOS
    R = set(rgm) - EXCLUIR_CUERPOS

    print(f"Conteo: SIGE={len(S)}  Formulario={len(F)}  RGM={len(R)}  (id_establecimiento={id_est})")
    print(f"En las 3 fuentes: {len(S & F & R)}\n")

    cat = {
        "SOLO_EN_RGM": sorted(R - S),
        "SOLO_EN_SIGE": sorted(S - R),
        "SOLO_EN_FORMULARIO": sorted(F - S - R),
        "RETIRO_SIGE_NO_EN_RGM": sorted(k for k in (S & R)
                                        if sige[k]["retirado"]
                                        and rgm[k]["estado"] in ("Activa", "Promovido", "Repitente")),
        "CURSO_DISTINTO_SIGE_RGM": sorted(k for k in (S & R)
                                          if norm_curso(sige[k]["curso"]) != norm_curso(rgm[k]["curso"])),
    }

    for nombre, claves in cat.items():
        print(f"=== {nombre}: {len(claves)} ===")
        for k in claves[:40]:
            s = sige.get(k, {}); r = rgm.get(k, {}); f = form.get(k, {})
            detalle = (r.get("nombre") or s.get("nombre") or f.get("nombre") or "?")
            extra = ""
            if nombre == "CURSO_DISTINTO_SIGE_RGM":
                extra = f" | SIGE='{s.get('curso')}' FORM='{f.get('curso','-')}' RGM='{r.get('curso')}'"
            elif nombre == "RETIRO_SIGE_NO_EN_RGM":
                extra = f" | SIGE retiro {s.get('fecha_retiro')} / RGM {r.get('estado')} | ¿Excel retiro? {'SI' if f.get('retirado') else 'no'}"
            print(f"   {k} | {detalle}{extra}")
        if len(claves) > 40:
            print(f"   ... (+{len(claves)-40} más)")
        print()

    if args.csv:
        import csv as _csv
        out_dir = AQUI / "salida" / f"diag_{args.rbd}"
        out_dir.mkdir(parents=True, exist_ok=True)
        for nombre, claves in cat.items():
            with open(out_dir / f"{nombre}.csv", "w", encoding="utf-8-sig", newline="") as fh:
                w = _csv.writer(fh)
                w.writerow(["cuerpo_rut", "nombre", "sige_curso", "form_curso", "rgm_curso",
                            "sige_retiro", "rgm_estado", "excel_retiro"])
                for k in claves:
                    s = sige.get(k, {}); r = rgm.get(k, {}); f = form.get(k, {})
                    w.writerow([k, r.get("nombre") or s.get("nombre") or f.get("nombre") or "",
                                s.get("curso", ""), f.get("curso", ""), r.get("curso", ""),
                                s.get("fecha_retiro", ""), r.get("estado", ""),
                                "SI" if f.get("retirado") else "no"])
        print(f"CSVs exportados en: {out_dir}")

    print("Hecho (solo lectura; no se modificó la base).")


if __name__ == "__main__":
    main()
    sys.exit(0)
