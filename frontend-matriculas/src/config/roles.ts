/**
 * Catálogo central de roles del frontend — espejo de backend/roles.py.
 * FUENTE ÚNICA DE VERDAD para la visibilidad de pestañas/tarjetas por rol.
 *
 * Antes la visibilidad estaba repartida en listas sueltas (puedeVerAuditoria,
 * esPerfilGlobal, puedeEditar) con comparación exacta de mayúsculas, frágil ante
 * la mezcla histórica de capitalización en la BD (Colegio / COLEGIO / Director).
 * Aquí todo se compara NORMALIZADO.
 */

export type Pestana =
  | 'inicio'
  | 'matriculas'
  | 'estudiantes'
  | 'panel'       // /inicio -> Panel de Control
  | 'asistencia'
  | 'auditoria';

interface DefinicionRol {
  canonico: string;
  esSlep: boolean;     // nivel central: ve todos los establecimientos
  escribe: boolean;    // false = solo lectura (visualizador)
  pestanas: Pestana[];
  alias: string[];     // variantes normalizadas que aparecen en la BD/legado
}

const TODAS: Pestana[] = ['inicio', 'matriculas', 'estudiantes', 'panel', 'asistencia', 'auditoria'];

const norm = (rol?: string | null) => String(rol ?? '').trim().toLowerCase();

const ROLES: DefinicionRol[] = [
  {
    canonico: 'admin_slep',
    esSlep: true,
    escribe: true,
    pestanas: TODAS,
    alias: ['admin_slep', 'slep', 'admin'],
  },
  {
    canonico: 'Visualizador_SLEP',
    esSlep: true,
    escribe: false,
    pestanas: TODAS,
    alias: ['visualizador_slep', 'visualizador'],
  },
  {
    canonico: 'Colegio',
    esSlep: false,
    escribe: true,
    // Director / directivo: todo lo de su colegio (incluye Panel y Asistencia)
    pestanas: ['inicio', 'matriculas', 'estudiantes', 'panel', 'asistencia'],
    alias: ['colegio', 'director', 'establecimiento'],
  },
  {
    canonico: 'Matriculador',
    esSlep: false,
    escribe: true,
    // Solo el trabajo de matrícula: NO ve Panel ni Asistencia
    pestanas: ['inicio', 'matriculas', 'estudiantes'],
    alias: ['matriculador'],
  },
  {
    canonico: 'Visualizador_Colegio',
    esSlep: false,
    escribe: false,
    pestanas: ['inicio', 'matriculas', 'estudiantes', 'panel', 'asistencia'],
    alias: ['visualizador_colegio'],
  },
  {
    canonico: 'Docente_Jefe',
    esSlep: false,
    escribe: true,
    pestanas: ['inicio', 'matriculas', 'estudiantes'],
    alias: ['docente_jefe', 'profesor_jefe'],
  },
];

const INDICE: Record<string, DefinicionRol> = {};
for (const def of ROLES) {
  for (const a of def.alias) INDICE[norm(a)] = def;
}

const resolver = (rol?: string | null): DefinicionRol | undefined => INDICE[norm(rol)];

export const esRolValido = (rol?: string | null): boolean => !!resolver(rol);
export const esSlep = (rol?: string | null): boolean => !!resolver(rol)?.esSlep;
export const puedeEscribir = (rol?: string | null): boolean => !!resolver(rol)?.escribe;
export const puedeVerPestana = (rol: string | null | undefined, pestana: Pestana): boolean =>
  !!resolver(rol)?.pestanas.includes(pestana);

/** Lee el usuario guardado en localStorage y devuelve su rol (o null). */
export const rolActual = (): string | null => {
  try {
    const raw = localStorage.getItem('usuario');
    return raw ? (JSON.parse(raw)?.rol ?? null) : null;
  } catch {
    return null;
  }
};
