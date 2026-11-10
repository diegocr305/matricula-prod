# services/libro_matricula_service.py
"""
Libro / Registro General de Matrícula — exportación oficial (PDF y Excel).

Contenido mínimo según Resolución Exenta N° 0030/2021 (Superintendencia de
Educación), punto 5.2 "Contenido mínimo del Registro de Matrícula":
  - Número correlativo de matrícula.
  - RUN del alumno (o IPE si no tiene RUN).
  - Identificación completa: nombres, apellido paterno y materno.
  - Sexo (considerando la Ley N° 21.120).
  - Fecha de nacimiento (día, mes y año).
  - Nivel que cursa.
  - Curso.
  - Local escolar (cuando existe más de uno: principal o anexo).
  - Fecha de matrícula.
  - Domicilio del alumno.
  - Identificación completa de padres/madres/apoderados/tutores (nombres y apellidos).
  - Datos de contacto de los apoderados: domicilio, teléfono y correo (si lo hubiere).
  - En caso de retiro: fecha y motivo.
  - Observaciones (cambio de apoderado, de curso, de nombre social, etc.).

Reglas:
  - NO se generan datos ficticios: si un dato no está registrado, la celda queda vacía.
  - NO incluye datos de salud (minimización: no son parte del contenido mínimo).
  - Las respuestas del cuestionario confidencial de retiro NUNCA se exportan.
  - Las matrículas 'Anuladas' (errores administrativos) no forman parte del libro.
"""
import io
import re
from datetime import date, datetime

from fastapi import HTTPException
from database import get_db_connection

# Tope de filas para el PDF (un PDF de toda la red sería inmanejable).
MAX_FILAS_PDF = 15000

# (clave, etiqueta) en el orden oficial del punto 5.2.
LIBRO_COLUMNAS = [
    ("correlativo", "N° Correlativo"),
    ("run", "RUN / IPE"),
    ("apellido_paterno", "Apellido Paterno"),
    ("apellido_materno", "Apellido Materno"),
    ("nombres", "Nombres"),
    ("sexo", "Sexo"),
    ("fecha_nacimiento", "Fecha de Nacimiento"),
    ("nivel", "Nivel"),
    ("curso", "Curso"),
    ("local_escolar", "Local Escolar"),
    ("fecha_matricula", "Fecha de Matrícula"),
    ("domicilio", "Domicilio del Alumno"),
    ("apoderado", "Apoderado Titular (Nombre y Apellidos)"),
    ("apoderado_parentesco", "Parentesco Titular"),
    ("apoderado_domicilio", "Domicilio Apoderado Titular"),
    ("apoderado_telefono", "Teléfono Apoderado Titular"),
    ("apoderado_correo", "Correo Apoderado Titular"),
    ("suplente", "Apoderado Suplente (Nombre y Apellidos)"),
    ("suplente_parentesco", "Parentesco Suplente"),
    ("suplente_domicilio", "Domicilio Apoderado Suplente"),
    ("suplente_telefono", "Teléfono Apoderado Suplente"),
    ("suplente_correo", "Correo Apoderado Suplente"),
    ("fecha_retiro", "Fecha de Retiro"),
    ("motivo_retiro", "Motivo de Retiro"),
    ("observaciones", "Observaciones"),
]

_NOTA_RETIRO_CONFIDENCIAL = "Retiro formalizado mediante cuestionario confidencial de apoderado."


def _fecha(valor) -> str:
    """dd-mm-aaaa, o vacío si no hay dato."""
    if not valor:
        return ""
    if isinstance(valor, (date, datetime)):
        return valor.strftime("%d-%m-%Y")
    texto = str(valor)
    try:
        return datetime.strptime(texto[:10], "%Y-%m-%d").strftime("%d-%m-%Y")
    except ValueError:
        return texto


def _texto(valor) -> str:
    return " ".join(str(valor).split()) if valor not in (None, "") else ""


def _nombre(*partes) -> str:
    return " ".join(p for p in (_texto(x) for x in partes) if p)


def _observaciones_publicas(obs) -> str:
    """Las respuestas del cuestionario de retiro son confidenciales: si un registro
    antiguo las tiene dentro de 'observaciones', se reemplazan por una nota neutra."""
    texto = _texto(obs)
    if "[Motivos" in texto or "[Detalles" in texto:
        return _NOTA_RETIRO_CONFIDENCIAL
    return texto


def _local_escolar(nombre_est, tipo_local) -> str:
    tipo = _texto(tipo_local)
    return f"{_texto(nombre_est)} ({tipo})" if tipo else _texto(nombre_est)


def obtener_filas_libro(id_establecimiento=None, anio=None, curso=None, nivel=None,
                        modalidad=None, incluir_pendientes=False) -> list:
    """Filas del libro con los filtros dados (ya validados por el router)."""
    query = """
        SELECT m.numero_correlativo, e.run_ipe, e.apellido_paterno, e.apellido_materno, e.nombres,
               e.sexo, e.fecha_nacimiento, m.nivel_ensenanza, m.curso, est.nombre, est.tipo_local,
               m.fecha_matricula, e.domicilio,
               ap.nombres, ap.apellido_paterno, ap.apellido_materno, ap.relacion_estudiante,
               ap.domicilio, ap.telefono, ap.correo_electronico,
               asup.nombres, asup.apellido_paterno, asup.apellido_materno, asup.relacion_estudiante,
               asup.domicilio, asup.telefono, asup.correo_electronico,
               m.fecha_retiro, m.motivo_retiro, m.observaciones,
               est.rbd, m.anio_escolar
        FROM matricula m
        INNER JOIN estudiante e        ON m.id_estudiante = e.id_estudiante
        INNER JOIN establecimiento est ON m.id_establecimiento = est.id_establecimiento
        LEFT JOIN apoderado ap         ON e.id_apoderado_principal = ap.id_apoderado
        LEFT JOIN apoderado asup       ON e.id_apoderado_suplente = asup.id_apoderado
        WHERE m.estado <> 'Anulada'
    """
    params = []
    if id_establecimiento:
        query += " AND m.id_establecimiento = %s"
        params.append(int(id_establecimiento))
    if anio:
        query += " AND m.anio_escolar = %s"
        params.append(int(anio))
    if curso and str(curso).strip():
        query += " AND m.curso = %s"
        params.append(str(curso).strip())
    if nivel and str(nivel).strip():
        query += " AND m.nivel_ensenanza = %s"
        params.append(str(nivel).strip())
    if modalidad:
        query += " AND m.cod_tipo_ensenanza = %s"
        params.append(int(modalidad))
    if not incluir_pendientes:
        # Pre-matrículas aún no confirmadas/firmadas no son matrícula definitiva.
        query += " AND (m.estado_renovacion IS NULL OR m.estado_renovacion NOT IN ('Por renovar', 'Pendiente firma'))"
    query += " ORDER BY est.nombre, m.anio_escolar, m.curso, m.numero_correlativo NULLS LAST, e.apellido_paterno"

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(query, tuple(params))
        filas = []
        for r in cur.fetchall():
            motivo = _texto(r[28])
            filas.append({
                "correlativo": r[0] if r[0] is not None else "",
                "run": _texto(r[1]),
                "apellido_paterno": _texto(r[2]),
                "apellido_materno": _texto(r[3]),
                "nombres": _texto(r[4]),
                "sexo": _texto(r[5]),
                "fecha_nacimiento": _fecha(r[6]),
                "nivel": _texto(r[7]),
                "curso": _texto(r[8]),
                "local_escolar": _local_escolar(r[9], r[10]),
                "fecha_matricula": _fecha(r[11]),
                "domicilio": _texto(r[12]),
                "apoderado": _nombre(r[13], r[14], r[15]),
                "apoderado_parentesco": _texto(r[16]),
                "apoderado_domicilio": _texto(r[17]),
                "apoderado_telefono": _texto(r[18]),
                "apoderado_correo": _texto(r[19]),
                "suplente": _nombre(r[20], r[21], r[22]),
                "suplente_parentesco": _texto(r[23]),
                "suplente_domicilio": _texto(r[24]),
                "suplente_telefono": _texto(r[25]),
                "suplente_correo": _texto(r[26]),
                "fecha_retiro": _fecha(r[27]),
                "motivo_retiro": motivo,
                "observaciones": _observaciones_publicas(r[29]),
                "_rbd": _texto(r[30]),
                "_anio": r[31],
                "_establecimiento": _texto(r[9]),
            })
        return filas
    finally:
        cur.close()
        conn.close()


def texto_establecimiento(id_establecimiento) -> str:
    if not id_establecimiento:
        return "Todos los establecimientos de la Red SLEP Valparaíso"
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT nombre, rbd FROM establecimiento WHERE id_establecimiento = %s", (int(id_establecimiento),))
        r = cur.fetchone()
        return f"{r[0]} (RBD {r[1]})" if r else f"Establecimiento #{id_establecimiento}"
    finally:
        cur.close()
        conn.close()


def describir_filtros(meta: dict) -> str:
    partes = []
    for clave, etiqueta in (("anio", "Año"), ("nivel", "Nivel"), ("modalidad", "Modalidad/plan"), ("curso", "Curso")):
        if meta.get(clave):
            partes.append(f"{etiqueta}: {meta[clave]}")
    partes.append("Incluye pre-matrículas pendientes" if meta.get("incluir_pendientes") else "Solo matrículas confirmadas")
    return " · ".join(partes)


def generar_excel_libro(filas: list, meta: dict) -> io.BytesIO:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Libro de Matrícula"

    ws.append(["Registro General de Matrícula — Libro de Matrícula"])
    ws.append([f"Establecimiento: {meta.get('establecimiento_texto', '')}"])
    ws.append([f"Filtros: {describir_filtros(meta)}"])
    ws.append([f"Emitido: {meta.get('emitido', '')} por {meta.get('usuario', '')} · Total registros: {len(filas)}"])
    ws.append(["Contenido mínimo según Resolución Exenta N° 0030/2021, punto 5.2."])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append([])

    fila_enc = ws.max_row + 1
    ws.append([etq for _, etq in LIBRO_COLUMNAS])
    relleno = PatternFill("solid", fgColor="25306B")
    for col in range(1, len(LIBRO_COLUMNAS) + 1):
        celda = ws.cell(row=fila_enc, column=col)
        celda.font = Font(bold=True, color="FFFFFF", size=10)
        celda.fill = relleno
        celda.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col)].width = 18
    ws.row_dimensions[fila_enc].height = 36
    ws.freeze_panes = ws.cell(row=fila_enc + 1, column=1)

    for f in filas:
        ws.append([f[clave] for clave, _ in LIBRO_COLUMNAS])

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def generar_pdf_libro(filas: list, meta: dict) -> io.BytesIO:
    if len(filas) > MAX_FILAS_PDF:
        raise HTTPException(
            status_code=413,
            detail=f"El libro tiene {len(filas)} registros; el PDF admite hasta {MAX_FILAS_PDF}. "
                   "Filtre por establecimiento, año o curso, o descargue en Excel.",
        )

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import landscape, legal
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(legal),
        leftMargin=8 * mm, rightMargin=8 * mm, topMargin=10 * mm, bottomMargin=12 * mm,
        title="Libro de Matrícula", author="SLEP Valparaíso",
    )
    st_celda = ParagraphStyle("celda", fontName="Helvetica", fontSize=5.6, leading=6.6)
    st_enc = ParagraphStyle("enc", fontName="Helvetica-Bold", fontSize=5.8, leading=6.8, textColor=colors.white)
    st_tit = ParagraphStyle("tit", fontName="Helvetica-Bold", fontSize=12, leading=15)
    st_sub = ParagraphStyle("sub", fontName="Helvetica", fontSize=7.5, leading=10)

    def esc(t):
        return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    datos = [[Paragraph(esc(etq), st_enc) for _, etq in LIBRO_COLUMNAS]]
    for f in filas:
        datos.append([Paragraph(esc(f[clave]), st_celda) for clave, _ in LIBRO_COLUMNAS])

    # Anchos relativos (suman ~ el ancho útil de oficio apaisado).
    pesos = [3, 5, 5, 5, 6, 3, 4, 5, 4.5, 6, 4, 8, 7, 4, 7, 4.5, 6.5, 7, 4, 7, 4.5, 6.5, 4, 6, 9]
    ancho_util = doc.width
    anchos = [ancho_util * p / sum(pesos) for p in pesos]

    tabla = LongTable(datos, colWidths=anchos, repeatRows=1)
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#25306B")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0B7C3")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F4F8")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
        ("TOPPADDING", (0, 0), (-1, -1), 1.2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
    ]))

    historia = [
        Paragraph("Registro General de Matrícula — Libro de Matrícula", st_tit),
        Paragraph(esc(f"Establecimiento: {meta.get('establecimiento_texto', '')}"), st_sub),
        Paragraph(esc(f"Filtros: {describir_filtros(meta)}"), st_sub),
        Paragraph(esc(f"Emitido: {meta.get('emitido', '')} por {meta.get('usuario', '')} · Total registros: {len(filas)}"), st_sub),
        Spacer(1, 4 * mm),
        tabla,
    ]

    def pie(canvas, documento):
        canvas.saveState()
        canvas.setFont("Helvetica", 6.5)
        canvas.drawString(8 * mm, 6 * mm, "SLEP Valparaíso · Contenido mínimo según Resolución Exenta N° 0030/2021, punto 5.2.")
        canvas.drawRightString(documento.pagesize[0] - 8 * mm, 6 * mm, f"Página {documento.page}")
        canvas.restoreState()

    doc.build(historia, onFirstPage=pie, onLaterPages=pie)
    buffer.seek(0)
    return buffer
