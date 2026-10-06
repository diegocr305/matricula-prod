// utils/gradeHierarchy.ts
/**
 * Determina el rango jerárquico numérico de un curso en el sistema educativo chileno.
 * Permite validar que un alumno no retroceda a un nivel inferior y detectar repitencia / promoción.
 * 
 * - Parvularia: 10 a 50
 * - Básica: 101 a 108 (Adultos: 104, 106, 108)
 * - Media: 201 a 204 (Adultos: 202, 204)
 * - Especial / Laboral: 250+
 */
export const obtenerRangoCurso = (cursoStr?: string, nivelStr?: string, codGrado?: number): number => {
  if (!cursoStr) return 0;
  const c = cursoStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const n = (nivelStr || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // 1. Parvularia
  if (c.includes('sala cuna')) return 10;
  if (c.includes('medio menor')) return 20;
  if (c.includes('medio mayor')) return 30;
  if (c.includes('pre-kinder') || c.includes('prekinder') || c.includes('1er nivel de transicion') || c.includes('1er nivel transicion')) return 40;
  if (c.includes('kinder') || c.includes('2do nivel de transicion') || c.includes('2do nivel transicion')) return 50;
  if (n.includes('parvul') || n.includes('transicion')) return 40;

  // 2. Educacion Especial / Laboral
  if (c.includes('laboral') || c.includes('taller')) {
    const m = c.match(/\d+/);
    return 250 + (m ? parseInt(m[0]) : (codGrado || 1));
  }

  // 3. Adultos
  if (c.includes('1er nivel (1') || (c.includes('1er nivel') && c.includes('medio'))) return 202;
  if (c.includes('2do nivel (3') || (c.includes('2do nivel') && c.includes('medio'))) return 204;
  if (c.includes('3er nivel (4') || (c.includes('3er nivel') && c.includes('medio'))) return 204;
  if (c.includes('nivel basico 1')) return 104;
  if (c.includes('nivel basico 2')) return 106;
  if (c.includes('nivel basico 3')) return 108;

  // 4. Media regular
  if (c.includes('medio') || c.includes('media') || n.includes('media')) {
    const m = c.match(/\d+/);
    const grado = m ? parseInt(m[0]) : (codGrado || 1);
    return 200 + grado;
  }

  // 5. Basica regular
  if (c.includes('basico') || c.includes('basica') || n.includes('basica') || n.includes('basic')) {
    const m = c.match(/\d+/);
    const grado = m ? parseInt(m[0]) : (codGrado || 1);
    return 100 + grado;
  }

  if (codGrado) {
    if (n.includes('med')) return 200 + codGrado;
    if (n.includes('bas')) return 100 + codGrado;
    return 100 + codGrado;
  }

  return 0;
};
