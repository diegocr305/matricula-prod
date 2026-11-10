/**
 * Catálogo único de parentescos del apoderado (titular y suplente).
 *
 * ESPEJO de backend/parentescos.py: ambos deben mantenerse iguales.
 * No dejar listas de parentesco sueltas en componentes; usar SelectParentesco.
 */
export const PARENTESCOS = [
  'Madre',
  'Padre',
  'Abuelo Paterno',
  'Abuela Paterna',
  'Abuelo Materno',
  'Abuela Materna',
  'Tutor Legal Designado',
  'Otro',
] as const;

/** Parentesco que exige adjuntar la resolución de tutoría (solo apoderado titular). */
export const PARENTESCO_REQUIERE_DOCUMENTO = 'Tutor Legal Designado';

/** Coincidencia exacta con el catálogo (sin normalizar, para no ocultar variantes históricas). */
export function esParentescoDelCatalogo(valor: string | null | undefined): boolean {
  return (PARENTESCOS as readonly string[]).includes(valor ?? '');
}

/**
 * Misma regla que el backend (validar_parentesco):
 *  - vacío -> válido (el parentesco no es obligatorio hoy)
 *  - del catálogo -> válido
 *  - idéntico al valor histórico ya guardado -> válido (no se sobrescribe)
 *  - otro valor -> inválido
 * Devuelve un mensaje de error o null si es válido.
 */
export function validarParentesco(
  valor: string | null | undefined,
  valorOriginal?: string | null,
  etiqueta = 'Parentesco',
): string | null {
  if (!valor || valor.trim() === '') return null;
  if (esParentescoDelCatalogo(valor)) return null;
  if (valorOriginal && valor === valorOriginal) return null;
  return `${etiqueta} no válido: "${valor}". Seleccione una de las opciones del catálogo.`;
}
