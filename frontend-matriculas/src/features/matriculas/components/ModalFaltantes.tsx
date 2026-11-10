import React from 'react';
import SelectParentesco from '../../../components/SelectParentesco';

interface ModalFaltantesProps {
  isOpen: boolean;
  onClose: () => void;
  estudiante: any;
  formFaltantes: any;
  handleFaltantesChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  guardarDatosFaltantes: (e: React.FormEvent) => void;
  guardandoFaltantes: boolean;
  copiarDomicilio: () => void;
}

export const ModalFaltantes: React.FC<ModalFaltantesProps> = ({
  isOpen,
  onClose,
  estudiante,
  formFaltantes,
  handleFaltantesChange,
  guardarDatosFaltantes,
  guardandoFaltantes,
  copiarDomicilio,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 animate-in zoom-in-95 duration-200">
        <div className="bg-[#25306B] p-5 text-white flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div>
            <h3 className="font-bold text-lg">Actualización de Antecedentes (Período 2026)</h3>
            <p className="text-xs text-blue-200 mt-0.5">
              Estudiante: {estudiante?.nombres} {estudiante?.apellidos} (RUT: {estudiante?.run})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-300 hover:text-white text-xl font-bold px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        <form onSubmit={guardarDatosFaltantes} className="p-6 space-y-6">
          {/* Sección Domicilio Estudiante */}
          <div>
            <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider mb-3 pb-1 border-b border-gray-200">
              1. Domicilio Actual del Estudiante
            </h4>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Dirección Completa (Calle, Número, Sector, Comuna) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="domicilio_estudiante"
                value={formFaltantes.domicilio_estudiante}
                onChange={handleFaltantesChange}
                required
                placeholder="Ej: Av. Argentina 1234, Cerro Barón, Valparaíso"
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
              />
            </div>
            <div className="mt-3">
              <label htmlFor="faltantes-correo-personal" className="block text-xs font-bold text-gray-700 mb-1">
                Correo personal del estudiante{' '}
                {formFaltantes.correo_personal_obligatorio
                  ? <span className="text-red-500">*</span>
                  : <span className="text-gray-400 font-normal">(opcional)</span>}
              </label>
              <input
                id="faltantes-correo-personal"
                type="email"
                name="correo_personal"
                value={formFaltantes.correo_personal || ''}
                onChange={handleFaltantesChange}
                required={Boolean(formFaltantes.correo_personal_obligatorio)}
                placeholder="correo.personal@ejemplo.com"
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Sección Apoderado Titular */}
          <div>
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
              <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">
                2. Datos del Apoderado Titular
              </h4>
              <button
                type="button"
                onClick={copiarDomicilio}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
              >
                Copiar Domicilio del Estudiante
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  RUT / Pasaporte Apoderado <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="rut_apoderado"
                  value={formFaltantes.rut_apoderado}
                  onChange={handleFaltantesChange}
                  required
                  placeholder="12345678-9"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Parentesco con el Estudiante <span className="text-red-500">*</span>
                </label>
                <SelectParentesco
                  name="relacion_apoderado"
                  value={formFaltantes.relacion_apoderado || 'Madre'}
                  onChange={handleFaltantesChange}
                  required
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nombres <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="nombres_apoderado"
                  value={formFaltantes.nombres_apoderado}
                  onChange={handleFaltantesChange}
                  required
                  placeholder="Nombres del apoderado"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Apellido Paterno <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="apellido_paterno_apoderado"
                  value={formFaltantes.apellido_paterno_apoderado}
                  onChange={handleFaltantesChange}
                  required
                  placeholder="Primer apellido"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Apellido Materno
                </label>
                <input
                  type="text"
                  name="apellido_materno_apoderado"
                  value={formFaltantes.apellido_materno_apoderado}
                  onChange={handleFaltantesChange}
                  placeholder="Segundo apellido (opcional)"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Teléfono de Contacto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="telefono_apoderado"
                  value={formFaltantes.telefono_apoderado}
                  onChange={handleFaltantesChange}
                  required
                  placeholder="+56 9 1234 5678"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Correo Electrónico <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="correo_apoderado"
                  value={formFaltantes.correo_apoderado}
                  onChange={handleFaltantesChange}
                  required
                  placeholder="correo@ejemplo.com"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Domicilio del Apoderado <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="domicilio_apoderado"
                  value={formFaltantes.domicilio_apoderado}
                  onChange={handleFaltantesChange}
                  required
                  placeholder="Dirección del apoderado"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Sección Apoderado Suplente (Opcional) */}
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center justify-between mb-3 pb-1 border-b border-gray-200">
              <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">
                3. Datos del Apoderado Suplente (Opcional)
              </h4>
              <label className="flex items-center gap-2 text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                <input
                  type="checkbox"
                  name="tiene_suplente"
                  checked={Boolean(formFaltantes.tiene_suplente)}
                  onChange={handleFaltantesChange}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                Registrar / Mantener Apoderado Suplente
              </label>
            </div>

            {formFaltantes.tiene_suplente ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200 animate-in fade-in">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    RUT / Pasaporte Suplente <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="rut_suplente"
                    value={formFaltantes.rut_suplente || ''}
                    onChange={handleFaltantesChange}
                    required={Boolean(formFaltantes.tiene_suplente)}
                    placeholder="12345678-9"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Parentesco Suplente
                  </label>
                  <SelectParentesco
                    name="relacion_suplente"
                    value={formFaltantes.relacion_suplente || ''}
                    onChange={handleFaltantesChange}
                    placeholder="Seleccione parentesco..."
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Nombres <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="nombres_suplente"
                    value={formFaltantes.nombres_suplente || ''}
                    onChange={handleFaltantesChange}
                    required={Boolean(formFaltantes.tiene_suplente)}
                    placeholder="Nombres del suplente"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Apellido Paterno <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="apellido_paterno_suplente"
                    value={formFaltantes.apellido_paterno_suplente || ''}
                    onChange={handleFaltantesChange}
                    required={Boolean(formFaltantes.tiene_suplente)}
                    placeholder="Primer apellido"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Apellido Materno
                  </label>
                  <input
                    type="text"
                    name="apellido_materno_suplente"
                    value={formFaltantes.apellido_materno_suplente || ''}
                    onChange={handleFaltantesChange}
                    placeholder="Segundo apellido (opcional)"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Teléfono Móvil <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="telefono_suplente"
                    value={formFaltantes.telefono_suplente || ''}
                    onChange={handleFaltantesChange}
                    required={Boolean(formFaltantes.tiene_suplente)}
                    placeholder="+56 9 1234 5678"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    name="correo_suplente"
                    value={formFaltantes.correo_suplente || ''}
                    onChange={handleFaltantesChange}
                    placeholder="correo@ejemplo.com (opcional)"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl border border-dashed border-gray-300 text-center text-xs text-gray-500 bg-gray-50">
                No se registrará un apoderado suplente para esta matrícula. Puede marcar la casilla superior si desea añadir uno.
              </div>
            )}
          </div>

          {/* Botones de pie */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoFaltantes}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors shadow-md disabled:opacity-50"
            >
              {guardandoFaltantes ? 'Guardando...' : 'Guardar y Validar Ficha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
