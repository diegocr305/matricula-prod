import type { SelectHTMLAttributes } from 'react';
import { PARENTESCOS, esParentescoDelCatalogo } from '../config/parentescos';

interface SelectParentescoProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Texto de la opción vacía. Si se omite, no se muestra opción vacía. */
  placeholder?: string;
}

/**
 * Selector de parentesco compartido por apoderado titular y suplente.
 *
 * Compatibilidad con datos históricos: si el valor actual NO está en el catálogo
 * (por ejemplo "Apoderado Titular", "Papá" o texto libre antiguo), se muestra tal cual
 * como una opción adicional para que la ficha pueda abrirse y guardarse sin perder ni
 * cambiar ese dato. Nunca se reemplaza automáticamente.
 */
export default function SelectParentesco({ value, placeholder, ...rest }: SelectParentescoProps) {
  const actual = value == null ? '' : String(value);
  const esHistorico = actual.trim() !== '' && !esParentescoDelCatalogo(actual);

  return (
    <select value={actual} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {esHistorico && <option value={actual}>{actual.trim()}</option>}
      {PARENTESCOS.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}
