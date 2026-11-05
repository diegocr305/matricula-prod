# -*- coding: utf-8 -*-
"""
HERRAMIENTA 8 — INFORME de discrepancias SIGE vs Registro General de Matrícula 2026.

Genera, en la carpeta `produccion/salida/discrepancias_1520/`, dos planillas Excel
para llevar a la escuela y que ELLOS decidan (la escuela manda sobre sus datos):

  LISTA A — "En el Registro General de Matrícula (formulario) pero NO en SIGE"
      Alumnos que la escuela registró en su formulario pero que NO aparecen en
      SIGE. Como SIGE es la fuente oficial, hay que verificar: si son matrículas
      reales, deben ingresarse en SIGE; si fue error/retiro, confirmarlo.

  LISTA B — "En SIGE pero NO en el Registro General de Matrícula (formulario)"
      Alumnos que SÍ están en SIGE (y por tanto quedaron matriculados en el
      sistema), pero que la escuela no incluyó en su formulario. Les faltan datos
      de apoderado y ficha de salud; la escuela debe completarlos en el sistema.

SOLO LECTURA de los dos archivos fuente. No toca la base de datos.

Uso (desde backend/):
    python produccion/08_informe_discrepancias_2026.py
"""
import re
import sys
from pathlib import Path

import openpyxl
import pandas as pd
from lxml import html as lh

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
SIGE = RAIZ / "csv pruebas" / "nomina_excel (3).xls"
EXCEL = (RAIZ / "csv pruebas" /
         "REGISTRO GENERAL DE MATRÍCULA 2026 - 1520 - "
         "LICEO BICENTENARIO MARITIMO DE VALPARAISO.xlsx")
SALIDA = AQUI / "salida" / "discrepancias_1520"

PRACTICANTES = {"208455176", "21749866K"}


def limpiar(v):
    if v is None:
        return ""
    try:
        if isinstance(v, float) and pd.isna(v):
            return ""
    except Exception:
        pass
    return str(v).strip()


def norm(cuerpo, dv=""):
    """CLAVE de cruce = CUERPO del RUT (sin DV). El DV no viene confiable entre
    fuentes y los extranjeros traen IPE/RUN distintos; cruzar por cuerpo evita
    falsas discrepancias."""
    c = re.sub(r"[.\-\s]", "", limpiar(cuerpo)).upper()
    return c[:-2] if c.endswith(".0") else c


def fmt_rut(cuerpo, dv=""):
    """Muestra el RUT legible con su DV cuando lo hay."""
    d = re.sub(r"[.\-\s]", "", limpiar(dv)).upper()
    return f"{cuerpo}-{d}" if d else cuerpo


def leer_sige():
    doc = lh.fromstring(open(SIGE, "rb").read())
    filas = max(doc.xpath("//table"), key=lambda t: len(t.xpath(".//tr"))).xpath(".//tr")
    out = {}
    for tr in filas[1:]:
        c = [x.text_content().strip() for x in tr.xpath(".//td|.//th")]
        if len(c) < 22 or not c[6]:
            continue
        clave = norm(c[6])
        retiro = c[21].strip()
        activo = retiro in ("", "1900-01-01", "01-01-1900")
        out[clave] = {
            "RUN": fmt_rut(c[6], c[7]),
            "Nombre": f"{c[9]} {c[10]} {c[11]}".strip(),
            "Curso (SIGE)": f"{c[4]} {c[5]}".strip(),
            "Estado (SIGE)": "Activo" if activo else "Retirado",
            "Fecha retiro (SIGE)": "" if activo else retiro,
            "Dirección (SIGE)": c[12].strip(),
            "Comuna (SIGE)": c[13].strip(),
            "Fecha nac. (SIGE)": c[18].strip(),
        }
    return out


def leer_formulario():
    """Lectura con openpyxl read_only (pd.read_excel se cuelga con este .xlsx)."""
    wb = openpyxl.load_workbook(EXCEL, read_only=True, data_only=True)
    ws = wb["Nomina de estudiantes"]
    out = {}
    for fila in ws.iter_rows(min_row=2, values_only=True):
        if len(fila) < 54:
            continue
        clave = norm(fila[4])
        if not clave or len(clave) < 2 or clave in out:
            continue
        se_ret = limpiar(fila[53]).lower().startswith("s")
        out[clave] = {
            "RUN": fmt_rut(fila[4], fila[5]),
            "Nombre": f"{limpiar(fila[1])} {limpiar(fila[2])} {limpiar(fila[3])}".strip(),
            "Curso (formulario)": limpiar(fila[50]),
            "Estado (formulario)": "Retiro" if se_ret else "Activa",
            "Apoderado titular (formulario)": limpiar(fila[37]),
            "Tel. apoderado (formulario)": limpiar(fila[40]),
        }
    wb.close()
    return out


def main():
    print("Leyendo fuentes...", flush=True)
    sige = leer_sige()
    form = leer_formulario()
    print(f"  SIGE: {len(sige)} | Formulario: {len(form)}", flush=True)

    solo_form = sorted((set(form) - set(sige)) - PRACTICANTES)   # Lista A
    solo_sige = sorted((set(sige) - set(form)) - PRACTICANTES)   # Lista B

    SALIDA.mkdir(parents=True, exist_ok=True)

    # LISTA A
    df_a = pd.DataFrame([form[r] for r in solo_form])
    ruta_a = SALIDA / "Lista_A__en_formulario_no_en_SIGE.xlsx"
    df_a.to_excel(ruta_a, index=False)

    # LISTA B
    df_b = pd.DataFrame([sige[r] for r in solo_sige])
    ruta_b = SALIDA / "Lista_B__en_SIGE_no_en_formulario.xlsx"
    df_b.to_excel(ruta_b, index=False)

    print(f"\n=== RESULTADO ===")
    print(f"LISTA A (en formulario, NO en SIGE): {len(solo_form)}  -> {ruta_a.name}")
    print(f"LISTA B (en SIGE, NO en formulario): {len(solo_sige)}  -> {ruta_b.name}")
    print(f"\nArchivos en: {SALIDA}")


if __name__ == "__main__":
    main()
    sys.exit(0)
