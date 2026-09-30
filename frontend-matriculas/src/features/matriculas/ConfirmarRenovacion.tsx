import { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { UserCheck, Home, HeartPulse, Loader2, AlertTriangle, ChevronLeft } from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { ModalExito } from './components/ModalExito';

// Pantalla de "Confirmar Renovación" (Opcion A del piloto):
// El apoderado viene presencialmente, el funcionario ACTUALIZA sus datos y los del
// estudiante (obligatorio, para georreferenciar), la ficha medica (opcional), y al
// confirmar la matricula 2027 pre-creada pasa a "Pendiente firma" y se muestra el QR
// para que el apoderado firme en SIMPLE con Clave Unica.

interface DomicilioForm {
  calle: string;
  numero: string;
  sector: string;
  comuna: string;
}

interface ApoderadoForm extends DomicilioForm {
  rut: string;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  telefono: string;
  correo: string;
  relacion: string;
}

interface SaludForm {
  sistema_salud: string;
  letra_fonasa: string;
  cesfam: string;
  centro_emergencia: string;
  alergias: string;
  diagnostico_medico: string;
  medico_tratante: string;
  medicamento: string;
  nee: string;
  nee_tipo: string;
}

const domicilioVacio: DomicilioForm = { calle: '', numero: '', sector: '', comuna: '' };
const apoderadoVacio: ApoderadoForm = {
  ...domicilioVacio, rut: '', nombres: '', apellido_paterno: '', apellido_materno: '',
  telefono: '', correo: '', relacion: 'Madre',
};
const saludVacia: SaludForm = {
  sistema_salud: 'FONASA', letra_fonasa: 'A', cesfam: '', centro_emergencia: '',
  alergias: '', diagnostico_medico: 'No', medico_tratante: '', medicamento: '',
  nee: 'No', nee_tipo: 'No aplica',
};

export default function ConfirmarRenovacion() {
  const { idMatricula } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const stateNav = (location.state || {}) as { rut?: string; curso?: string; anio?: number | string };

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombreEstudiante, setNombreEstudiante] = useState('');
  const [rutEstudiante, setRutEstudiante] = useState(stateNav.rut || '');
  const [curso] = useState(stateNav.curso || '');
  const [anio, setAnio] = useState<number | string>(stateNav.anio || '');

  const [domEstudiante, setDomEstudiante] = useState<DomicilioForm>(domicilioVacio);
  const [apoderado, setApoderado] = useState<ApoderadoForm>(apoderadoVacio);
  const [salud, setSalud] = useState<SaludForm>(saludVacia);
  const [actualizarSalud, setActualizarSalud] = useState(false);

  const [modalQR, setModalQR] = useState(false);
  const [datosQR, setDatosQR] = useState<{ rut: string; anio: string | number }>({ rut: '', anio: '' });

  const token = localStorage.getItem('token');
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // Carga la ficha del estudiante para prellenar.
  useEffect(() => {
    const rut = stateNav.rut;
    if (!rut) {
      setError('No se recibió el RUT del estudiante. Vuelva a la grilla e intente de nuevo.');
      setCargando(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/estudiante/${encodeURIComponent(rut)}`, { headers: authHeaders });
        if (!res.ok) throw new Error('No se pudo cargar la ficha del estudiante.');
        const data = await res.json();
        const p = data.personal || {};
        const a = data.apoderado || {};
        const s = data.salud;

        setNombreEstudiante(`${p.nombres || ''} ${p.apellidos || ''}`.trim());
        setRutEstudiante(p.run || rut);
        setDomEstudiante({
          calle: p.calle || '', numero: p.numero || '', sector: p.sector || '', comuna: p.comuna || '',
        });
        setApoderado({
          rut: a.rut_raw || a.rut || '',
          nombres: a.nombres || '',
          apellido_paterno: a.apellido_paterno || '',
          apellido_materno: a.apellido_materno || '',
          telefono: a.telefono_raw || (a.telefono !== '-' ? a.telefono : '') || '',
          correo: a.correo_raw || (a.correo !== '-' ? a.correo : '') || '',
          relacion: a.relacion || 'Madre',
          calle: a.calle || '', numero: a.numero || '', sector: a.sector || '', comuna: a.comuna || '',
        });
        if (s) {
          setSalud({
            sistema_salud: s.sistema_salud || 'FONASA',
            letra_fonasa: s.letra_fonasa || 'A',
            cesfam: s.cesfam || '',
            centro_emergencia: s.centro_emergencia || '',
            alergias: s.alergias || '',
            diagnostico_medico: s.diagnostico_medico || 'No',
            medico_tratante: s.medico_tratante || '',
            medicamento: s.medicamento || '',
            nee: s.nee || 'No',
            nee_tipo: s.nee_tipo || 'No aplica',
          });
        }
      } catch (e: any) {
        setError(e.message || 'Error cargando la ficha.');
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validacion: domicilio estudiante y apoderado (obligatorios para georreferenciar y firmar).
  const validar = (): string | null => {
    if (!domEstudiante.calle.trim() || !domEstudiante.numero.trim() || !domEstudiante.comuna.trim()) {
      return 'Complete el domicilio del estudiante: calle, número y comuna son obligatorios.';
    }
    if (!apoderado.rut.trim()) return 'Ingrese el RUT del apoderado.';
    if (!apoderado.nombres.trim() || !apoderado.apellido_paterno.trim()) {
      return 'Complete nombres y apellido paterno del apoderado.';
    }
    if (!apoderado.telefono.trim()) return 'Ingrese el teléfono del apoderado.';
    if (!apoderado.correo.trim()) return 'Ingrese el correo del apoderado.';
    if (!apoderado.calle.trim() || !apoderado.numero.trim() || !apoderado.comuna.trim()) {
      return 'Complete el domicilio del apoderado: calle, número y comuna son obligatorios.';
    }
    return null;
  };

  const handleConfirmar = async () => {
    const errValidacion = validar();
    if (errValidacion) { setError(errValidacion); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setError(null);
    setGuardando(true);
    try {
      // 1) Guardar datos de estudiante + apoderado (+ ficha médica si se marcó).
      const body: Record<string, unknown> = {
        // Domicilio estudiante (desglosado)
        calle: domEstudiante.calle, numero: domEstudiante.numero,
        sector: domEstudiante.sector, comuna: domEstudiante.comuna,
        // Apoderado titular
        rut_apoderado: apoderado.rut,
        nombres_apoderado: apoderado.nombres,
        apellido_paterno_apoderado: apoderado.apellido_paterno,
        apellido_materno_apoderado: apoderado.apellido_materno,
        telefono_apoderado: apoderado.telefono,
        correo_apoderado: apoderado.correo,
        relacion_apoderado: apoderado.relacion,
        calle_apoderado: apoderado.calle, numero_apoderado: apoderado.numero,
        sector_apoderado: apoderado.sector, comuna_apoderado: apoderado.comuna,
      };
      if (actualizarSalud) {
        body.actualizar_salud = true;
        Object.assign(body, salud);
      }
      const resGuardar = await fetch(`${API_BASE_URL}/estudiante/${encodeURIComponent(rutEstudiante)}`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(body),
      });
      if (!resGuardar.ok) {
        const err = await resGuardar.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudieron guardar los datos.');
      }

      // 2) Confirmar la renovación -> pasa a 'Pendiente firma'.
      const resConf = await fetch(`${API_BASE_URL}/matriculas/${idMatricula}/confirmar-renovacion`, {
        method: 'PUT', headers: authHeaders,
      });
      if (!resConf.ok) {
        const err = await resConf.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo confirmar la renovación.');
      }
      const conf = await resConf.json();
      setDatosQR({ rut: conf.rut_alumno || rutEstudiante, anio: conf.anio_escolar || anio });
      setAnio(conf.anio_escolar || anio);
      setModalQR(true);
    } catch (e: any) {
      setError(e.message || 'Error al confirmar la renovación.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setGuardando(false);
    }
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-bold text-gray-600 mb-1';

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin mr-2" /> Cargando ficha del estudiante...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <button onClick={() => navigate('/matriculas')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft size={16} /> Volver a Matrículas
      </button>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-black text-gray-900">Confirmar Renovación de Matrícula</h1>
        <p className="text-sm text-gray-500 mt-1">
          Actualice los datos con el apoderado presente. Al confirmar, se enviará a firma con Clave Única.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <span className="px-3 py-1 bg-gray-100 rounded-lg"><strong>Estudiante:</strong> {nombreEstudiante || '—'}</span>
          <span className="px-3 py-1 bg-gray-100 rounded-lg"><strong>RUT:</strong> {rutEstudiante}</span>
          {curso && <span className="px-3 py-1 bg-blue-50 text-blue-800 rounded-lg"><strong>Curso {anio}:</strong> {curso}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 flex items-start gap-2 text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" /> <p>{error}</p>
        </div>
      )}

      {/* Domicilio del estudiante */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <Home className="text-blue-600" size={20} />
          <h2 className="text-lg font-bold text-gray-800">Domicilio del Estudiante <span className="text-red-500">*</span></h2>
        </div>
        <p className="text-xs text-gray-500">Obligatorio para la georreferenciación del estudiante.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Calle <span className="text-red-500">*</span></label>
            <input className={inputCls} value={domEstudiante.calle} onChange={(e) => setDomEstudiante({ ...domEstudiante, calle: e.target.value })} placeholder="Ej: Av. Argentina" />
          </div>
          <div>
            <label className={labelCls}>Número <span className="text-red-500">*</span></label>
            <input className={inputCls} value={domEstudiante.numero} onChange={(e) => setDomEstudiante({ ...domEstudiante, numero: e.target.value })} placeholder="Ej: 1234, Depto 5" />
          </div>
          <div>
            <label className={labelCls}>Sector / Cerro</label>
            <input className={inputCls} value={domEstudiante.sector} onChange={(e) => setDomEstudiante({ ...domEstudiante, sector: e.target.value })} placeholder="Ej: Cerro Alegre" />
          </div>
          <div>
            <label className={labelCls}>Comuna <span className="text-red-500">*</span></label>
            <input className={inputCls} value={domEstudiante.comuna} onChange={(e) => setDomEstudiante({ ...domEstudiante, comuna: e.target.value })} placeholder="Ej: Valparaíso" />
          </div>
        </div>
      </div>

      {/* Apoderado titular */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <UserCheck className="text-emerald-600" size={20} />
          <h2 className="text-lg font-bold text-gray-800">Apoderado Titular <span className="text-red-500">*</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>RUT <span className="text-red-500">*</span></label>
            <input className={inputCls} value={apoderado.rut} onChange={(e) => setApoderado({ ...apoderado, rut: e.target.value })} placeholder="12.345.678-9 o 123456789" />
          </div>
          <div>
            <label className={labelCls}>Parentesco</label>
            <select className={inputCls} value={apoderado.relacion} onChange={(e) => setApoderado({ ...apoderado, relacion: e.target.value })}>
              <option>Madre</option><option>Padre</option><option>Abuelo/a</option>
              <option>Tutor Legal</option><option>Otro</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Nombres <span className="text-red-500">*</span></label>
            <input className={inputCls} value={apoderado.nombres} onChange={(e) => setApoderado({ ...apoderado, nombres: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Apellido Paterno <span className="text-red-500">*</span></label>
            <input className={inputCls} value={apoderado.apellido_paterno} onChange={(e) => setApoderado({ ...apoderado, apellido_paterno: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Apellido Materno</label>
            <input className={inputCls} value={apoderado.apellido_materno} onChange={(e) => setApoderado({ ...apoderado, apellido_materno: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Teléfono <span className="text-red-500">*</span></label>
            <input className={inputCls} value={apoderado.telefono} onChange={(e) => setApoderado({ ...apoderado, telefono: e.target.value })} placeholder="+56 9 ..." />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Correo Electrónico <span className="text-red-500">*</span></label>
            <input className={inputCls} type="email" value={apoderado.correo} onChange={(e) => setApoderado({ ...apoderado, correo: e.target.value })} placeholder="correo@ejemplo.com" />
          </div>
        </div>

        {/* Domicilio del apoderado (desglosado, no una línea) */}
        <div className="pt-2">
          <h3 className="text-sm font-bold text-emerald-800 mb-2">Domicilio del Apoderado <span className="text-red-500">*</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Calle <span className="text-red-500">*</span></label>
              <input className={inputCls} value={apoderado.calle} onChange={(e) => setApoderado({ ...apoderado, calle: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Número <span className="text-red-500">*</span></label>
              <input className={inputCls} value={apoderado.numero} onChange={(e) => setApoderado({ ...apoderado, numero: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Sector / Cerro</label>
              <input className={inputCls} value={apoderado.sector} onChange={(e) => setApoderado({ ...apoderado, sector: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Comuna <span className="text-red-500">*</span></label>
              <input className={inputCls} value={apoderado.comuna} onChange={(e) => setApoderado({ ...apoderado, comuna: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      {/* Ficha médica (opcional) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <HeartPulse className="text-rose-600" size={20} />
            <h2 className="text-lg font-bold text-gray-800">Ficha Médica <span className="text-gray-400 text-sm font-normal">(opcional)</span></h2>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={actualizarSalud} onChange={(e) => setActualizarSalud(e.target.checked)} className="w-4 h-4" />
            Actualizar ficha médica
          </label>
        </div>
        {actualizarSalud && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Sistema de Salud</label>
              <select className={inputCls} value={salud.sistema_salud} onChange={(e) => setSalud({ ...salud, sistema_salud: e.target.value })}>
                <option>FONASA</option><option>ISAPRE</option><option>Ninguno</option><option>Otro</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Tramo FONASA</label>
              <input className={inputCls} value={salud.letra_fonasa} onChange={(e) => setSalud({ ...salud, letra_fonasa: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>CESFAM</label>
              <input className={inputCls} value={salud.cesfam} onChange={(e) => setSalud({ ...salud, cesfam: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Centro de Emergencia</label>
              <input className={inputCls} value={salud.centro_emergencia} onChange={(e) => setSalud({ ...salud, centro_emergencia: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Alergias</label>
              <input className={inputCls} value={salud.alergias} onChange={(e) => setSalud({ ...salud, alergias: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Diagnóstico / Medicamentos</label>
              <input className={inputCls} value={salud.medicamento} onChange={(e) => setSalud({ ...salud, medicamento: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {/* Acción final */}
      <div className="flex justify-end gap-3">
        <button onClick={() => navigate('/matriculas')} className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-bold hover:bg-gray-50">
          Cancelar
        </button>
        <button
          onClick={handleConfirmar}
          disabled={guardando}
          className="flex items-center gap-2 px-8 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-black shadow-md disabled:opacity-50"
        >
          {guardando ? (<><Loader2 className="animate-spin" size={18} /> Guardando...</>) : 'Confirmar y Enviar a Firma'}
        </button>
      </div>

      <ModalExito
        isOpen={modalQR}
        metodoFirma="Digital"
        generarComprobantePDF={() => {}}
        onVolver={() => navigate('/matriculas')}
        rutAlumno={datosQR.rut}
        anioEscolar={datosQR.anio}
      />
    </div>
  );
}
