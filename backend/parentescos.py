"""
Catálogo único de parentescos del apoderado (titular y suplente).

FUENTE ÚNICA en el backend. Su espejo en el frontend es
frontend-matriculas/src/config/parentescos.ts: ambos DEBEN mantenerse iguales.

Regla de validación (la misma en frontend y backend):
  - Vacío / None            -> válido (el parentesco no es obligatorio hoy; los
                               llamadores aplican sus valores por defecto).
  - Valor del catálogo      -> válido.
  - Valor ya guardado       -> válido. Los datos históricos (cargas masivas,
                               texto libre) no coinciden con el catálogo; se
                               aceptan SOLO si son idénticos al valor que ya
                               tiene esa ficha, para no obligar a reescribirlos
                               ni sobrescribirlos automáticamente.
  - Cualquier otro valor    -> inválido.
"""
from fastapi import HTTPException

PARENTESCOS = (
    "Madre",
    "Padre",
    "Abuelo Paterno",
    "Abuela Paterna",
    "Abuelo Materno",
    "Abuela Materna",
    "Tutor Legal Designado",
    "Otro",
)


def es_parentesco_del_catalogo(valor) -> bool:
    """Coincidencia exacta con el catálogo (sin normalizar, para no ocultar variantes históricas)."""
    return valor in PARENTESCOS


def validar_parentesco(valor, legados_aceptados=(), etiqueta: str = "Parentesco") -> None:
    """Lanza HTTPException 422 si `valor` no es vacío, ni del catálogo, ni un valor
    histórico ya guardado en la ficha (`legados_aceptados`)."""
    if valor is None or str(valor).strip() == "":
        return
    if es_parentesco_del_catalogo(valor):
        return
    if valor in tuple(v for v in legados_aceptados if v):
        return
    raise HTTPException(
        status_code=422,
        detail=f"{etiqueta} no válido: '{valor}'. Seleccione una de las opciones del catálogo: "
               f"{', '.join(PARENTESCOS)}.",
    )
