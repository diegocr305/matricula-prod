import { useEffect, useState } from 'react';
import { BookOpen, Download, Loader2, X } from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';

interface OpcionesFiltro {
  anios: number[];
  cursos: string[];
  planes: { codigo: number; descripcion: string }[];
  cursos_por_plan: Record<string, string[]>;
  niveles?: string[];
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  colegioSeleccionado: string; // '' = toda la red (solo nivel central)
}

/**
 * Descarga del Libro / Registro General de Matrícula (contenido mínimo Res. Exenta
 * 0030/2021, punto 5.2) en PDF o Excel. El archivo se genera en el backend, que
 * aplica los permisos del usuario y registra la exportación en auditoría.
 */
export default function ModalLibroMatricula({ abierto, onCerrar, colegioSeleccionado }: Props) {
  const [opciones, setOpciones] = useState<OpcionesFiltro>({ anios: [], cursos: [], planes: [], cursos_por_plan: {}, niveles: [] });
  const [cargandoOpciones, setCargandoOpciones] = useState(false);
  const [anio, setAnio] = useState('');
  const [nivel, setNivel] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [curso, setCurso] = useState('');
  const [incluirPendientes, setIncluirPendientes] = useState(false);
  const [formato, setFormato] = useState<'pdf' | 'xlsx'>('pdf');
  const [descargando, setDescargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setCargandoOpciones(true);
    setErrorMsg('');
    const token = localStorage.getItem('token');
    const url = `${API_BASE_URL}/matriculas/opciones-filtro${colegioSeleccionado ? `?establecimiento_id=${colegioSeleccionado}` : ''}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error('No se pudieron cargar los filtros.'); return r.json(); })
      .then((data: OpcionesFiltro) => {
        setOpciones(data);
        if (data.anios?.length) setAnio(String(data.anios[0]));
      })
      .catch((e) => setErrorMsg(e.message))
      .finally(() => setCargandoOpciones(false));
  }, [abierto, colegioSeleccionado]);

  const cursosDisponibles = modalidad ? (opciones.cursos_por_plan[modalidad] ?? []) : opciones.cursos;

  const descargar = async () => {
    setDescargando(true);
    setErrorMsg('');
    try {
      const params = new URLSearchParams({ formato });
      if (colegioSeleccionado) params.set('establecimiento_id', colegioSeleccionado);
      if (anio) params.set('anio', anio);
      if (nivel) params.set('nivel', nivel);
      if (modalidad) params.set('modalidad', modalidad);
      if (curso) params.set('curso', curso);
      if (incluirPendientes) params.set('incluir_pendientes', 'true');

      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE_URL}/matriculas/libro?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(typeof err.detail === 'string' ? err.detail : 'No se pudo generar el libro de matrícula.');
      }
      const blob = await resp.blob();
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      const partes = ['Libro_Matricula', anio || 'todos', curso ? curso.replace(/\s+/g, '_') : ''].filter(Boolean);
      enlace.download = `${partes.join('_')}.${formato}`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(enlace.href);
      onCerrar();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setDescargando(false);
    }
  };

  if (!abierto) return null;

  const selectCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none bg-white';
  const labelCls = 'block text-xs text-gray-600 font-semibold mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-libro">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-[#25306B]">
          <div className="flex items-center gap-3 text-white">
            <BookOpen size={22} />
            <h2 id="titulo-libro" className="text-lg font-bold">Libro de Matrícula</h2>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-white/70 hover:text-white rounded-lg p-1">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-500">
            Registro con el contenido mínimo de la Resolución Exenta N° 0030/2021 (punto 5.2). No incluye datos de salud.
          </p>

          {cargandoOpciones ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-500 text-sm">
              <Loader2 size={20} className="animate-spin text-blue-600" /> Cargando filtros...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="libro-anio" className={labelCls}>Año académico</label>
                  <select id="libro-anio" value={anio} onChange={(e) => setAnio(e.target.value)} className={selectCls}>
                    <option value="">Todos los años</option>
                    {opciones.anios.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="libro-nivel" className={labelCls}>Nivel</label>
                  <select id="libro-nivel" value={nivel} onChange={(e) => setNivel(e.target.value)} className={selectCls}>
                    <option value="">Todos los niveles</option>
                    {(opciones.niveles ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="libro-modalidad" className={labelCls}>Modalidad / plan</label>
                  <select id="libro-modalidad" value={modalidad} onChange={(e) => { setModalidad(e.target.value); setCurso(''); }} className={selectCls}>
                    <option value="">Todas</option>
                    {opciones.planes.map((p) => <option key={p.codigo} value={p.codigo}>[{p.codigo}] {p.descripcion}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="libro-curso" className={labelCls}>Curso</label>
                  <select id="libro-curso" value={curso} onChange={(e) => setCurso(e.target.value)} className={selectCls}>
                    <option value="">Todos los cursos</option>
                    {cursosDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend className={labelCls}>Formato</legend>
                <div className="flex gap-3">
                  {(['pdf', 'xlsx'] as const).map((f) => (
                    <label key={f} className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium ${formato === f ? 'border-[#006BB9] bg-blue-50 text-[#25306B]' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" name="libro-formato" value={f} checked={formato === f} onChange={() => setFormato(f)} className="accent-[#006BB9]" />
                      {f === 'pdf' ? 'PDF' : 'Excel'}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={incluirPendientes} onChange={(e) => setIncluirPendientes(e.target.checked)} className="mt-0.5" />
                Incluir pre-matrículas aún no confirmadas ("Por renovar" / "Pendiente firma").
              </label>

              {!colegioSeleccionado && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Sin establecimiento seleccionado se exporta toda la red. El PDF admite hasta 15.000 registros; para más, filtre o use Excel.
                </p>
              )}
            </>
          )}

          {errorMsg && (
            <p role="alert" className="text-xs text-red-700 font-medium bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onCerrar} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={descargar}
            disabled={descargando || cargandoOpciones}
            className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-[#25306B] hover:bg-[#1d2650] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg"
          >
            {descargando ? <><Loader2 size={15} className="animate-spin" /> Generando...</> : <><Download size={15} /> Descargar libro</>}
          </button>
        </div>
      </div>
    </div>
  );
}
