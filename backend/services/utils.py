# services/utils.py

def determinar_nivel_backend(curso_str: str, cod_tipo: int) -> str:
    texto = str(curso_str).lower() if curso_str else ""
    
    # 1. PARVULARIA: Prioridad absoluta para palabras clave de educación inicial
    palabras_parvularia = ['kinder', 'kínder', 'parvularia', 'sala cuna', 'nivel medio', 'heterogéneo', 'heterogeneo', 'transición']
    if any(palabra in texto for palabra in palabras_parvularia) or cod_tipo == 10: 
        return 'Educación Parvularia'
    
    # 2. BÁSICA
    if 'básico' in texto or 'basico' in texto or (cod_tipo and 110 <= cod_tipo <= 119): 
        return 'Educación Básica'
    
    # 3. MEDIA: (Solo caerá aquí si no es "Nivel Medio" de parvularia)
    if 'medio' in texto or 'media' in texto or (cod_tipo and cod_tipo >= 300): 
        return 'Educación Media'
    
    return 'Educación Básica'


import re


def normalizar_rut(rut) -> str:
    """Normaliza un RUT/pasaporte al formato canónico del sistema.

    - Quita puntos, guiones y espacios.
    - Pasa el dígito verificador a mayúscula (para el caso 'K').
    - Devuelve el cuerpo con guion antes del DV: '12345678-9'.

    No importa cómo lo escriba el funcionario ('12.345.678-9', '123456789',
    '12345678-9', con espacios): siempre queda '12345678-9'. Así el SELECT por
    rut_pasaporte encuentra al apoderado existente y no se crean duplicados.

    Casos borde:
    - Vacío / None -> "".
    - Menos de 2 caracteres tras limpiar -> se devuelve tal cual (no se puede
      separar cuerpo/DV de forma segura).
    """
    if not rut:
        return ""
    limpio = re.sub(r"[.\-\s]", "", str(rut)).upper()
    if len(limpio) < 2:
        return limpio
    cuerpo, dv = limpio[:-1], limpio[-1]
    return f"{cuerpo}-{dv}"
