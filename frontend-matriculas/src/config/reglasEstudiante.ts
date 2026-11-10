/**
 * Reglas parametrizadas de datos del estudiante.
 *
 * ESPEJO de backend/reglas_estudiante.py: mantener ambos iguales.
 *
 * Correo personal del estudiante (trazabilidad de egresados):
 *  - 4° medio: obligatorio.
 *  - 3° medio: opcional por ahora (pendiente de decisión funcional; para activarlo
 *    cambiar su valor a 'obligatorio' aquí y en el backend).
 *  - Resto de niveles: no se exige.
 * El formato se valida siempre que se informe un correo.
 */
type Obligatoriedad = 'obligatorio' | 'opcional';

export const CORREO_PERSONAL_POR_NIVEL: Record<string, Obligatoriedad> = {
  '4MEDIO': 'obligatorio',
  '3MEDIO': 'opcional',
};

/** '4° medio A' -> '4MEDIO'. Misma lógica que el backend (formatear_nivel_curso). */
export function nivelDesdeCurso(curso: string | null | undefined): string {
  const texto = (curso || '').toUpperCase();
  const numero = texto.match(/\d+/)?.[0] || '';
  if (texto.includes('MEDIO') || texto.includes('MEDIA')) return `${numero}MEDIO`;
  if (texto.includes('BÁSICO') || texto.includes('BASICO')) return `${numero}BASICO`;
  return texto.replace(/[^A-Z0-9]/g, '');
}

export function correoPersonalEsObligatorio(curso: string | null | undefined): boolean {
  return CORREO_PERSONAL_POR_NIVEL[nivelDesdeCurso(curso)] === 'obligatorio';
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function esCorreoValido(correo: string | null | undefined): boolean {
  return !!correo && RE_CORREO.test(correo.trim());
}

/**
 * Valida el correo personal del estudiante para un curso dado.
 * Devuelve un mensaje de error o null si es válido.
 */
export function validarCorreoPersonal(correo: string | null | undefined, curso: string | null | undefined): string | null {
  const valor = (correo || '').trim();
  if (!valor) {
    return correoPersonalEsObligatorio(curso)
      ? 'El correo personal del estudiante es obligatorio en 4° medio.'
      : null;
  }
  return esCorreoValido(valor) ? null : `El correo personal del estudiante no tiene un formato válido: "${valor}".`;
}

export function validarCorreoInstitucional(correo: string | null | undefined): string | null {
  const valor = (correo || '').trim();
  if (!valor) return null;
  return esCorreoValido(valor) ? null : `El correo institucional del estudiante no tiene un formato válido: "${valor}".`;
}
