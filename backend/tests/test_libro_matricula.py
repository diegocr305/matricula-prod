"""Pruebas del Libro de Matrícula sin base de datos (filas sintéticas)."""
import io
from datetime import date

import openpyxl
import pytest
from fastapi import HTTPException

from services import libro_matricula_service as libro


def _fila(**kw):
    base = {clave: "" for clave, _ in libro.LIBRO_COLUMNAS}
    base.update(kw)
    return base


def test_columnas_cubren_el_contenido_minimo_5_2():
    claves = [c for c, _ in libro.LIBRO_COLUMNAS]
    for requerida in ["correlativo", "run", "apellido_paterno", "apellido_materno", "nombres", "sexo",
                      "fecha_nacimiento", "nivel", "curso", "local_escolar", "fecha_matricula", "domicilio",
                      "apoderado", "apoderado_domicilio", "apoderado_telefono", "apoderado_correo",
                      "fecha_retiro", "motivo_retiro", "observaciones"]:
        assert requerida in claves


def test_no_incluye_datos_de_salud():
    etiquetas = " ".join(e.lower() for _, e in libro.LIBRO_COLUMNAS)
    for palabra in ["salud", "fonasa", "alergia", "diagnóstico", "medicamento", "nee"]:
        assert palabra not in etiquetas


def test_formato_de_fechas_dia_mes_anio():
    assert libro._fecha(date(2012, 3, 9)) == "09-03-2012"
    assert libro._fecha("2026-03-01") == "01-03-2026"
    assert libro._fecha(None) == ""


def test_respuestas_confidenciales_de_retiro_no_se_exportan():
    texto = "[Motivos de Retiro]:\n• Cambio de domicilio\n[Detalles]: problemas familiares"
    assert libro._observaciones_publicas(texto) == libro._NOTA_RETIRO_CONFIDENCIAL
    assert libro._observaciones_publicas("Cambio de curso a 2° B") == "Cambio de curso a 2° B"


def test_local_escolar_indica_tipo_si_existe():
    assert libro._local_escolar("Liceo X", "Principal") == "Liceo X (Principal)"
    assert libro._local_escolar("Liceo X", None) == "Liceo X"


def test_excel_tiene_encabezados_y_no_inventa_datos():
    filas = [_fila(correlativo=1, run="11111111-1", nombres="ANA", curso="1° medio A")]
    buf = libro.generar_excel_libro(filas, {"establecimiento_texto": "Liceo X (RBD 1520)", "anio": 2027})
    ws = openpyxl.load_workbook(io.BytesIO(buf.getvalue())).active
    filas_ws = list(ws.iter_rows(values_only=True))
    enc_idx = next(i for i, r in enumerate(filas_ws) if r and r[0] == "N° Correlativo")
    assert list(filas_ws[enc_idx]) == [e for _, e in libro.LIBRO_COLUMNAS]
    dato = filas_ws[enc_idx + 1]
    assert dato[0] == 1 and dato[1] == "11111111-1"
    # Campos sin dato quedan vacíos (openpyxl los devuelve como None), nunca con texto inventado.
    assert all(v in (None, "") for v in dato[2:4])


def test_pdf_se_genera():
    filas = [_fila(correlativo=i, run=f"{i}-K", nombres="ALUMNO") for i in range(1, 60)]
    buf = libro.generar_pdf_libro(filas, {"establecimiento_texto": "Liceo X", "anio": 2027})
    assert buf.getvalue().startswith(b"%PDF")


def test_pdf_demasiado_grande_pide_filtrar(monkeypatch):
    monkeypatch.setattr(libro, "MAX_FILAS_PDF", 3)
    with pytest.raises(HTTPException) as e:
        libro.generar_pdf_libro([_fila()] * 4, {})
    assert e.value.status_code == 413
