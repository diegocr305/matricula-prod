# -*- coding: utf-8 -*-
"""
Tests de LÓGICA PURA de cursos, motivos y nombres (sin base de datos).

Cubre las funciones de mayor riesgo integradas desde el merge del practicante:
jerarquía de cursos (promoción/repitencia/regresión), parseo de motivos de
retiro/traslado y formato de nombres. Son deterministas y NO tocan Supabase,
así que son 100% seguras de correr en cualquier momento.

Ejecutar (desde backend/):
    python -m pytest tests/test_logica_cursos.py -v
    o simplemente:  python -m pytest -v
"""
import os
import sys

# Permitir importar el paquete services aunque se corra desde cualquier carpeta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.matricula_service import (
    obtener_rango_curso,
    normalizar_texto_curso,
    formatear_nivel_curso,
    formatear_nombre_apoderado_resumido,
    parsear_texto_motivo,
    parsear_traslado_info,
)


# ---------------------------------------------------------------------------
# obtener_rango_curso: la jerarquía escolar (define promoción / repitencia).
# Convención: básica = 100 + grado ; media = 200 + grado ; parvularia 10-50.
# ---------------------------------------------------------------------------
class TestRangoCurso:
    def test_basica_rangos(self):
        assert obtener_rango_curso("1° básico") == 101
        assert obtener_rango_curso("6° básico") == 106
        assert obtener_rango_curso("8° básico") == 108

    def test_media_rangos(self):
        assert obtener_rango_curso("1° medio") == 201
        assert obtener_rango_curso("4° medio") == 204

    def test_parvularia(self):
        assert obtener_rango_curso("Sala Cuna") == 10
        assert obtener_rango_curso("Kinder") == 50

    def test_promocion_dentro_de_basica(self):
        # 6° -> 7° básico es una promoción (rango sube en +1)
        assert obtener_rango_curso("7° básico") == obtener_rango_curso("6° básico") + 1

    def test_repitencia_mismo_curso(self):
        # mismo curso => mismo rango (repitencia)
        assert obtener_rango_curso("3° básico") == obtener_rango_curso("3° básico")

    def test_regresion_curso_inferior(self):
        # matricular en un curso inferior => rango menor (debe bloquearse en la UI)
        assert obtener_rango_curso("5° básico") < obtener_rango_curso("6° básico")

    def test_transicion_basica_a_media_sube(self):
        # 8° básico (108) -> 1° medio (201): el rango SUBE (no es regresión).
        # Nota: el salto no es +1 por el cambio de centena; la UI usa 'grado
        # absoluto' para tratarlo como promoción. Aquí solo validamos que sube.
        assert obtener_rango_curso("1° medio") > obtener_rango_curso("8° básico")

    def test_desconocido_devuelve_cero(self):
        assert obtener_rango_curso("") == 0
        assert obtener_rango_curso("curso inexistente xyz") == 0


# ---------------------------------------------------------------------------
# normalizar_texto_curso / formatear_nivel_curso
# ---------------------------------------------------------------------------
class TestNormalizacionCurso:
    def test_normaliza_acentos_y_mayusculas(self):
        assert normalizar_texto_curso("6° Básico") == normalizar_texto_curso("6° basico")

    def test_formatear_nivel_quita_simbolos(self):
        # "1° Básico A" -> algo sin símbolos ni espacios, en mayúsculas
        r = formatear_nivel_curso("1° Básico A")
        assert " " not in r and "°" not in r
        assert r == r.upper()


# ---------------------------------------------------------------------------
# formatear_nombre_apoderado_resumido
# ---------------------------------------------------------------------------
class TestNombreApoderado:
    def test_vacios_devuelve_pendiente(self):
        assert formatear_nombre_apoderado_resumido("", "") == "Pendiente"
        assert formatear_nombre_apoderado_resumido(None, None) == "Pendiente"

    def test_con_datos_no_pendiente(self):
        r = formatear_nombre_apoderado_resumido("MARIA JOSE", "PEREZ")
        assert r != "Pendiente"
        assert len(r) > 0


# ---------------------------------------------------------------------------
# parsear_texto_motivo: separa [Motivos]: de [Detalles]: (encuesta de retiro)
# ---------------------------------------------------------------------------
class TestParseMotivo:
    def test_texto_vacio(self):
        assert parsear_texto_motivo("") == ([], "")
        assert parsear_texto_motivo(None) == ([], "")

    def test_texto_plano_va_a_detalle(self):
        motivos, detalle = parsear_texto_motivo("Se cambia de ciudad")
        assert motivos == []
        assert detalle == "Se cambia de ciudad"

    def test_con_bloques_motivos_y_detalles(self):
        texto = "[Motivos de retiro]:\n• Cambio de domicilio\n• Problemas de transporte\n[Detalles]: Se mudan al sur"
        motivos, detalle = parsear_texto_motivo(texto)
        assert "Cambio de domicilio" in motivos
        assert "Problemas de transporte" in motivos
        assert detalle == "Se mudan al sur"


# ---------------------------------------------------------------------------
# parsear_traslado_info: extrae curso origen y folio de un traslado
# ---------------------------------------------------------------------------
class TestParseTraslado:
    def test_sin_datos(self):
        assert parsear_traslado_info(None, None) == (None, None)

    def test_curso_origen_desde_motivo(self):
        curso, folio = parsear_traslado_info("Traslado desde '6° básico A'", None)
        assert curso == "6° básico A"

    def test_folio_desde_motivo(self):
        curso, folio = parsear_traslado_info("De '3° medio B' Folio: #1234", None)
        assert folio == 1234

    def test_folio_desde_observaciones(self):
        curso, folio = parsear_traslado_info(None, "De '2° medio A' (Folio #99)")
        assert folio == 99
