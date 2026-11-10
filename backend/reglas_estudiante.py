"""
Reglas parametrizadas de datos del estudiante.

FUENTE ÚNICA en el backend. Espejo en el frontend:
frontend-matriculas/src/config/reglasEstudiante.ts (mantener ambos iguales).

Correo personal del estudiante (trazabilidad de egresados):
  - 4° medio: OBLIGATORIO.
  - 3° medio: OPCIONAL por ahora (pendiente de decisión funcional; para activarlo
    basta cambiar su valor a OBLIGATORIO aquí y en el espejo del frontend).
  - Resto de niveles: no se exige.
El formato se valida SIEMPRE que se informe un correo, en cualquier nivel.
"""
import re

from fastapi import HTTPException

OBLIGATORIO = "obligatorio"
OPCIONAL = "opcional"

# Clave: nivel en el formato de formatear_nivel_curso ("4MEDIO", "3MEDIO", ...).
CORREO_PERSONAL_POR_NIVEL = {
    "4MEDIO": OBLIGATORIO,
    "3MEDIO": OPCIONAL,
}

# Formato práctico de correo: algo@dominio.tld, sin espacios.
_RE_CORREO = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def nivel_desde_curso(curso) -> str:
    """'4° medio A' -> '4MEDIO'. Misma lógica que formatear_nivel_curso."""
    texto = str(curso or "").upper()
    m = re.search(r"\d+", texto)
    numero = m.group(0) if m else ""
    if "MEDIO" in texto or "MEDIA" in texto:
        return f"{numero}MEDIO"
    if "BÁSICO" in texto or "BASICO" in texto:
        return f"{numero}BASICO"
    return re.sub(r"[^A-Z0-9]", "", texto)


def correo_personal_es_obligatorio(curso) -> bool:
    return CORREO_PERSONAL_POR_NIVEL.get(nivel_desde_curso(curso)) == OBLIGATORIO


def es_correo_valido(correo) -> bool:
    return bool(correo) and bool(_RE_CORREO.match(str(correo).strip()))


def validar_formato_correo(correo, etiqueta: str) -> None:
    """422 si se informó un correo con formato inválido. Vacío es válido."""
    if correo is None or str(correo).strip() == "":
        return
    if not es_correo_valido(correo):
        raise HTTPException(status_code=422, detail=f"{etiqueta} no tiene un formato válido: '{correo}'.")
